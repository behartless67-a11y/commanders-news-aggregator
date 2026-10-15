# Viewership deep dive (October 10, 2026)

How The Burgundy Wire gets more readers. Built from the site's own analytics (the `site-stats` counters, read October 10) plus four research passes: search and news discovery, social and community, newsletter and retention, and local partnerships and the competition. Sources are linked inline. Every traffic projection here is an estimate, not a measurement.

---

## 1. Where things stand

**The numbers (all-time, since mid-August):**

| | |
|---|---|
| Pageviews | 4,708 (Aug 1,338 partial, Sept 2,177, Oct 508 so far) |
| Daily pace | 80 to 135 a day in early September, about 50 a day now |
| Daily unique browsers | about 30 to 40 |
| Returning vs. new | 76.5% of pageviews from browsers that have been here before |
| Referrers | 91% direct / no referrer, The Warpath 86 visits, Reddit about 90, Google 46, DuckDuckGo 10, Bing 8, Facebook 5 |
| What people read | homepage 74%, social feed 8%, beat writers 3%, blog index 3%, every blog post under 30 views |
| When | 9 a.m. to 5 p.m. Eastern, peaking around 9 and 4. Monday is the biggest day, Saturday the smallest |
| Devices | phone 43.5%, wide desktop 38.5%, desktop 14.4%, tablet 3.6%; iOS 40% |
| Where | United States 94%, then Switzerland, Australia, Canada, France |
| Outbound clicks | 834 total: Riggo's Rag 327, Hogs Haven 236, Yahoo 82 |
| Hail Mail | 8 subscribers |

**What that means:**

1. **The loyalty is real and discovery is broken.** People who find the site come back (most traffic is regulars), but almost nobody new is finding it. Traffic has drifted down since the early-September Reddit bumps.
2. **The river is the product.** Three of every four pageviews are the homepage, read during the workday like a news app. The blog is what makes the site yours, and it isn't reaching anyone: most posts get under 30 views.
3. **Google thinks the site is its hub pages.** Google News has indexed 10 Burgundy Wire pages (home, Donate, Cville Spots, Videos, Music, Podcasts, How It Works, Beat Writers) and none of the posts. Exact-title searches for four recent posts return nothing.
4. **The newsletter ask misses new visitors.** The popup only fires on a browser's 10th pageview, so a reader who comes in from Reddit and reads two pages never sees it. There's no welcome email.
5. **We can't see what works.** In-app browsers (Slack, iMessage, Reddit's app) arrive with no referrer and get counted as Direct.

**Timing note:** Washington is 1-3 and Sunday's Giants game is being called must-win ([Hogs Haven](https://www.hogshaven.com/washington-commanders-news/447824/bad-weather-6-players-out-jayden-daniels-back-must-win-game-giants-nfc-east)). Reddit posts and press pitches both land better after a win.

---

## 2. The strategy in one line each

1. **Fix the plumbing** so new readers can find the site and get asked to stay.
2. **Go where Commanders fans already are**, with things only you make (the voice, the ref card, the crowd pick).
3. **Build a weekly habit loop:** Friday Hail Mail, Sunday "Call your shot," Monday "Readers called it."
4. **Own Charlottesville.** Nobody runs a Commanders fan scene there, and the Bills fans got press for theirs.

---

## 3. Plumbing: things Claude can build (one to two weekends)

Ordered by value for the effort.

### 3.1 Know where readers come from (15 minutes)
Tag every link Ben shares (`?via=reddit`, `?via=hh`, `?via=warpath`, `?via=bgo`, `?via=x`, `?via=hogwaller`) and have the tracker bucket on the tag. Add referrer labels for Bluesky, Threads, Hogs Haven and BGO. Without this, none of the rest can be measured.

### 3.2 Make the posts look like articles to Google (5 to 8 hours)
- **A byline and an author page.** Google's helpful-content questions ask whether pages carry a byline that leads to an author bio ([Google](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)), and Google News policies call for bylines, dates and contact info ([Google](https://support.google.com/news/publisher-center/answer/6204050)). Ben writes the bio himself; nothing gets inferred.
- **Full dates** ("October 8, 2026", not "Thu, Oct 8") that match the structured data ([Google](https://developers.google.com/search/docs/appearance/publication-dates)).
- **BlogPosting structured data** on posts and **WebSite** structured data on the homepage ([Article](https://developers.google.com/search/docs/appearance/structured-data/article), [site names](https://developers.google.com/search/docs/appearance/site-names)), with a clean 16:9 photo of at least 1200px and no text on it, which is what Discover wants ([Google](https://developers.google.com/search/docs/appearance/google-discover)). The text-on-photo share cards can stay as the X/Facebook preview.
- **Team and opponent in post titles.** Keep the joke, add the names: "Full Volume: Commanders vs. Giants Prediction, Five Hamstrings and Weird Al." Don't put a score in a pregame title; "24-20" reads like a final ([Google News policies](https://support.google.com/news/publisher-center/answer/6204050)).
- **Page-title separator " | " instead of the em dash every page title uses now.** That fixes the no-em-dash rule too ([title links](https://developers.google.com/search/docs/appearance/title-link)).
- **One URL form.** Canonicals, sitemap, feed and structured data say `/x`, the form Google already chooses (Search Console, Oct 15: it indexed `/blog`, `/cville`, `/hail-mail` and the CRT post without `.html` before any canonical said so, and flagged one post whose canonical said `.html`). Internal links still say `/x.html`; both load, and Google treats them as the same page.
- **A larger favicon** (the existing 192px icon), since Google News builds publication logos from favicons ([Google](https://support.google.com/news/publisher-center/answer/15898024)).

### 3.3 Take the river out of the index (about 1 hour)
Google's scraping policy names sites "dedicated to embedding or compiling content" without substantial added value ([Google](https://developers.google.com/search/docs/essentials/spam-policies)). The headline river is useful, but to Google it's a compilation.
- `noindex, follow` and out of the sitemap: team-sources, national-coverage, social-feed, videos, podcasts, beat-writers, donate.
- Keep indexed: home, posts, how-it-works, contact, cville, roster, injury.
- Shorten river excerpts to a sentence, and put Ben's newest post, the ref card and the poll at the top of the homepage (this lines up with the "From Ben" homepage spot already on the backlog).

### 3.4 Fix and split the RSS feed (1 to 2 hours)
`feed.xml` mixes 59 publisher headlines with Ben's posts, Ben's items use relative links (some feed readers can't open them; [W3C](https://validator.w3.org/feed/docs/warning/ContainsRelRef.html)), and `<source>` is missing its required `url` ([RSS spec](https://www.rssboard.org/rss-specification)). Make `/feed.xml` Ben's posts only, with absolute links and an image, and move the river to `/river.xml`. That's what makes Feedly, Inoreader and later Flipboard worth anything.

### 3.5 Ask new visitors at the right moment (about 2 hours)
- **Popup on the 2nd pageview instead of the 10th**, as a bottom sheet on phones. Across a billion popup displays, a two-page delay converted best (9.84%; three pages, 4.74%) ([Wisepops](https://wisepops.com/blog/popup-stats)). Google discourages full-screen interstitials, so keep it small on phones ([Google](https://developers.google.com/search/docs/appearance/avoid-intrusive-interstitials)). The permanent "no thanks" stays.
- **A concrete promise in every signup:** "Every Friday before kickoff: my score, the crowd's score, who's in and out, and one thing that made me yell." The current popup headline is the generic "The Weekly Recap."
- **A welcome email** that links two favorite posts and asks one question to reply to ("What's your Commanders origin story?"). Replies feed Wire Taps.
- **A hidden source field** on every form, so we know whether signups come from the popup, the end of a post, the poll or Högwaller.

### 3.6 Fix Hail Mail sending before it breaks (2 to 3 hours, needed before about 90 subscribers)
The send function makes one Resend call per subscriber, and Resend's free plan allows 100 emails a day and 3,000 a month ([pricing](https://resend.com/pricing), [quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits)). Past that, a send fails partway through and only shows up as a "failed" count. Move to Resend's broadcast sending (free up to 1,000 contacts) and add a List-Unsubscribe header. Email authentication (SPF, DKIM, DMARC) already checks out.

### 3.7 A "Who's reffing the Commanders game?" page (3 to 5 hours, then about 10 minutes a week)
The most winnable search there is for a site like this: the answer changes weekly, the competition is thin (league-wide lists and the odd team-site post), and the ref card already has the data. One permanent URL, retitled each week ("Who's Reffing Commanders vs. Bears (Week 6)? Clete Blakeman's Crew, by the Numbers"), with one line from Ben. Estimate: 5 to 30 visits a game week once it ranks.

Also retitle **Injury Tracker** to "Commanders Injury Report: Week N" with Ben's plain-English notes, and give **Cville Spots** a "Where to watch the Commanders in Charlottesville" title. Nobody else has that page. Skip SEO on the depth chart (a copy of the team's) and generic "how to watch" (Google answers it).

### 3.8 Turn "Call your shot" into a season leaderboard (about a day)
The one feature that builds a weekly habit and collects emails in the same place. Add an optional nickname and email ("put my name on the leaderboard and email me how wrong I was"), score each game after the final, show season standings, and run a "Readers called it" block in the Monday post. Prediction games are a proven email capture in vendor case studies, and the code (the predictions store) already exists. Estimate: 4 to 14 new subscribers per game week. Keep entry free and the prize tiny (a sticker); never tie it to buying anything ([skill vs. chance](https://www.sweeppea.com/sweepstakes-vs-contest-vs-lottery)).

### 3.9 Small, free, one-time
- **Search Console** (Ben, 15 minutes): URL-inspect three recent posts and check the Pages report for "Crawled, currently not indexed."
- **Bing Webmaster Tools** (1 hour): one-click import from Search Console ([Bing](https://blogs.bing.com/webmaster/september-2019/Import-sites-from-Search-Console-to-Bing-Webmaster-Tools)). Bing's index also feeds ChatGPT search ([Search Engine Land](https://searchengineland.com/chatgpt-search-microsoft-bing-seo-448019)).
- **Google Preferred Sources** link in post footers and Hail Mail, so readers can star the site in Google ([Google](https://developers.google.com/search/docs/appearance/preferred-sources)). It keeps readers more than it finds them.
- **Feedspot's Commanders blog list** (10 minutes): free submission form ([Feedspot](https://bloggers.feedspot.com/washington_commanders_blogs/)).
- **Bluesky and Threads auto-post** each new post through a GitHub Action (Threads' API is free; [Meta](https://developers.facebook.com/docs/threads/posts)). Near-zero traffic, but free once built. Don't automate X: the API costs $0.20 a post ([X](https://docs.x.com/x-api/getting-started/pricing)).
- **Manifest `display: minimal-ui`** (10 minutes) so the site can be installed on a home screen.

---

## 4. Ben's weekly routine (about 2 to 3 hours)

### 4.1 r/Commanders, done right (about 60 minutes a week): the only channel with real upside
About 231,000 members, growing ([GummySearch](https://gummysearch.com/r/Commanders/)). In the week ending October 6, the top 100 posts were 44 images, 22 videos, 14 text posts and **zero independent blog links**. The creators who do well there post native content: u/CornDoggyLOL's weekly matchup doodle, a fan's text-post film breakdown.
1. Read the sub's rules and wiki yourself (Reddit blocks automated reading, so the research couldn't).
2. Send one modmail: "I write a one-man fan blog. Is a text post with my take and a link at the bottom OK every couple of weeks?" A written yes is insurance.
3. Every week: 3 to 5 real, funny comments in the postgame thread and big news threads. Sunday night is when your voice fits.
4. Every 2 to 3 weeks, and after a win: a **native text post** with your best lines in full (a take or a question as the title), ending "Full post here. I run this site, it's just me" with a `?via=reddit` link.
5. **Image posts** of things you already make: the ref card (the sub already argues about ref crews), a crowd-vs-final chart. A small watermark, no link.
6. Never ask anyone to upvote (vote manipulation can get an account banned sitewide), never cross-post the same link to several subs, never delete and repost ([Reddit content policy](https://redditinc.com/policies/content-policy)).

Skip r/nfl: it banned X links in 2025 and is dominated by established reporters ([Awful Announcing](https://awfulannouncing.com/twitter/nfl-nba-reddit-communities-banned-x-posts.html)).

### 4.2 Hogs Haven (about 30 minutes a week on average)
- **One warm note to Bill Horgan** ("Bill-in-Bangkok"), who builds the daily "Commanders News" / Daily Slop roundup ([example](https://www.hogshaven.com/washington-commanders-news/447824/bad-weather-6-players-out-jayden-daniels-back-must-win-game-giants-nfc-east)), with one best post and "if it's ever useful for the Slop." Follow up once at most.
- **Comment as a regular reader for two weeks**, then a **FanPost every 3 to 4 weeks**. FanPosts are alive in 2026 (eight on the homepage October 7 to 10) and staff-recommended ones can link out. Keep it PG-13: SB Nation's rules are strict on profanity and spam ([guidelines](https://www.sbnation.com/community-guidelines)).
- Hogs Haven readers already get 236 clicks' worth of traffic from you; they're the closest audience there is.

### 4.3 The forums (about 20 minutes a week)
- **The Warpath** (about 8,000 members, 121 active in its last archived snapshot; [archive](https://web.archive.org/web/20251207023823/https://thewarpath.net/)): ask an admin for one running "Ben's Burgundy Wire posts" thread instead of new threads each time. It's already your best referrer after Direct.
- **BGO, Burgundy and Gold Obsession** ([bgobsession.com](https://www.bgobsession.com/)): where the ExtremeSkins crowd went. **ExtremeSkins itself is gone** (the domain is unrelated now). Introduce yourself in BGO's "Welcome Commanders Fans" forum and join game threads.

### 4.4 X on game day only (about 30 minutes)
5 to 10 funny live lines during games, quick replies to beat writers, the best line of each post as text with the link in a reply (X deprioritizes links; [Cybernews](https://cybernews.com/news/musk-x-posts-with-links-suppression/)). Hogs Haven's "All aTwitter" roundup embeds small accounts, so a good line can travel.

### 4.5 Swaps and podcasts (about 20 minutes a week on average)
- **Tell the independents what you send them.** The admin panel counts outbound clicks per source. Writers like Mark Bullock (now in the Film Room) and Ben Standig care about traffic. Ask for nothing.
- **u/CornDoggyLOL:** ask to feature the weekly matchup doodle with credit (the "fan corner" backlog idea).
- **One funny voicemail** to the team podcast's "Get Loud" line (703-726-7419, washingtongetloud@gmail.com; [episode page](https://omny.fm/shows/command-center-podcast/up-for-the-task-previewing-this-year-s-defense-to-dos-for-a-winning-2026-get-loud-commanders)).
- **Small fan podcasts** (The Burgundy Zone, Harry Hog Football, Tae & Todd): a three-line pitch with a hook ("readers in 22 countries," the crowd-pick record). Check each show's latest episode date first.

---

## 5. Charlottesville

There is no Commanders fan scene in Charlottesville. The Buffalo Bills Backers have filled Champion Grill and South Street Brewery for years (South Street even brewed them a beer) and got covered by C-VILLE and Radio IQ ([C-VILLE](https://c-ville.com/theyre-my-people/), [WVTF](https://www.wvtf.org/news/2023-09-22/surprising-pro-football-team-rallies-fans-in-cville)). That's the opening.

### 5.1 Högwaller Sundays (Evan's call on how much)
- A 4x6 table card with a QR code: "Call your shot: pick the score, see if you beat Ben in Monday's post," linked with `?via=hogwaller`. Table cards get scanned far more than posters, scans fade after about two weeks, and the label should say what you get ([Scanova](https://scanova.io/qr-code-benchmarks/)). Change the card every 2 to 3 weeks.
- A Monday line about "the Högwaller crowd's pick."
- The team's official bar program, Commanders Connect, lists only DMV bars ([Commanders Connect](https://www.commanders.com/fans/rally/commanders-connect)); Evan could email rally@commanders.com about being listed. Also add Högwaller to the bar thread linked in the r/Commanders sidebar.
- Keep it a friendship, not a sponsorship. Prediction contests stay free (Virginia limits raffles to qualified nonprofits; [Va. Code 18.2-340.22](https://law.lis.virginia.gov/vacode/18.2-340.22)), and prizes are stickers, not beer. Confirm Evan's title before any press pitch calls him the owner.

### 5.2 One local press pitch, after a win
Angle: "Charlottesville finally has a Commanders Sunday," with the tent and the tube man as the picture and the site as the supporting detail.
- C-VILLE: eatdrink@c-ville.com (food and drink angle), reporter@c-ville.com (fan angle) ([FAQ](https://c-ville.com/faq))
- Radio IQ: Sandy Hausman, Charlottesville bureau chief (covered the Bills Backers)
- NBC29: story-idea form ([29news](https://29news.com/about-us/contact-us))
- Charlottesville Tomorrow: tip form ([contact](https://www.cvilletomorrow.org/contact))
- Skip UVA's official channels: it isn't a university story, and it would put the blog in front of coworkers.

### 5.3 Stickers as rewards, not ads
Mailbag questions, poll winners, the 5,000th reader, maybe "the first 50 Hail Mail readers." Your own cooler and laptop are the billboard. Northwest Stadium bans distributing goods in the lots without approval ([policy](https://www.commanders.com/stadium/tailgating-policy)), and UVA bans outside vendors on Grounds ([UVA](https://virginiasports.com/football-gameday)): handing a friend a sticker is fine, a table is not. Never add team or UVA logos.

---

## 6. Skip list (researched, not worth it now)

- **Apple News, MSN / Microsoft Start, Bing News, NewsNow, Yahoo Creators, SmartNews, NewsBreak:** closed to new publishers, invite-only, or not a fit.
- **r/nfl, TikTok/Shorts/Reels, Facebook groups:** low odds for the time; NFL footage is a takedown risk.
- **Web push notifications:** under 1% interaction across all notifications, and iOS needs a home-screen install first ([Google](https://blog.google/chromium/automatic-notification-permission/)).
- **A game-day live blog:** big build, small payoff. A three-sentence postgame within an hour does more.
- **Referral software, moving Hail Mail to Substack or beehiiv:** not at 8 subscribers. Revisit at about 150.
- **Wikipedia external links:** against Wikipedia's rules for fan sites ([WP:EL](https://en.wikipedia.org/wiki/Wikipedia:External_links)).
- **Search for game results:** Google now answers those itself with live game panels.

---

## 7. Realistic targets

Estimates, for checking in on:
- **End of October:** link tags live, posts with bylines and structured data, river out of the index, popup on the 2nd pageview, welcome email live, the first r/Commanders native post after a win.
- **End of November:** about 70 daily unique browsers (double today's), Hail Mail at 50, the ref page ranking for "who is reffing the Commanders game," at least one Hogs Haven roundup mention.
- **End of the season:** Hail Mail at 100 to 200, a Charlottesville press mention, the leaderboard as a weekly ritual.

What would move it faster than any of this: one r/Commanders post that takes off (a few hundred to a few thousand visits in a day), and a popup ready to catch the people it brings.

---

## 8. Caveats

- Reddit blocks automated reading, so the r/Commanders rules weren't checked directly. Read them before posting.
- Many conversion benchmarks come from vendors who sell those tools. Treat them as rough.
- Contact details for CBS19 and the Daily Progress couldn't be verified.
- Every traffic and subscriber projection is an estimate.
