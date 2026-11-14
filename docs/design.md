# The Burgundy Wire design system: "Gameday"

Read this before adding or restyling anything on the site. Every new component
uses the values here. If something needs a value that isn't here, add it here
first, with a reason, instead of inventing a one-off in site.css.

Why this file exists: by Nov 2026 site.css had 15 different corner radii, 31
font sizes and 15 letter-spacings, because every feature picked its own. None
of them were wrong on their own, but together they made the site look
undecided. The fix is deciding once.

## 1. Theme

**Gameday.** A dark stadium at night, team colors under the lights. It's a
fan's site, not a newspaper and not a startup. It should feel like the second
screen you keep open during the game.

What it is not: a broadsheet (hairline rules, zero radius, serif columns), a
SaaS landing page (gradient hero, pill badges, three feature cards), or
neon-on-black.

## 2. Color

Every color comes from the team or the stadium. The tokens live in `:root` in
`src/site/assets/site.css`; use the token, never the raw hex.

| Token | Value | Why |
|---|---|---|
| `--burgundy` | `#5A1414` | Team burgundy. Footer, sidebar widgets, the logo. |
| `--gold` | `#FFB612` | Team gold. Links on hover, kickers, the one thing on a card that should catch your eye. Use sparingly so it keeps meaning something. |
| `--bg` | `#14100f` | The stadium at night. Warm near-black, never blue-black. |
| `--surface`, `--surface-2` | `#1f1817`, `#241c1b` | Raised panels, one and two steps up from the page. |
| `--text` | `#efe9e4` | Warm off-white, like stadium lights, not pure white. |
| `--text-muted`, `--text-faint` | `#a89f9b`, `#908784` | Secondary text. `--text-faint` is the floor for WCAG AA on every background; don't go dimmer. |

Three helper tokens for text that sits on a color instead of the page:
`--on-gold` (`#0a0807`, dark text on gold buttons), `--text-on-burgundy`
(`#e2d9d5`, body text inside burgundy panels) and `--alert` (`#ff8a7a`, form
errors and Out/IR status). Burgundy panels also re-declare `--text-faint` and
`--border-soft` so they stay readable; see the README's Design section.

No other accent colors. No purple, no blue, no gradients except the burgundy
washes that already sit behind the header and the page.

Share cards, the Hail Mail and X images use the same burgundy and gold.

## 3. Type

**Picked Nov 14, 2026 (Ben chose B from a three-way mockup).** Replaces Inter,
which was the single most common "generated site" tell.

- **Barlow Condensed 700** (`--font-display`) for anything a reader would call
  a headline: post and page titles, river headlines, post subheads, data-page
  section titles. Why: it's tall and narrow like stadium and broadcast
  graphics, and close to the logo's squared lettering without copying it.
- **Barlow** (`--font-body`) for everything else. Why: same family as the
  headlines, so the contrast is loud cousin and quiet cousin, not two
  strangers. Ben liked the contrast.
- **Self-hosted** in `src/site/assets/fonts/` (OFL license in `OFL.txt`), not
  Google Fonts, so there's no outside request on every page.
- **`font-size-adjust: 0.546`** on body matches Inter's x-height, so all the
  existing small sizes still read the same. Display elements reset it and
  use their own sizes.
- **Heading scale** lives in one block at the end of `site.css` ("Display
  type"): post title 34 to 50px, page title 34, section titles 22 to 28,
  river headline 19 to 21, post subhead 26. New headline elements join that
  block instead of setting their own font.

**Capitals:** all caps only for the nav and small labels (kickers, "Breakdown",
widget titles). Headlines and post subheads use normal capitalization so they
read like Ben talking. Every all-caps label is Barlow and picks one of three
tiers (tokens in `:root`):

| Tier | Letter-spacing | Used for |
|---|---|---|
| Kicker | `--label-track-wide` (0.1em), 11px, 800 | BLOG, BREAKDOWN, every "eyebrow" above a heading, poll labels |
| Section title | `--label-track` (0.07em) | FILM ROOM and the other widget titles, footer columns, admin tiles |
| Control | `--label-track-tight` (0.04em) | nav, buttons, tabs, badges, tags, table headers |

The one exception is the "SPORTS · NEWS · DC" line under the logo, which is
part of the logo lockup and keeps its own spacing.

**Share cards** (`npm run share-cards`) set the headline in Barlow Condensed
Bold from `scripts/fonts/` (a TTF, because ffmpeg can't read woff2), so a link
on X or in a text looks like the page it opens.

## 4. Layout

- **Page shape:** header (logo, nav, ticker) over a two-column body: the river
  of headlines on the left, the sidebar (Film Room, standings, schedule) on the
  right. Below 900px the sidebar drops under the river.
- **Width:** the page runs wide (`--max: 1920px`) because the river is the
  point. Body text keeps its own max width so lines never get too long.
- **Page types:** the home river, a post, a data page (Ref Watch, roster,
  schedule, leaderboard), and a form page (Roll Call, contact, subscribe).
  A new page should be one of these, not a new shape.
- **Don't move things.** Regulars know where everything is. Restyle inside
  existing components; don't reshuffle the layout.

## 5. Tone

- **Density:** dense. It's a feed. Tight spacing in the river, more air in
  posts.
- **Corners:** two radii. `--radius` (6px) for cards, panels, photos and
  video thumbnails; `--radius-sm` (3px) for buttons, badges, tags and inputs.
  Circles only for avatars, dots and round controls. No pill shapes. The one
  exception is the Spotify embed, which keeps its own 12px.
- **Depth:** flat. Borders and the surface steps do the work. The one shadow
  style is the hard gold offset (`3px 3px 0 var(--gold)`) for things that
  should feel like a sticker or a button you can press. No soft blur shadows,
  no glows, no frosted glass.
- **Labels:** a kicker is gold text, not a pill.
- **Emoji:** not as icons. The abroad wave is the one exception.
- **One word:** Gameday.
