/**
 * ============================================================================
 *  SESSION AND PERMISSIONS
 * ============================================================================
 *  Who is signed in, what role they hold, and what the interface should offer
 *  them because of it.
 *
 *  ── THIS FILE IS NOT A SECURITY BOUNDARY ─────────────────────────────────
 *  Every check here decides which buttons to draw. None of them decides what
 *  the database will do. A member of staff who edits this file in their own
 *  browser, or skips it entirely and posts to the API by hand, gets exactly
 *  the same answer from Postgres: the policies in
 *  supabase/migrations/…_rls_policies.sql are the permission system, and they
 *  are enforced on the server for every request.
 *
 *  What this file buys is an interface that does not offer somebody a button
 *  that will fail — which is a courtesy, not a control.
 * ============================================================================
 */

import { getSession, selectOne, signOut as clearSession, AppError, CONFIGURED } from './client.js';

let profile = null;
let loaded = false;

/**
 * The signed-in user's profile, or null.
 *
 * The role is read from the profiles table rather than from the JWT, so that
 * an admin changing somebody's role takes effect on their next page load
 * rather than at their next sign-in — which could be weeks.
 */
export async function currentProfile({ force = false } = {}) {
  if (loaded && !force) return profile;
  const session = getSession();
  if (!session?.user?.id) {
    loaded = true;
    profile = null;
    return null;
  }
  profile = await selectOne('profiles', {
    select: 'id,full_name,email,role,is_active',
    id: `eq.${session.user.id}`,
  });
  loaded = true;
  return profile;
}

export function cachedProfile() {
  return profile;
}

export const ROLE_RANK = { staff: 1, manager: 2, admin: 3 };

export function atLeast(role, minimum) {
  return (ROLE_RANK[role] || 0) >= (ROLE_RANK[minimum] || 99);
}

/**
 * What each role may do, in one table rather than scattered through the
 * screens. Mirrors the RLS policies exactly; if the two ever disagree, the
 * database is right and this is the bug.
 */
export const CAN = {
  manageProducts:  (r) => atLeast(r, 'manager'),
  deleteProducts:  (r) => atLeast(r, 'admin'),
  manageSuppliers: (r) => atLeast(r, 'manager'),
  manageCatalogue: (r) => atLeast(r, 'manager'),   // categories and brands
  moveStock:       (r) => atLeast(r, 'staff'),
  adjustStock:     (r) => atLeast(r, 'manager'),
  viewReports:     (r) => atLeast(r, 'staff'),
  exportData:      (r) => atLeast(r, 'staff'),
  importProducts:  (r) => atLeast(r, 'manager'),
  manageUsers:     (r) => atLeast(r, 'admin'),
  manageSettings:  (r) => atLeast(r, 'admin'),
};

export function can(action, role = profile?.role) {
  const check = CAN[action];
  return typeof check === 'function' ? check(role) : false;
}

/* ---------------------------------------------------------------- guard -- */

const LOGIN = '/admin/login/';

/**
 * Everything a protected page has to establish before it draws anything:
 * the site is configured, somebody is signed in, and their account is still
 * active. Anything else sends them to the sign-in page with a reason and a
 * note of where they were going, so signing in returns them there.
 */
export async function requireSession() {
  if (!CONFIGURED) {
    throw new AppError(
      'NOT_CONFIGURED',
      'This site is not connected to a database yet.',
    );
  }
  if (!getSession()) {
    redirectToLogin('signin');
    throw new AppError('NO_SESSION', 'Please sign in.');
  }

  let me;
  try {
    me = await currentProfile();
  } catch (err) {
    if (err?.code === 'SESSION_EXPIRED') {
      redirectToLogin('expired');
      throw err;
    }
    throw err;
  }

  if (!me) {
    // Authenticated with Supabase but no profile row: the auth user exists
    // and the profile does not, which happens if one was deleted by hand.
    await clearSession();
    redirectToLogin('noprofile');
    throw new AppError('NO_PROFILE', 'This account has no profile.');
  }
  if (!me.is_active) {
    await clearSession();
    redirectToLogin('disabled');
    throw new AppError('ACCOUNT_DISABLED', 'This account has been deactivated.');
  }
  return me;
}

export function redirectToLogin(reason = 'signin') {
  const next = location.pathname + location.search;
  const params = new URLSearchParams({ reason });
  if (next && next !== LOGIN) params.set('next', next);
  location.replace(`${LOGIN}?${params}`);
}

export async function signOutAndRedirect() {
  await clearSession();
  profile = null;
  loaded = false;
  location.replace(LOGIN);
}
