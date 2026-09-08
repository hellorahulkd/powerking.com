/**
 * ============================================================================
 *  SUPABASE CLIENT — PowerKing inventory console
 * ============================================================================
 *
 *  ── WHY THIS EXISTS INSTEAD OF @supabase/supabase-js ─────────────────────
 *  This site has no build step, no bundler and no node_modules, and it ships
 *  self-hosted fonts and comment-stripped CSS because a shopper in Kathmandu
 *  is paying for every kilobyte. The official client is about 120 KB and
 *  would have to come from a CDN on every admin page load.
 *
 *  Everything this system needs from it is three REST APIs that Supabase
 *  documents and keeps stable:
 *
 *    GoTrue     /auth/v1/…      sign in, refresh, sign out
 *    PostgREST  /rest/v1/…      select, insert, update, rpc
 *    Storage    /storage/v1/…   upload an image
 *
 *  So this is roughly four hundred lines instead of a dependency, and it
 *  fails in ways this application can explain to a member of staff rather
 *  than in ways a library invented.
 *
 *  ── WHAT IT DOES NOT DO ──────────────────────────────────────────────────
 *  No realtime, no magic links, no OAuth providers, no server-side rendering
 *  helpers. If any of those are wanted later, adding the official client for
 *  that one page is a smaller change than pretending this file covers them.
 * ============================================================================
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_BUCKET, CONFIGURED } from './env.js';

export { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_BUCKET, CONFIGURED };

/** Where the session is kept between page loads. */
const STORAGE_KEY = 'pk.session.v1';

/* ------------------------------------------------------------- errors ---- */

/**
 * Every failure in this application is one of these. `code` is a stable
 * machine-readable string the screens can branch on; `message` is already
 * written for a person to read.
 *
 * A raw Postgres error never reaches the interface: it is mapped below, and
 * anything unrecognised becomes a generic message with the original kept in
 * `detail` for the console. That is business requirement 26 — useful
 * technical detail logged safely, nothing raw on screen.
 */
export class AppError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Turn whatever came back into an AppError.
 *
 * The PK_ prefixed messages are raised deliberately by the database functions
 * in supabase/migrations/. Their text after the colon is already written for
 * a human, so it is used as-is; the prefix is only there so this function can
 * tell a designed refusal from an accident.
 */
export function toAppError(err, fallback = 'Something went wrong. Please try again.') {
  if (err instanceof AppError) return err;

  const raw = typeof err === 'string' ? err : err?.message || err?.msg || err?.error_description || '';
  const pk = /\bPK_([A-Z_]+):\s*(.*)/.exec(raw);
  if (pk) {
    const message = pk[2].trim();
    return new AppError(pk[1], message.charAt(0).toUpperCase() + message.slice(1), raw);
  }

  // Postgres codes that reach us despite the functions above, usually from a
  // direct table write rather than an RPC.
  const pgCode = err?.code;
  const byPgCode = {
    '23505': ['DUPLICATE', 'That already exists. Check the SKU and the web address.'],
    '23503': ['BAD_REFERENCE', 'Something this refers to no longer exists. Reload and try again.'],
    '23514': ['CHECK_FAILED', 'One of the values is not allowed. Check the numbers on the form.'],
    '42501': ['FORBIDDEN', 'You do not have permission to do that.'],
    'PGRST301': ['SESSION_EXPIRED', 'Your session has expired. Please sign in again.'],
    'PGRST116': ['NOT_FOUND', 'That record could not be found.'],
  };
  if (byPgCode[pgCode]) {
    const [code, message] = byPgCode[pgCode];
    return new AppError(code, message, raw);
  }

  if (err?.name === 'TypeError' || /fetch|network|Failed to fetch/i.test(raw)) {
    return new AppError(
      'NETWORK',
      'Could not reach the database. Check the internet connection and try again.',
      raw,
    );
  }

  // Keep the technical text where a developer can find it, off the screen.
  if (raw) console.error('[powerking]', raw, err);
  return new AppError('UNKNOWN', fallback, raw);
}

/* ------------------------------------------------------------ session ---- */

let session = null;
const listeners = new Set();

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Private browsing, or storage disabled. Sign-in still works; it just
    // will not survive a reload.
    return null;
  }
}

function saveSession(next) {
  session = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do — see loadSession */
  }
  for (const fn of listeners) fn(next);
}

export function onSessionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSession() {
  if (session === null) session = loadSession();
  return session;
}

/** Seconds of headroom before expiry at which a token is refreshed early. */
const REFRESH_MARGIN = 60;

let refreshing = null;

/**
 * The current access token, refreshed first if it is about to expire.
 *
 * Concurrent callers share one refresh: a dashboard fires five requests at
 * once on load, and five parallel refreshes would have four of them racing to
 * use a refresh token that the first one has already rotated away.
 */
async function accessToken() {
  const current = getSession();
  if (!current) return null;

  const expiresAt = Number(current.expires_at || 0);
  if (expiresAt && expiresAt - REFRESH_MARGIN > Date.now() / 1000) return current.access_token;

  if (!refreshing) {
    refreshing = refreshSession(current.refresh_token).finally(() => {
      refreshing = null;
    });
  }
  const next = await refreshing;
  return next?.access_token ?? null;
}

async function refreshSession(refreshToken) {
  if (!refreshToken) {
    saveSession(null);
    return null;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      // The refresh token is spent or revoked; there is nothing to recover.
      saveSession(null);
      return null;
    }
    const data = await res.json();
    saveSession(normaliseSession(data));
    return getSession();
  } catch {
    // A network failure is not a signed-out user. Keep the session and let
    // the caller's request fail with a network error it can retry.
    return getSession();
  }
}

function normaliseSession(data) {
  const expiresAt =
    data.expires_at ?? Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
    user: data.user ? { id: data.user.id, email: data.user.email } : getSession()?.user ?? null,
  };
}

/* --------------------------------------------------------------- auth ---- */

/**
 * Sign in with an email and a password.
 *
 * Supabase deliberately gives the same answer for a wrong password and an
 * email that does not exist, so that the form cannot be used to find out who
 * has an account. This keeps that property rather than trying to be more
 * helpful than is safe.
 */
export async function signIn(email, password) {
  requireConfigured();
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: String(email).trim(), password }),
    });
  } catch (err) {
    throw toAppError(err);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = String(data.error_description || data.msg || data.message || '');
    if (/email not confirmed/i.test(reason)) {
      throw new AppError('EMAIL_UNCONFIRMED', 'This email address has not been confirmed yet.');
    }
    if (res.status === 429 || /rate limit/i.test(reason)) {
      throw new AppError('RATE_LIMIT', 'Too many attempts. Wait a minute and try again.');
    }
    if (res.status === 400 || res.status === 401) {
      throw new AppError('BAD_CREDENTIALS', 'That email address and password do not match.');
    }
    throw toAppError(reason, 'Could not sign in. Please try again.');
  }

  saveSession(normaliseSession(data));
  return getSession();
}

export async function signOut() {
  const token = getSession()?.access_token;
  saveSession(null);   // locally signed out first, so a failure here cannot trap anyone
  if (!token) return;
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
  } catch {
    /* the local session is already gone, which is what signing out means here */
  }
}

function requireConfigured() {
  if (!CONFIGURED) {
    throw new AppError(
      'NOT_CONFIGURED',
      'This site is not connected to a database yet. See README.md — SUPABASE_URL and SUPABASE_ANON_KEY need to be set.',
    );
  }
}

/* ---------------------------------------------------------- postgrest ---- */

async function authHeaders(extra = {}) {
  const token = await accessToken();
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
    ...extra,
  };
}

async function request(path, { method = 'GET', body, headers = {}, signal } = {}) {
  requireConfigured();
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: await authHeaders({
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      }),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw toAppError(err);
  }

  if (res.status === 401 || res.status === 403) {
    // A 401 on an authenticated request means the token is no longer good.
    // Clearing it sends the user to the sign-in page rather than leaving them
    // on a screen where nothing works and nothing says why.
    if (getSession()) saveSession(null);
    throw new AppError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
  }

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) throw toAppError(data ?? text);

  return { data, headers: res.headers };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Turn a filter object into PostgREST query parameters. */
function buildQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) for (const v of value) search.append(key, v);
    else search.append(key, value);
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Read rows from a table or view.
 *
 * `range` asks for one page and returns the total alongside it, using the
 * Content-Range header PostgREST sends back for a counted request. Nothing in
 * this application ever selects a whole table — requirement 27, and the
 * reason the inventory screen stays usable at ten thousand products.
 */
export async function select(table, { params = {}, range, signal } = {}) {
  const headers = {};
  if (range) {
    headers.Range = `${range.from}-${range.to}`;
    headers['Range-Unit'] = 'items';
    headers.Prefer = 'count=exact';
  }
  const { data, headers: resHeaders } = await request(`/rest/v1/${table}${buildQuery(params)}`, {
    headers,
    signal,
  });
  const contentRange = resHeaders.get('content-range') || '';
  const total = Number(contentRange.split('/')[1]);
  return { rows: Array.isArray(data) ? data : [], total: Number.isFinite(total) ? total : null };
}

/** Read a single row, or null. Never throws for "not found". */
export async function selectOne(table, params = {}) {
  const { rows } = await select(table, { params: { ...params, limit: 1 } });
  return rows[0] ?? null;
}

export async function insert(table, values, { returning = true } = {}) {
  const { data } = await request(`/rest/v1/${table}`, {
    method: 'POST',
    body: values,
    headers: { Prefer: returning ? 'return=representation' : 'return=minimal' },
  });
  return Array.isArray(data) ? data[0] : data;
}

export async function update(table, params, values) {
  const { data } = await request(`/rest/v1/${table}${buildQuery(params)}`, {
    method: 'PATCH',
    body: values,
    headers: { Prefer: 'return=representation' },
  });
  return Array.isArray(data) ? data[0] : data;
}

export async function remove(table, params) {
  const { data } = await request(`/rest/v1/${table}${buildQuery(params)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  });
  return Array.isArray(data) ? data : [];
}

/** Call a database function. Every stock change goes through one of these. */
export async function rpc(fn, args = {}) {
  const { data } = await request(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args });
  return data;
}

/* ------------------------------------------------------------ storage ---- */

/**
 * Upload an image and return the public URL to store on the product.
 *
 * The bucket is public-read on purpose: these images are printed on a public
 * catalogue, and a signed URL that expires would break every product link
 * already sent to a customer on WhatsApp.
 */
export async function uploadImage(file, pathInBucket) {
  requireConfigured();
  const token = await accessToken();
  if (!token) throw new AppError('SESSION_EXPIRED', 'Please sign in again to upload an image.');

  let res;
  try {
    res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${encodeURI(pathInBucket)}`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': file.type || 'application/octet-stream',
          'x-upsert': 'true',
        },
        body: file,
      },
    );
  } catch (err) {
    throw toAppError(err);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 403) {
      throw new AppError('FORBIDDEN', 'You do not have permission to upload images.');
    }
    if (res.status === 413) {
      throw new AppError('FILE_TOO_LARGE', 'That image is larger than 5 MB. Please use a smaller one.');
    }
    throw toAppError(detail, 'The image could not be uploaded.');
  }

  return publicImageUrl(pathInBucket);
}

export function publicImageUrl(pathInBucket) {
  return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${encodeURI(pathInBucket)}`;
}
