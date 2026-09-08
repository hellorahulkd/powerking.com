/**
 * ============================================================================
 *  SUPABASE CONFIGURATION — read at build time, written into the page
 * ============================================================================
 *
 *  ── WHAT IS AND IS NOT A SECRET ──────────────────────────────────────────
 *  The project URL and the anon key are not secrets. They are designed to be
 *  shipped to browsers: the anon key identifies the project and nothing else,
 *  and every row it can reach is decided by Row Level Security in Postgres,
 *  not by whoever holds the key. Publishing it is the intended use.
 *
 *  The service-role key is the opposite — it bypasses RLS entirely. It is not
 *  read here, is not written into any built file, and this project has no
 *  server that could hold one. If you ever find yourself needing it in the
 *  browser, the answer is a database function, not a wider key.
 *
 *  ── WHERE THE VALUES COME FROM ───────────────────────────────────────────
 *  Environment variables, checked under several names because the hosting
 *  platforms disagree. The Supabase integration for Vercel writes the
 *  NEXT_PUBLIC_ pair; GitHub Actions uses whatever the repository secrets are
 *  called. All of them mean the same thing, so all of them are accepted.
 *
 *  Locally, a .env file in the project root is read if one exists. It is
 *  gitignored and never copied into dist/.
 *
 *  ── WHEN NOTHING IS CONFIGURED ───────────────────────────────────────────
 *  The build does not fail. The public catalogue falls back to the JSON files
 *  it has always used, and /admin/ renders a page explaining what is missing.
 *  A site that cannot reach its database should still be a site.
 * ============================================================================
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

/**
 * Minimal .env reader. Not dotenv — this handles KEY=value, optional `export`,
 * comments, and single or double quotes, which is the whole of what a .env for
 * two variables ever contains.
 */
function readDotEnv() {
  const out = {};
  for (const name of ['.env.local', '.env']) {
    const file = path.join(ROOT, name);
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).replace(/^export\s+/, '').trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      // A real environment variable always wins over a file on disk.
      if (!(key in out)) out[key] = value;
    }
  }
  return out;
}

const dotEnv = readDotEnv();

/** First non-empty value among several possible variable names. */
function pick(...names) {
  for (const name of names) {
    const value = process.env[name] ?? dotEnv[name];
    if (value && String(value).trim()) return String(value).trim();
  }
  return '';
}

const url = pick(
  'SUPABASE_URL',
  'PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'VITE_SUPABASE_URL',
).replace(/\/+$/, '');

const anonKey = pick(
  'SUPABASE_ANON_KEY',
  'PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_ANON_KEY',
  // Newer Supabase projects call it a publishable key. Same thing, same
  // safety: it is the key that RLS is written against.
  'SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
);

/**
 * A service-role key must never reach a built file. If one has been set in the
 * environment — which is reasonable, a database backup script might need it —
 * the build refuses to treat it as the public key even if somebody has pasted
 * it into the wrong variable. Checked by shape: a service-role JWT carries
 * "service_role" in its payload.
 */
function looksLikeServiceRole(key) {
  const parts = String(key).split('.');
  if (parts.length !== 3) return /service[_-]?role/i.test(key);
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

export const serviceRoleKeyMisplaced = Boolean(anonKey) && looksLikeServiceRole(anonKey);

export const supabaseConfig = {
  url,
  anonKey: serviceRoleKeyMisplaced ? '' : anonKey,
  /** True when both halves are present and usable. */
  get configured() {
    return Boolean(this.url && this.anonKey);
  },
  /** Bucket that product photography lives in. Created by the migrations. */
  bucket: 'product-images',
};

/**
 * The module written to dist/assets/console/env.js. Only ever the two public
 * values — this function is the single place either of them is allowed to
 * leave the build, which makes it the single place to audit.
 */
export function envModule() {
  return `/* Generated by build.js. Do not edit.
 *
 * These two values are public by design: the anon key identifies the project,
 * and Row Level Security in Postgres decides what it may read. See
 * src/config/supabase.config.js. No service-role key is ever written here.
 */
export const SUPABASE_URL = ${JSON.stringify(supabaseConfig.url)};
export const SUPABASE_ANON_KEY = ${JSON.stringify(supabaseConfig.anonKey)};
export const SUPABASE_BUCKET = ${JSON.stringify(supabaseConfig.bucket)};
export const CONFIGURED = ${supabaseConfig.configured};
`;
}

export default supabaseConfig;
