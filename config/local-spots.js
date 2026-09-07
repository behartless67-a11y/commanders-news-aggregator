/**
 * Local Charlottesville spots worth flagging to Commanders fans in the area
 * — started with one bar found through a r/Commanders thread (September
 * 2026), on the chance this becomes a place local fans actually use to find
 * each other in person. Hand-curated, not algorithmic: add an entry only for
 * a real place Ben would actually send a friend.
 *
 * Same shape as the inline `callout` field on a Blog record (see
 * partnerCallout() in templates.js) so a spot that gets a shoutout inside a
 * post and its entry on this page can share one render function.
 *
 * Fields:
 *   eyebrow      small label above the name (a category or location)
 *   name         the business's real name, spelled exactly as they spell it
 *   body         a couple of sentences, Ben's own voice, not ad copy
 *   url          the business's own site
 *   outboundId   key for the outbound-click tracker (see track.js)
 *   cta          link text shown under the body
 */
export const LOCAL_SPOTS = [
  {
    eyebrow: 'Charlottesville, VA',
    name: 'Högwaller Brewing',
    body: "The neighborhood brewpub down by the Rivanna River that's turning itself into a Commanders bar. House-brewed beer, grass-fed smash burgers, a projector in the beer garden, and a wacky waving inflatable arm tube man named Scary Terry, all aimed at Sunday. 1518 East High St, 11am to 10pm daily.",
    url: 'https://hogwallerbrewing.com/',
    outboundId: 'hogwaller',
    cta: 'hogwallerbrewing.com',
  },
];
