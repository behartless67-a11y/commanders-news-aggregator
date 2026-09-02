# The Burgundy Wire — How Everything Works

A complete reference for the site owner. Everything you need to know to run and maintain theburgundywire.com without having to remember it.

---

## The Stack

| Service | What it does | Dashboard |
|---|---|---|
| **Netlify** | Hosts the site, runs serverless functions, captures form submissions, stores analytics + subscriber data in Blobs | app.netlify.com/projects/commanders-news-aggregator |
| **GitHub** | Source code + automated workflows | github.com/behartless67-a11y/commanders-news-aggregator |
| **Amazon Bedrock** | Generates the weekly digest and game previews (Claude Sonnet 5) | AWS console |
| **Resend** | Sends Hail Mail newsletter emails | resend.com |
| **ImprovMX** | Forwards @theburgundywire.com email to your real inbox | improvmx.com |
| **Google Search Console** | Google indexing and search traffic | search.google.com/search-console |

Admin panel: **theburgundywire.com/admin** (password-protected)

---

## Automated Schedules

Everything runs on GitHub Actions. No local machine needed for any of this.

| What | When | Workflow |
|---|---|---|
| Collect news + rebuild + deploy | Every 2 hours | `nightly.yml` |
| Roster stats refresh | Tuesday mornings | `roster-stats.yml` |
| Social posts refresh | Hourly | `social.yml` |
| **Weekly digest generation** | **Friday 2pm Eastern** | `nightly.yml` (digest step) |
| Game preview generation | Day of game, 7am Eastern | `preview.yml` |
| Monday morning post | Monday 9am Eastern | `monday.yml` |

When a digest or preview is approved in the admin panel, `publish-on-approve.yml` fires automatically and rebuilds + deploys the site.

---

## The Weekly Blog Post Flow

1. **Friday ~2pm** — Bedrock generates the weekly digest draft and emails you at bh4hb@virginia.edu AND behartless67@gmail.com with a link to review it.
2. **You review it** in the admin panel at theburgundywire.com/admin — Blog drafts section.
3. **You click Approve** — site rebuilds automatically and the post goes live.
4. **You send Hail Mail** from the Newsletter section in the admin panel.

### Original blog posts (personal essays)
These are written collaboratively with Claude. Come with your thoughts, answer questions, Claude shapes it in your voice. Published directly as JSON files in `data/originals/`. No approval gate — they're yours.

---

## Hail Mail Newsletter

**What it is:** A weekly email newsletter sent to subscribers. Different voice from the blog — more unhinged, more personal, can swear. Think "group chat if the whole list got accidentally CC'd."

**Subscribers are stored** in Netlify Blobs under the `subscribers` store with keys like `sub:email@example.com`.

**To send:**
1. Log into admin panel
2. Scroll to Newsletter section
3. Paste subject line and email body HTML
4. Click "Send to all subscribers" OR "Send test to me" first

**Current founding subscribers:** Nicole, Gene (Dad), Josh, Mom

**The email comes from:** newsletter@theburgundywire.com (domain verified in Resend)

**Unsubscribes** are handled automatically via one-click links in every email. No action needed.

**If UVA email blocks it:** Ask recipients to whitelist newsletter@theburgundywire.com. Gmail works fine.

---

## The Email Popup (Subscribe Modal)

- Shows on the 10th, 20th, 30th... visit for a given browser
- Shows only if the visitor hasn't already subscribed or dismissed it
- Never shows to you when logged into the admin panel
- The floating Hail Mail bar at the bottom of the page also lets people subscribe any time
- Both disappear permanently once someone subscribes

---

## The Admin Panel

Located at theburgundywire.com/admin. Sections:

| Section | What it does |
|---|---|
| **Quick Links** | One-click to all dashboards (Netlify, GitHub, Resend, Search Console, etc.) |
| **Traffic** | Pageviews, visitors, sources, top pages, all your analytics |
| **Blog drafts** | Approve or reject AI-generated weekly digests and game previews |
| **Newsletter** | Subscriber list + send button for Hail Mail |

Your own browsing doesn't count in analytics when you're logged in.

---

## The Ditch Report

Private NC-17 weekly newsletter for you, Jason, and Chris. Not automated — paste the Slack transcript to Claude and it writes the newsletter. Lives in the conversation, never published to the site.

---

## The Valhalla Feed (stepdad's Vikings site)

Separate repo: github.com/behartless67-a11y/valhalla-feed
Deployed at: candid-gnome-53c779.netlify.app (rename in Netlify dashboard if desired)
Updates once daily at 1am Eastern. No AI blog, no newsletter, no live blog — just news headlines and the schedule.

---

## Content Sources

**Team sources** (always relevant, every post shown): Commanders.com, Hogs Haven, Riggo's Rag, ClutchPoints, DC Sports King, WJLA, Commanders YouTube, Nicki Jhabvala (The Athletic, via custom scraper)

**National sources** (filtered to Commanders-relevant only): Pro Football Talk, ESPN, Yahoo Sports, CBS Sports

**Social/ticker** (beat reporters via Mastodon bridge): JP Finlay, Ben Standig, John Keim, Tashan Reed, and others

---

## Key Files

| File | What it does |
|---|---|
| `config/sources.js` | All RSS/social sources and their settings |
| `config/social.js` | Beat writer social accounts for the ticker |
| `src/digest/prompt.js` | System prompt for the AI weekly recap — the voice and rules |
| `src/digest/generate.js` | Digest generation pipeline |
| `netlify/functions/newsletter-send.js` | Hail Mail send function and email template |
| `netlify/functions/submission-created.js` | Captures email signups from the popup form |
| `netlify/functions/track.js` | Analytics beacon handler |
| `data/digests/` | Weekly recap drafts and published posts |
| `data/originals/` | Hand-written blog posts |
| `data/mondays/` | "A Case of the Mondays" posts |
| `scheduled-post.ps1` | Windows Task Scheduler script for local tasks |

---

## If Something Breaks

- **Site not updating:** Check GitHub Actions tab for failed workflow runs
- **Admin panel won't log in:** Clear browser cookies for theburgundywire.com and try again
- **Digest didn't generate:** Run `npm run digest` from the repo folder manually
- **Email not arriving:** Check Resend logs at resend.com — if it shows delivered, check spam
- **Wrong content on site:** Run `SITE_URL=https://theburgundywire.com npm run build` then `npx netlify deploy --prod --dir=dist`
