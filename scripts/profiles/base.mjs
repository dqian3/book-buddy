// Default extraction profile: generic, no language- or book-specific behavior.
// Format adapters (epub/html) consult these hooks at the points where extraction
// would otherwise need to know about a language's chapter conventions or a
// particular book's export quirks. Language and book profiles override individual
// hooks; see resolveProfile in ./index.mjs for how layers are merged.
export default {
  /** Title cleanup. Default: pass through (whitespace is already collapsed). */
  cleanHeading: (text) => text,

  /** Does a short, standalone paragraph label a chapter? Default: never. */
  isChapterHeading: () => false,

  /** Split a chapter label glued onto the prior paragraph's closing sentence,
   *  returning [beforeText, headingText], or null when there's nothing to split. */
  splitGluedHeading: () => null,
};
