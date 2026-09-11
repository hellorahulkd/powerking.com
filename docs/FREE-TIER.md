# Running this for nothing

This system is designed to cost **zero** — no plan, no card, no metered
anything. This page is the evidence for that, the limits it has to stay inside,
and the two things that can go wrong if it is left alone for long enough.

Limits change; every figure below is linked to the page that states it. The
measurements are from this repository.

---

## What it uses, and what that costs

| | Plan | Cost |
| --- | --- | --- |
| **GitHub** — code, and the build | Free | £0 |
| **GitHub Pages** — the live website | Free | £0 |
| **GitHub Actions** — builds and deploys | Free, unlimited for public repositories | £0 |
| **Supabase** — the database and admin auth | Free | £0 |
| **Your domain** — powerkingnepal.com | already yours | the registrar's renewal, nothing else |

Nothing in this repository requires a paid tier, and nothing in it will start
charging if it grows. The measurements below are why.

---

## How much headroom there actually is

Measured, not estimated.

| | Now | Free limit | Used |
| --- | --- | --- | --- |
| Published website | **9.9 MB** | 1 GB | 1% |
| Database | **888 kB** | 500 MB | 0.2% |
| Product photographs (in git) | 4.2 MB | — | — |

And at the size this system was **designed** for — 10,000 products and 100,000
stock movements, loaded into a real Postgres to check:

| | At full design scale | Free limit | Used |
| --- | --- | --- | --- |
| Database | **36 MB** | 500 MB | 7% |

So the shop could grow to a hundred times its current catalogue and still be
using well under a tenth of the free database. There is no realistic path from
here to a bill.

Bandwidth is the same story: GitHub Pages allows roughly 100 GB a month, and a
9.9 MB site would need about ten thousand visitors *downloading every page and
every photograph* to approach it.

---

## Where the photographs live, and why that matters

Product photographs are committed to **git**, in `public/images/products/`, and
served by GitHub Pages. They are not in Supabase Storage.

That is worth keeping. Git is free for this, and it means:

* the images cost nothing against Supabase's 1 GB storage allowance
* they are versioned, so a replaced photo can be recovered
* they keep working even if the database is unreachable

Photographs uploaded through the **inventory console** do go to Supabase
Storage (1 GB free). At roughly 200 KB a photo that is about five thousand
images — far more than this catalogue will hold. If it ever became a concern,
the `/admin/catalogue/` editor writes photos into git instead, and both kinds
work side by side.

---

## The two things that can actually go wrong

Neither costs money. Both are worth knowing about.

### 1. Supabase pauses a free project after 7 days of no activity

This is real — the project was found paused when this was set up, because it
had sat unused since it was created.

**What happens if it pauses:**

* The **public website keeps working, completely.** The build falls back to
  `data/products.json`, warns in the log, and publishes all 87 products as
  normal. A customer sees no difference. This is the single most important
  reason the fallback exists.
* `/admin/` stops working until the project is resumed. Nothing is lost.

**What prevents it:** the daily build. `.github/workflows/deploy.yml` runs at
01:15 UTC every day and reads the catalogue from Supabase, and that read is
activity. The project therefore never reaches seven idle days on its own.

**To resume a paused project:** Supabase dashboard → the project → **Restore**.
It takes a couple of minutes and costs nothing. Data is not lost while paused.

→ [Supabase pricing and limits](https://supabase.com/pricing)

### 2. GitHub disables a scheduled workflow after 60 days of repository inactivity

If nobody pushes to the repository for 60 days, GitHub switches the daily cron
off. Seven days after that, Supabase pauses. The website still works throughout
— it falls back — but `/admin/` would need resuming.

**To fix or prevent:** push anything, or open **Actions → Build & Deploy → Run
workflow**. GitHub emails the repository owner before it disables a schedule.

→ [GitHub's note on disabled schedules](https://docs.github.com/actions/using-workflows/events-that-trigger-workflows#schedule)

---

## A note on Vercel

`vercel.json` is in the repository and works, but **you do not need Vercel, and
on the free plan you should probably not use it for this.**

Two reasons, in order of importance:

1. **GitHub Pages already does the job**, for free, with your own domain and
   free HTTPS. It is where the site is live now. Adding a second host adds a
   second thing to go wrong and gains nothing.
2. **Vercel's free Hobby plan is for non-commercial use.** PowerKing Nepal is a
   business, and its catalogue is a commercial site. It has no cart and takes no
   payments, which is the mildest end of that, but it is a wholesale supplier's
   shop window — not a personal project. Paying for a Pro plan to be safe is
   exactly the cost you have said you do not want.

   → [Vercel's plan terms](https://vercel.com/docs/limits/fair-use-guidelines)

So: **stay on GitHub Pages.** `vercel.json` costs nothing to keep, needs no
account, and is there if you ever decide otherwise. Nothing else in the project
depends on it.

---

## Things that would cost money — none of which this does

So that the line is clear:

* **Supabase Pro** ($25/mo) — needed for daily backups, no pausing, and more
  than 500 MB. This system needs none of those at its scale. Take your own
  backups instead (README §20); they are free.
* **Vercel Pro** ($20/mo) — not needed, because the site is on GitHub Pages.
* **GitHub Pro** — only if the repository were made private. Pages is free on
  public repositories.
* **Supabase Storage above 1 GB** — about five thousand product photos away.
* **A second Supabase project** — the free tier allows two per organisation.

Nothing in this codebase calls a billing API, and nothing about it upgrades a
plan on its own.

---

## Keeping it free

1. Leave the daily workflow enabled. It is the keep-alive.
2. If you go quiet for two months, click **Run workflow** once.
3. Keep the repository public, so Pages and Actions stay free.
4. Keep product photographs going into git via `/admin/catalogue/`, or into
   Supabase Storage via `/admin/products/` — either is fine at this scale.
5. Take a CSV export now and then (README §20). Free, and it is the backup the
   free plan does not give you.
