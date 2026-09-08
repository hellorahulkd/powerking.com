/**
 * ============================================================================
 *  SIGN IN — /admin/login/
 * ============================================================================
 *  The one page under /admin/ that does not require a session, because it is
 *  where the others send people who do not have one.
 *
 *  Error handling is requirement 3 of the brief, spelled out: a wrong
 *  password, an address that is not an address, a deactivated account and an
 *  expired session each say something different and true. What it will not do
 *  is distinguish "no such account" from "wrong password" — Supabase answers
 *  both the same way on purpose, so that this form cannot be used to find out
 *  who has an account here.
 * ============================================================================
 */

import { signIn, getSession, CONFIGURED, toAppError } from './client.js';
import { currentProfile } from './session.js';
import { signOut } from './client.js';

const form = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const button = document.getElementById('login-go');
const message = document.getElementById('login-msg');

/** Why the user was sent here, if they were sent rather than arriving. */
const REASONS = {
  expired:   'Your session has expired. Please sign in again.',
  disabled:  'That account has been deactivated. Ask an administrator to switch it back on.',
  noprofile: 'That account has no profile in this system. Ask an administrator to set one up.',
  signin:    '',
};

function say(text, tone = 'error') {
  if (!text) {
    message.hidden = true;
    message.textContent = '';
    return;
  }
  message.hidden = false;
  message.textContent = text;
  message.className = `login__msg login__msg--${tone}`;
}

function fieldError(input, text) {
  const slot = input.closest('.f')?.querySelector('.f__error');
  input.setAttribute('aria-invalid', text ? 'true' : 'false');
  input.closest('.f')?.classList.toggle('is-invalid', Boolean(text));
  if (slot) {
    slot.textContent = text || '';
    slot.hidden = !text;
  }
}

/** Where to go after signing in: back where they were, if that was somewhere. */
function destination() {
  const next = new URLSearchParams(location.search).get('next') || '/admin/';
  // Only ever a path on this site. An open redirect on a sign-in page is how
  // a phishing link gets to borrow a real domain.
  return /^\/admin(\/|$)/.test(next) ? next : '/admin/';
}

async function init() {
  if (!CONFIGURED) {
    say(
      'This site is not connected to a database yet. See README.md — SUPABASE_URL and ' +
      'SUPABASE_ANON_KEY need to be set where the site is built.',
    );
    button.disabled = true;
    return;
  }

  const reason = new URLSearchParams(location.search).get('reason');
  if (reason && REASONS[reason]) say(REASONS[reason], reason === 'expired' ? 'warn' : 'error');

  // Already signed in and still active? Skip the form.
  if (getSession()) {
    try {
      const me = await currentProfile();
      if (me?.is_active) {
        location.replace(destination());
        return;
      }
      if (me && !me.is_active) {
        await signOut();
        say(REASONS.disabled);
      }
    } catch {
      // A stale or unreachable session just means showing the form.
    }
  }

  emailInput.focus();
}

document.getElementById('toggle-password')?.addEventListener('click', (e) => {
  const shown = passwordInput.type === 'text';
  passwordInput.type = shown ? 'password' : 'text';
  e.target.textContent = shown ? 'Show' : 'Hide';
  e.target.setAttribute('aria-pressed', String(!shown));
  e.target.setAttribute('aria-label', shown ? 'Show password' : 'Hide password');
  passwordInput.focus();
});

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  say('');
  fieldError(emailInput, '');
  fieldError(passwordInput, '');

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  let invalid = false;
  if (!email) {
    fieldError(emailInput, 'Enter your email address.');
    invalid = true;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldError(emailInput, 'That does not look like an email address.');
    invalid = true;
  }
  if (!password) {
    fieldError(passwordInput, 'Enter your password.');
    invalid = true;
  }
  if (invalid) {
    (email ? passwordInput : emailInput).focus();
    return;
  }

  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Signing in…';

  try {
    await signIn(email, password);

    // Authentication is not authorisation: an account can exist in Supabase
    // Auth and be switched off here. Check before letting them through, so
    // they are told why rather than bounced by the next page.
    const me = await currentProfile({ force: true });
    if (!me) {
      await signOut();
      say(REASONS.noprofile);
      return;
    }
    if (!me.is_active) {
      await signOut();
      say(REASONS.disabled);
      return;
    }
    location.replace(destination());
  } catch (err) {
    const e2 = toAppError(err, 'Could not sign in. Please try again.');
    if (e2.code === 'BAD_CREDENTIALS') {
      say('That email address and password do not match.');
      passwordInput.select();
    } else {
      say(e2.message);
    }
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
});

init();
