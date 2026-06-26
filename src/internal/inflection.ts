// Native replacement for the `inflection` npm package.
// Zero external dependencies.

// ---------------------------------------------------------------------------
// Irregulars: [singular, plural]
// ---------------------------------------------------------------------------
const IRREGULARS: [string, string][] = [
  ['person', 'people'],
  ['man', 'men'],
  ['child', 'children'],
  ['sex', 'sexes'],
  ['move', 'moves'],
  ['cow', 'kine'],
  ['zombie', 'zombies'],
];

// Map both directions for O(1) lookup
const IRREGULAR_SINGULAR_TO_PLURAL = new Map<string, string>();
const IRREGULAR_PLURAL_TO_SINGULAR = new Map<string, string>();
for (const [s, p] of IRREGULARS) {
  IRREGULAR_SINGULAR_TO_PLURAL.set(s, p);
  IRREGULAR_PLURAL_TO_SINGULAR.set(p, s);
}

// ---------------------------------------------------------------------------
// Uncountables
// ---------------------------------------------------------------------------
const UNCOUNTABLES = new Set([
  'equipment', 'information', 'rice', 'money', 'species',
  'series', 'fish', 'sheep', 'jeans', 'police',
]);

// ---------------------------------------------------------------------------
// Pluralization rules: [regex, replacement]  (applied in order, first match wins)
// ---------------------------------------------------------------------------
const PLURAL_RULES: [RegExp, string][] = [
  [/quiz$/i,                '$1quizzes'],
  [/^(oxen)$/i,             '$1'],
  [/^(ox)$/i,               '$1en'],
  [/(m|l)ice$/i,            '$1ice'],
  [/(m|l)ouse$/i,           '$1ice'],
  [/(pea)s$/i,              '$1s'],
  [/(pe)ople$/i,            '$1ople'],
  [/(child)ren$/i,          '$1ren'],
  [/(ax|test)is$/i,         '$1es'],
  [/(octop|vir)i$/i,        '$1i'],
  [/(octop|vir)us$/i,       '$1i'],
  [/(alias|status)$/i,      '$1es'],
  [/(bu)s$/i,               '$1ses'],
  [/(buffal|tomat)o$/i,     '$1oes'],
  [/([ti])a$/i,             '$1a'],
  [/([ti])um$/i,            '$1a'],
  [/sis$/i,                 'ses'],
  [/(?:([^f])fe|([lr])f)$/, '$1$2ves'],
  [/(hive)$/i,              '$1s'],
  [/([^aeiouy]|qu)y$/i,     '$1ies'],
  [/(x|ch|ss|sh)$/i,        '$1es'],
  [/(matr|vert|append)(ix|ices)$/i, '$1ices'],
  [/^(m)en$/i,              '$1en'],
  [/(quiz)zes$/i,           '$1zes'],
  [/(database)s$/i,         '$1s'],
  [/s$/i,                   's'],
  [/$/,                     's'],
];

// ---------------------------------------------------------------------------
// Singularization rules: [regex, replacement]  (applied in order, first match wins)
// ---------------------------------------------------------------------------
const SINGULAR_RULES: [RegExp, string][] = [
  [/(quiz)zes$/i,                              '$1'],
  [/(matr)ices$/i,                             '$1ix'],
  [/(vert|ind)ices$/i,                         '$1ex'],
  [/^(ox)en/i,                                 '$1'],
  [/(alias|status)es$/i,                       '$1'],
  [/(octop|vir)i$/i,                           '$1us'],
  [/(cris|ax|test)es$/i,                       '$1is'],
  [/(shoe)s$/i,                                '$1'],
  [/(o)es$/i,                                  '$1'],
  [/(bus)es$/i,                                '$1'],
  [/([m|l])ice$/i,                             '$1ouse'],
  [/(x|ch|ss|sh)es$/i,                         '$1'],
  [/(m)ovies$/i,                               '$1ovie'],
  [/(s)eries$/i,                               '$1eries'],
  [/([^aeiouy]|qu)ies$/i,                      '$1y'],
  [/([lr])ves$/i,                              '$1f'],
  [/(thi|shea|lea)ves$/i,                      '$1f'],
  [/(s)hes$/i,                                 '$1he'],
  [/(wi|kni)ves$/i,                            '$1fe'],
  [/(ss)$/i,                                   '$1'],
  [/s$/i,                                      ''],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function applyRules(word: string, rules: [RegExp, string][]): string {
  for (const [regex, replacement] of rules) {
    if (regex.test(word)) {
      return word.replace(regex, replacement);
    }
  }
  return word;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function pluralize(word: string): string {
  const lower = word.toLowerCase();
  if (UNCOUNTABLES.has(lower)) return word;
  const irregular = IRREGULAR_SINGULAR_TO_PLURAL.get(lower);
  if (irregular !== undefined) return irregular;
  // Already plural?
  if (IRREGULAR_PLURAL_TO_SINGULAR.has(lower)) return word;
  return applyRules(word, PLURAL_RULES);
}

export function singularize(word: string): string {
  const lower = word.toLowerCase();
  if (UNCOUNTABLES.has(lower)) return word;
  const irregular = IRREGULAR_PLURAL_TO_SINGULAR.get(lower);
  if (irregular !== undefined) return irregular;
  // Already singular?
  if (IRREGULAR_SINGULAR_TO_PLURAL.has(lower)) return word;
  return applyRules(word, SINGULAR_RULES);
}

export function camelize(word: string, lowFirstLetter = false): string {
  const result = word
    .replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())
    .replace(/^([a-z])/, (c: string) => c.toUpperCase());
  if (lowFirstLetter) {
    return result.charAt(0).toLowerCase() + result.slice(1);
  }
  return result;
}

export function underscore(word: string): string {
  return word
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
}

export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}
