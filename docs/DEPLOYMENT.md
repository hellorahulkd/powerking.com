# Deploying PowerKing Nepal

The site is one directory of static files.

**It is hosted on GitHub Pages, which is free, and it should stay there.**
Everything below assumes that. Vercel is configured as an option and is covered
at the end, with the reasons not to bother — see also
[`FREE-TIER.md`](FREE-TIER.md), which shows the whole system costs nothing at a
hundred times its current size.

---

## What a deploy needs to know

Two environment variables, both public values:

| Variable | Where it comes from |
| --- | --- |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | the same page → Project API keys → `anon` / publishable |

Neither is a secret. The anon key is designed to be shipped to browsers, and
Row Level Security in Postgres decides what any holder of it may read. See
`.env.example` for the longer explanation, and for the list of things that must
never be set here.

**With neither set the build still succeeds.** The public catalogue is read
from `data/products.json` and `/admin/` renders a page explaining what is
missing. That is deliberate: a site that cannot reach its database should still
be a site.

---

## GitHub Pages — the current live deployment

`.github/workflows/deploy.yml` builds and publishes on every push to the
publishing branch, and once a day.

Set the two variables at **Settings → Secrets and variables → Actions →
Variables**. Repository *variables* rather than *secrets* is the honest place
for them: they are compiled into a public website, so treating them as secrets
would only make them harder to look at, not harder to obtain. Secrets work too
— the workflow accepts either.

### Why the publishing branch is not `main`

The `github-pages` environment on this repository permits exactly one branch to
deploy through it, and it is not `main`. Established by dispatching the same
commit and workflow from four refs; only `claude/powerking-nepal-website-tave3g`
published. The workflow fast-forwards `main` afterwards so it never drifts.

To move it back once `main` is allowed (Settings → Environments → github-pages →
Deployment branches and tags): change `repo.branch` in
`src/config/site.config.js` and the `push` trigger and sync step in the
workflow. Nothing else depends on it.

### The daily rebuild, and why it matters more than it looks

The public catalogue is pre-rendered, so a change made in `/admin/` reaches the
website on the next build. A push triggers one; the scheduled run means the site
is never more than a day behind even if nobody pushes. Trigger one by hand at
any time from the Actions tab — **Build & Deploy → Run workflow**.

It is also **the keep-alive for the free Supabase project.** Supabase pauses a
free project after seven days without activity, and the daily build's read of
the catalogue is activity. Leave the schedule enabled.

The one way that chain breaks: GitHub switches off a scheduled workflow after
60 days with no repository activity. Push anything, or run the workflow by
hand, and it resumes. Even if it does lapse, the public website keeps working —
the build falls back to `data/products.json`. Only `/admin/` needs the project
resumed. [`FREE-TIER.md`](FREE-TIER.md) has the detail.

---

## Vercel — configured, but not recommended here

`vercel.json` works. You almost certainly do not want it, for two reasons:

1. **GitHub Pages already does this**, free, with your domain and free HTTPS.
   A second host is a second thing to break and gains nothing.
2. **Vercel's free Hobby plan is for non-commercial use**, and this is a
   wholesale supplier's catalogue. The alternative — Vercel Pro at $20 a month
   — is a cost this project does not need.
   → [Vercel's plan terms](https://vercel.com/docs/limits/fair-use-guidelines)

Keeping `vercel.json` costs nothing and requires no account. Nothing else in
the project depends on it.

If you do deploy there anyway: import the repository, set the two environment
variables under **Settings → Environment Variables**, and deploy. The Supabase
integration for Vercel writes `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, which the build accepts as-is.

Vercel adds two things GitHub Pages cannot:

* **Tidier admin URLs.** `/admin/products/<uuid>` is rewritten onto
  `/admin/products/view/?id=<uuid>`. Both work everywhere; on a static host
  only the second exists, and nothing in the application knows which one it
  arrived by.
* **Response headers.** `nosniff`, a referrer policy, `SAMEORIGIN` framing, and
  `no-store` plus `X-Robots-Tag: noindex` on everything under `/admin/`.

`installCommand` is a no-op on purpose: the build has zero dependencies and
there is nothing to install.

### Running both at once

They do not conflict — both build the same `dist/` from the same commit and the
same database — but there is no reason to. Point the domain at one.

---

## First deploy checklist

1. `supabase/apply/01-schema.sql` pasted into the SQL Editor and run. One
   paste — it is all five migrations concatenated, and safe to re-run.
2. `supabase/apply/02-catalogue.sql` pasted and run. Loads the 87 real
   products; also safe to re-run.
3. First admin user invited — see README, *Creating the first admin user*.
4. `SUPABASE_URL` and `SUPABASE_ANON_KEY` set on the host.
5. Deploy, then check the build log says `catalogue: read from Supabase`. If it
   says `read from data/*.json`, the variables are not reaching the build.
6. Open `/admin/login/` and sign in.
