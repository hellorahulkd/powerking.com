#!/usr/bin/env node
/**
 * ============================================================================
 *  LOCAL SUPABASE RIG — development and testing only
 * ============================================================================
 *  Stands up something the inventory console cannot tell apart from Supabase:
 *
 *    • a real PostgreSQL with the real migrations from supabase/migrations/
 *    • a real PostgREST serving /rest/v1/, so the RLS policies under test are
 *      the ones that ship, reached the way the browser reaches them
 *    • a small stand-in for GoTrue on /auth/v1/, issuing the same HS256 JWTs
 *      PostgREST verifies
 *    • the built site from dist/, on the same origin, so there is no CORS
 *      difference between here and production
 *
 *  It exists because "the policies look right" is not a test. Every screen in
 *  the console is driven against this by scripts/dev/console-test.js, signed
 *  in as each of the three roles in turn.
 *
 *  NOT FOR PRODUCTION. The auth stand-in issues tokens without any of the
 *  rate limiting, password policy or refresh-token rotation GoTrue does.
 *
 *      node scripts/dev/console-rig.js --port 4400
 * ============================================================================
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { createHmac, randomUUID, scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const DIST = path.join(ROOT, 'dist');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const PORT = Number(arg('port', 4400));
const PGRST_PORT = Number(arg('pgrst-port', 4401));
const DB = arg('db', 'pk_console');
const PGHOST = process.env.PGHOST || '/var/run/pgtest';
const PGPORT = process.env.PGPORT || '55432';
const PGRST_BIN = process.env.PGRST_BIN || '/var/lib/pgtest/bin/postgrest';
// 32 bytes minimum for HS256 in PostgREST. Random per run: a fixed one in a
// repository is a token anybody can mint.
const JWT_SECRET = randomBytes(32).toString('hex');

const psql = (sql, db = DB) =>
  execFileSync('psql', ['-U', 'postgres', '-h', PGHOST, '-p', PGPORT, '-tAq', '-v', 'ON_ERROR_STOP=1', '-c', sql, db], {
    encoding: 'utf8',
    env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' },
  }).trim();

/**
 * Run SQL as a signed-in user.
 *
 * A fixture cannot simply UPDATE profiles: the guard trigger refuses a role
 * or activation change from anybody who is not an admin, and a bare psql
 * session is nobody. Setting the claim the way PostgREST sets it makes the
 * fixture go through the same guards a person would, which is the point — a
 * fixture that has to bypass the rules is not testing the rules.
 *
 * One psql -c is one implicit transaction, so a transaction-local setting
 * made on the first line still applies on the second.
 */
const psqlAs = (email, sql, db = DB) =>
  psql(
    `select set_config('request.jwt.claim.sub',
       (select id::text from public.profiles where email = '${email.replace(/'/g, "''")}'), true);
     ${sql}`,
    db,
  );

const psqlFile = (file, db = DB) =>
  execFileSync('psql', ['-U', 'postgres', '-h', PGHOST, '-p', PGPORT, '-q', '-v', 'ON_ERROR_STOP=1', '-f', file, db], {
    encoding: 'utf8',
    env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' },
  });

/* ------------------------------------------------------------ passwords -- */

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString('hex')}`;
}

function checkPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(password, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ jwt -- */

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

function sign(claims) {
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64(claims);
  const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

/**
 * The anon key. In a real project this is a JWT with role "anon", signed with
 * the project's secret — which is why the browser can send it as a bearer
 * token and PostgREST accepts it as an unauthenticated caller. The rig mints
 * the same thing so that a signed-out request behaves identically here.
 */
export const anonKey = sign({ role: 'anon', iss: 'powerking-rig', iat: Math.floor(Date.now() / 1000), exp: 4102444800 });

/** An access token for a user, shaped the way Supabase shapes one. */
function accessToken(user, ttl = 3600) {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: sign({
      sub: user.id,
      email: user.email,
      role: 'authenticated',
      iat: now,
      exp: now + ttl,
      aud: 'authenticated',
    }),
    token_type: 'bearer',
    expires_in: ttl,
    expires_at: now + ttl,
    refresh_token: refreshFor(user.id),
    user: { id: user.id, email: user.email },
  };
}

// Refresh tokens are kept in memory; the rig is a single process per run.
const refreshTokens = new Map();
function refreshFor(userId) {
  const token = randomUUID().replace(/-/g, '');
  refreshTokens.set(token, userId);
  return token;
}

/* -------------------------------------------------------------- database -- */

export function resetDatabase({ seed = true, users = [] } = {}) {
  execFileSync('psql', ['-U', 'postgres', '-h', PGHOST, '-p', PGPORT, '-q',
    '-c', `drop database if exists ${DB} with (force)`,
    '-c', `create database ${DB}`, 'postgres'], { encoding: 'utf8' });

  psqlFile(path.join(ROOT, 'scripts/dev/supabase-shim.sql'));
  const migrations = execFileSync('bash', ['-c',
    `ls ${path.join(ROOT, 'supabase/migrations')}/*.sql`], { encoding: 'utf8' })
    .trim().split('\n');
  for (const file of migrations) psqlFile(file);
  if (seed) psqlFile(path.join(ROOT, 'supabase/seed/0001_catalogue_from_json.sql'));

  const made = [];
  for (const u of users) {
    const id = psql(
      `insert into auth.users (email, encrypted_password, raw_user_meta_data)
       values ('${u.email}', '${hashPassword(u.password)}',
               '${JSON.stringify({ full_name: u.name, role: u.role })}'::jsonb)
       returning id`);
    // The trigger makes the FIRST user an admin whatever the metadata says,
    // so the role is set explicitly afterwards for everybody.
    psql(`update public.profiles set role = '${u.role}' where id = '${id}'`);
    made.push({ ...u, id });
  }
  return made;
}

/* ------------------------------------------------------------- postgrest -- */

function startPostgrest() {
  // Configured entirely through the environment rather than a config file, so
  // there is no temporary file holding a JWT secret for the run's lifetime.
  const child = spawn(PGRST_BIN, [], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PGRST_DB_URI: `postgres://postgres@/${DB}?host=${PGHOST}&port=${PGPORT}`,
      PGRST_DB_SCHEMAS: 'public',
      PGRST_DB_ANON_ROLE: 'anon',
      PGRST_DB_EXTRA_SEARCH_PATH: 'public',
      PGRST_JWT_SECRET: JWT_SECRET,
      PGRST_SERVER_PORT: String(PGRST_PORT),
      PGRST_SERVER_HOST: '127.0.0.1',
      PGRST_LOG_LEVEL: 'error',
    },
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => {
    const text = String(d);
    if (!/Listening|Connection|Schema cache|Config re-?loaded/.test(text)) {
      process.stderr.write(`[pgrst] ${text}`);
    }
  });
  return child;
}

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

/* ------------------------------------------------------------------ auth -- */

async function handleAuth(req, res, url) {
  const body = await readBody(req);
  const json = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  if (url.pathname === '/auth/v1/token') {
    const grant = url.searchParams.get('grant_type');

    if (grant === 'password') {
      const email = String(body.email || '').trim().toLowerCase();
      const row = psql(
        `select id || '|' || coalesce(encrypted_password, '') from auth.users where lower(email) = '${email.replace(/'/g, "''")}'`);
      if (!row) return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      const [id, hash] = row.split('|');
      if (!checkPassword(body.password, hash)) {
        return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      }
      return json(200, accessToken({ id, email }));
    }

    if (grant === 'refresh_token') {
      const userId = refreshTokens.get(body.refresh_token);
      if (!userId) return json(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
      refreshTokens.delete(body.refresh_token);      // rotated, as GoTrue does
      const email = psql(`select email from auth.users where id = '${userId}'`);
      return json(200, accessToken({ id: userId, email }));
    }

    return json(400, { error: 'unsupported_grant_type' });
  }

  if (url.pathname === '/auth/v1/logout') {
    res.writeHead(204);
    return res.end();
  }

  return json(404, { message: 'not found' });
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

/* ----------------------------------------------------------------- proxy -- */

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
};

async function serveStatic(req, res, url) {
  let file = path.join(DIST, path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = path.join(file, 'index.html');
  } catch {
    file = path.join(DIST, '404.html');
  }
  try {
    const body = await readFile(file);
    res.writeHead(file.endsWith('404.html') ? 404 : 200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

async function proxyToPostgrest(req, res, url) {
  const target = `http://127.0.0.1:${PGRST_PORT}${url.pathname.replace('/rest/v1', '')}${url.search}`;
  const headers = { ...req.headers };
  delete headers.host;
  delete headers['accept-encoding'];
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await rawBody(req);
  try {
    const upstream = await fetch(target, { method: req.method, headers, body });
    const out = Object.fromEntries(upstream.headers.entries());
    delete out['content-encoding'];
    delete out['content-length'];
    res.writeHead(upstream.status, out);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: String(err) }));
  }
}

function rawBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/* ------------------------------------------------------------------ main -- */

export async function startRig({ users, seed = true, quiet = false } = {}) {
  const made = resetDatabase({ seed, users });
  const pgrst = startPostgrest();
  const ready = await waitFor(`http://127.0.0.1:${PGRST_PORT}/`);
  if (!ready) {
    pgrst.kill();
    throw new Error('PostgREST did not start');
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname.startsWith('/auth/v1/')) return handleAuth(req, res, url);
    if (url.pathname.startsWith('/rest/v1/')) return proxyToPostgrest(req, res, url);
    return serveStatic(req, res, url);
  });

  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  if (!quiet) {
    process.stdout.write(
      `\n  Rig on http://127.0.0.1:${PORT}\n  database: ${DB}\n\n` +
      `  Build the site against it with:\n` +
      `    SUPABASE_URL=http://127.0.0.1:${PORT} SUPABASE_ANON_KEY=${anonKey} node build.js\n\n`,
    );
  }

  return {
    url: `http://127.0.0.1:${PORT}`,
    anonKey,
    users: made,
    psql,
    psqlAs,
    async stop() {
      pgrst.kill('SIGTERM');
      await new Promise((r) => server.close(r));
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startRig({
    users: [
      { email: 'admin@powerking.test',   password: 'admin-password-1',   name: 'Ama Admin',    role: 'admin' },
      { email: 'manager@powerking.test', password: 'manager-password-1', name: 'Mira Manager', role: 'manager' },
      { email: 'staff@powerking.test',   password: 'staff-password-1',   name: 'Sita Staff',   role: 'staff' },
    ],
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
