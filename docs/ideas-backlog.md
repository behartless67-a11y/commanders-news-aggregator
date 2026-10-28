# Ideas backlog

Things we've talked about building but haven't yet. Newest batch first. When one ships, move it to `how-everything-works.md` and delete it here.

---

## Follow-ups to check (October 28, 2026)

From the day the work machine's Task Scheduler jobs were retired and the "Who's reffing" page, the group-chat share button, Bing and Feedspot went in. Nothing to build here, just things to look at.

- **October 29, after 7:05 AM: the localhost deploys should be gone.** Both work-machine tasks were deleted Oct 28 (see `docs/retire-work-pc-tasks.md`). Check that the homepage canonical says theburgundywire.com (`curl.exe -s https://theburgundywire.com/ | Select-String canonical`) and that Netlify's deploy list has no 11:01 UTC deploy without a matching GitHub Actions run.
- **Every game week: a line for the ref page (optional).** Add one to `config/ref-notes.js`, keyed `'<season>-<week>'` (`'2026-8'` for the Eagles). It shows on whos-reffing.html that week only.
- **A week or two out: Google Preferred Sources.** Search for theburgundywire.com at google.com/preferences/source. On Oct 28 it found nothing (Hogs Haven came up fine), so the link was pulled from posts and Hail Mail. Once the site shows up, put it back: `https://www.google.com/preferences/source?q=theburgundywire.com`, under the share button (`postShare()` in `templates.js`) and in the Hail Mail footer (`newsletter-send.js`).
- **Search Console: is whos-reffing indexed?** Indexing was requested Oct 28. Check it with URL Inspection, and see whether "who is reffing the Commanders game" starts showing up under Performance. Twelve pages were "Discovered, currently not indexed" that day; watch that number fall.
- **Admin stats: "Reader share (group chat)."** The new share button tags its links `?via=share`. If that row stays empty after a few posts, the button needs a better spot or better words.
- **Bing:** the site and its sitemap were added Oct 28 (theburgundywire.com only; batten.virginia.edu was left out on purpose). Check that the sitemap shows "Success" instead of "Processing."
- **Feedspot:** submitted for free with admin@theburgundywire.com. Don't pay for their placement plans ($14 to $74 a month). If the site shows up on their Commanders list on its own, great.

---

## From r/Commanders (October 6, 2026)

Read from the sub's top posts that week plus nine days of its posts and comments. Built the same day: the three new feeds, the Film Room, the ref card and the score poll. Still to do:

- **"Who's playing Sunday" card.** Injury posts ran the whole week (Mariota's MCL, Jaylin Lane's ankle, Terry's hamstring, JD5's brace, Cosmi, Cross). A clear in/out/questionable card for the next game, QB room first. Belongs in the next-game strip below. `src/lib/injuries.js` already has the designations.
- **Where to watch, with the map.** A top post was "Week 4 broadcast... is not on the map." The schedule already says the network; out-of-market fans also need the coverage map (506 Sports posts one every week) and a line on NFL Network or streaming when that's the only way.
- **"Readers called it" on Monday.** Once the poll has a week of picks: the crowd's number next to yours and the final, in the Monday post or a box on the homepage. The picks are already stored per game.
- **Fan corner.** u/CornDoggyLOL draws a weekly matchup doodle, the sub runs a game-day pups thread, and international fans keep showing up (an Italian fan in Poland, the London rally crowd). Only ever with the person's permission. Fits next to Readers Abroad.
- **Logo story, wait for it.** An account we couldn't verify (@ZachCohenFB) says the spear W becomes the primary logo in 2027. The spear W debuted this year on the Hail Raiser uniforms, and the Association on American Indian Affairs criticized it. Worth a post once a real reporter confirms it, and it needs care when it happens.
- **Maybe-sources.** Brian Baldinger's breakdowns are popular on the sub but only on X and Facebook, no feed. The sub also cites Tom Pelissero, Jeremy Fowler, Jordan Schultz (who broke the Chenal news) and Matt Zenitz; add any the ticker's Mastodon bridge mirrors.

---

## Getting Wire Taps questions (October 7, 2026)

No real questions in the first month. Built: every post can end on a specific question (`wireTaps` field; Full Volume was the first). Still to try:

- **Ask right after a reader votes** in "Call your shot": "Got a hot take on Sunday? Send it to Wire Taps."
- **Ask in Hail Mail**: a "send me your questions" line in every email, and check whether replies to the email reach you.
- **Answer the first one yourself**: Ethan's contact-form question about the beat-writer tweets not updating during games (since fixed) would make a good first Wire Taps post. Ask Ethan before naming him.
- Delete the September pipeline test question when convenient.

---

## Design report follow-ups (October 2026)

Done: contrast, readable posts, quieter feed, grouped duplicate stories. Still open:

- **A permanent "From Ben" spot on the homepage**, so your newest post isn't only findable while it's pinned.
- **Nav down to about six items.**
- **Next-game strip** across the top: opponent, kickoff in your time, network, odds, and the in/out card above.
- **Live/ticker honesty**: make it obvious what's live and what's from the last build.
- **Newsletter modal cleanup.**
- **Copy cleanup**, including the em dash in every page title, the one right before "The Burgundy Wire."
- **/blog archive** that reads like an archive.
- **Page weight.**
- **Game-day mode.**

---

## Stickers

- Black sticker on Fourthwall (the print file is in `merch/stickers/`).
- Publish the hidden sticker at $5.29 or $6, ideally after your samples arrive.
- A "Shop" link on the site once it's public.

---

## Viewership

Superseded by the full plan in `docs/viewership-deep-dive.md` (October 10, 2026), which covers the old list (Warpath, Hogs Haven FanPosts, QR codes, X/Bluesky, podcasts) with research behind each. Two corrections from it: ExtremeSkins is gone (its crowd moved to BGO, bgobsession.com), and Hogs Haven FanPosts still exist.

Built from it so far: sections 3.1 to 3.8 (link tags, SEO, feeds, the popup, the welcome email, the leaderboard, the ref page) and, from 3.9, Bing, Feedspot and the installable manifest. Still open from 3.9: the Bluesky and Threads auto-post, and the Preferred Sources link (see "Follow-ups to check" above). Everything in sections 4 and 5 is Ben's to do and isn't tracked here.
