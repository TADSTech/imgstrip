/**
 * humanizer.js — v2
 * ------------------------------------------------------------------
 * A text-cleanup engine that rewrites stiff, robotic, or over-formal
 * prose into something plainer and more natural. It strips filler,
 * swaps inflated vocabulary for plain words, normalizes typography,
 * repairs the punctuation/casing damage those edits cause, and can
 * optionally add contractions and split run-on sentences.
 *
 * Design goals for this version:
 *   - Correctness first: no rule silently deletes meaningful content.
 *   - Safe by construction: code spans, URLs, and (optionally) quotes
 *     are masked before transforming and restored afterward.
 *   - Deterministic: a seeded PRNG replaces Math.random so the same
 *     input + options always yields the same output.
 *   - Observable: humanize() can return per-category change stats.
 *   - Configurable: every transform is an opt-in/opt-out flag.
 *
 * Usage (ESM):
 *   import { humanize } from './humanizer.js';
 *   const out = humanize(text, { level: 'moderate' });
 *
 * Usage (with stats):
 *   const { text, stats } = humanize(input, { level: 'aggressive', report: true });
 *
 * CLI:
 *   node humanizer.js --level aggressive < input.txt > output.txt
 *   node humanizer.js --selftest
 * ------------------------------------------------------------------
 */

const LEVEL_MAP = { mild: 1, moderate: 2, aggressive: 3 };

/* ==================================================================
 * 1. Deterministic randomness
 * Seeded so output is reproducible. Used only by optional transforms.
 * ================================================================== */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ==================================================================
 * 2. Case helpers
 * ================================================================== */

function isUpperChar(ch) {
  return ch === ch.toUpperCase() && ch !== ch.toLowerCase();
}

function capitalizeFirst(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Mirror the casing of `sample`'s first letter onto `replacement`.
function matchLeadingCase(replacement, sample) {
  if (!replacement || !sample) return replacement;
  return isUpperChar(sample.charAt(0)) ? capitalizeFirst(replacement) : replacement;
}

/* ==================================================================
 * 3. Rule table
 * Each rule: { level, category, pattern, replace }
 *   - `replace` may be a string or a function (match, ...groups).
 *   - When `replace` is a plain string, the engine automatically
 *     preserves the leading capitalization of whatever it replaced,
 *     so "In order to" -> "To", not "to".
 * Nothing here deletes a noun the user actually wrote; deletions are
 * limited to filler, hedges, and self-referential chatbot scaffolding.
 * ================================================================== */

const RULES = [
  // ---- Level 1: wordy phrases -> plain equivalents ----
  { level: 1, category: 'phrase', pattern: /\bit is important to note that\b/gi, replace: '' },
  { level: 1, category: 'phrase', pattern: /\bit should be noted that\b/gi, replace: '' },
  { level: 1, category: 'phrase', pattern: /\bit is worth noting that\b/gi, replace: '' },
  { level: 1, category: 'phrase', pattern: /\bit is worth mentioning that\b/gi, replace: '' },
  { level: 1, category: 'phrase', pattern: /\bin order to\b/gi, replace: 'to' },
  { level: 1, category: 'phrase', pattern: /\bdue to the fact that\b/gi, replace: 'because' },
  { level: 1, category: 'phrase', pattern: /\bfor the purpose of\b/gi, replace: 'to' },
  { level: 1, category: 'phrase', pattern: /\bin the process of\b/gi, replace: '' },
  { level: 1, category: 'phrase', pattern: /\bat this point in time\b/gi, replace: 'now' },
  { level: 1, category: 'phrase', pattern: /\bat the present time\b/gi, replace: 'now' },
  { level: 1, category: 'phrase', pattern: /\bin the event that\b/gi, replace: 'if' },
  { level: 1, category: 'phrase', pattern: /\bas a matter of fact\b/gi, replace: '' },
  { level: 1, category: 'phrase', pattern: /\bthe majority of\b/gi, replace: 'most' },
  { level: 1, category: 'phrase', pattern: /\ba number of\b/gi, replace: 'several' },
  { level: 1, category: 'phrase', pattern: /\ba wide range of\b/gi, replace: 'many' },
  { level: 1, category: 'phrase', pattern: /\ba variety of\b/gi, replace: 'various' },
  { level: 1, category: 'phrase', pattern: /\ba myriad of\b/gi, replace: 'many' },
  { level: 1, category: 'phrase', pattern: /\ba plethora of\b/gi, replace: 'many' },
  { level: 1, category: 'phrase', pattern: /\bin close proximity\b/gi, replace: 'near' },
  { level: 1, category: 'phrase', pattern: /\bprior to\b/gi, replace: 'before' },
  { level: 1, category: 'phrase', pattern: /\bsubsequent to\b/gi, replace: 'after' },
  { level: 1, category: 'phrase', pattern: /\bwith the exception of\b/gi, replace: 'except' },
  { level: 1, category: 'phrase', pattern: /\bin the vicinity of\b/gi, replace: 'near' },
  { level: 1, category: 'phrase', pattern: /\bon a daily basis\b/gi, replace: 'daily' },
  { level: 1, category: 'phrase', pattern: /\bon a regular basis\b/gi, replace: 'regularly' },
  { level: 1, category: 'phrase', pattern: /\bat the end of the day\b/gi, replace: '' },
  { level: 1, category: 'phrase', pattern: /\bin this day and age\b/gi, replace: 'today' },
  { level: 1, category: 'phrase', pattern: /\bin today's fast-paced world\b/gi, replace: 'today' },
  { level: 1, category: 'phrase', pattern: /\bwhen it comes to\b/gi, replace: 'with' },
  { level: 1, category: 'phrase', pattern: /\bneedless to say,?\b/gi, replace: '' },
  { level: 1, category: 'phrase', pattern: /\brest assured,?\b/gi, replace: '' },

  // ---- Level 1: filler words ----
  { level: 1, category: 'filler', pattern: /\bactually\b/gi, replace: '' },
  { level: 1, category: 'filler', pattern: /\bbasically\b/gi, replace: '' },
  { level: 1, category: 'filler', pattern: /\bessentially\b/gi, replace: '' },
  { level: 1, category: 'filler', pattern: /\bfundamentally\b/gi, replace: '' },
  { level: 1, category: 'filler', pattern: /\bfrankly\b/gi, replace: '' },
  { level: 1, category: 'filler', pattern: /\bhonestly\b/gi, replace: '' },
  { level: 1, category: 'filler', pattern: /\bsimply put,?\b/gi, replace: '' },
  // NOTE: the original file had /\blower\b/ -> '' here, which deleted the
  // ordinary word "lower" everywhere. It was almost certainly meant to be
  // "however". Fixed:
  { level: 1, category: 'filler', pattern: /\bhowever\b/gi, replace: 'but' },
  { level: 1, category: 'filler', pattern: /\bnonetheless\b/gi, replace: 'still' },
  { level: 1, category: 'filler', pattern: /\bnevertheless\b/gi, replace: 'still' },
  { level: 1, category: 'filler', pattern: /\bfurthermore\b/gi, replace: '' },
  { level: 1, category: 'filler', pattern: /\bmoreover\b/gi, replace: '' },
  { level: 1, category: 'filler', pattern: /\bconsequently\b/gi, replace: 'so' },
  { level: 1, category: 'filler', pattern: /\badditionally\b/gi, replace: '' },
  { level: 1, category: 'filler', pattern: /\bthus\b/gi, replace: 'so' },
  { level: 1, category: 'filler', pattern: /\bhence\b/gi, replace: 'so' },
  { level: 1, category: 'filler', pattern: /\btherefore\b/gi, replace: 'so' },

  // ---- Level 1: chatbot scaffolding ----
  { level: 1, category: 'cleanup', pattern: /\bI hope this helps\b[.!]?/gi, replace: '' },
  { level: 1, category: 'cleanup', pattern: /\bLet me know if you[^.!?]*[.!?]/gi, replace: '' },
  { level: 1, category: 'cleanup', pattern: /\bGreat question\b[.!]?/gi, replace: '' },
  { level: 1, category: 'cleanup', pattern: /\bCertainly[.!]?\s*/gi, replace: '' },
  { level: 1, category: 'cleanup', pattern: /\bOf course[.!,]?\s*/gi, replace: '' },
  { level: 1, category: 'cleanup', pattern: /\bYou('re| are) absolutely right\b[.!]?/gi, replace: '' },
  { level: 1, category: 'cleanup', pattern: /\bAs an AI language model,?\s*/gi, replace: '' },

  // ---- Level 2: emoji stripping ----
  { level: 2, category: 'emoji', pattern: /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{FE0F}]/gu, replace: '' },

  // ---- Level 2: inflated vocabulary -> plain words ----
  { level: 2, category: 'vocab', pattern: /\bserves as\b/gi, replace: 'is' },
  { level: 2, category: 'vocab', pattern: /\bstands as\b/gi, replace: 'is' },
  { level: 2, category: 'vocab', pattern: /\bacts as\b/gi, replace: 'is' },
  { level: 2, category: 'vocab', pattern: /\bboasts\b/gi, replace: 'has' },
  { level: 2, category: 'vocab', pattern: /\bshowcases\b/gi, replace: 'shows' },
  { level: 2, category: 'vocab', pattern: /\bunderscores\b/gi, replace: 'shows' },
  { level: 2, category: 'vocab', pattern: /\bhighlights\b/gi, replace: 'shows' },
  { level: 2, category: 'vocab', pattern: /\bfostering\b/gi, replace: 'building' },
  { level: 2, category: 'vocab', pattern: /\bfoster\b/gi, replace: 'build' },
  { level: 2, category: 'vocab', pattern: /\bpivotal\b/gi, replace: 'important' },
  { level: 2, category: 'vocab', pattern: /\bgroundbreaking\b/gi, replace: 'important' },
  { level: 2, category: 'vocab', pattern: /\brenowned\b/gi, replace: 'well known' },
  { level: 2, category: 'vocab', pattern: /\bdelves?\s+into\b/gi, replace: 'explores' },
  { level: 2, category: 'vocab', pattern: /\bdive\s+deep\s+into\b/gi, replace: 'examine' },
  { level: 2, category: 'vocab', pattern: /\bdeep\s+dive\b/gi, replace: 'review' },
  { level: 2, category: 'vocab', pattern: /\bnavigating\s+the\s+complexit(?:y|ies)\b/gi, replace: 'handling' },
  { level: 2, category: 'vocab', pattern: /\bspearheaded\b/gi, replace: 'led' },
  { level: 2, category: 'vocab', pattern: /\bgarners?\b/gi, replace: 'gets' },
  { level: 2, category: 'vocab', pattern: /\bnestled\b/gi, replace: 'located' },
  { level: 2, category: 'vocab', pattern: /\bin the heart of\b/gi, replace: 'in' },
  { level: 2, category: 'vocab', pattern: /\bembody\b/gi, replace: 'are' },
  { level: 2, category: 'vocab', pattern: /\bembodies\b/gi, replace: 'is' },
  { level: 2, category: 'vocab', pattern: /\bvaluable\b/gi, replace: 'useful' },
  { level: 2, category: 'vocab', pattern: /\bleverage\b/gi, replace: 'use' },
  { level: 2, category: 'vocab', pattern: /\bleverages\b/gi, replace: 'uses' },
  { level: 2, category: 'vocab', pattern: /\butili[sz]e\b/gi, replace: 'use' },
  { level: 2, category: 'vocab', pattern: /\butili[sz]es\b/gi, replace: 'uses' },
  { level: 2, category: 'vocab', pattern: /\bfacilitate\b/gi, replace: 'help' },
  { level: 2, category: 'vocab', pattern: /\bcommence\b/gi, replace: 'start' },
  { level: 2, category: 'vocab', pattern: /\bendeavor\b/gi, replace: 'try' },
  { level: 2, category: 'vocab', pattern: /\bnumerous\b/gi, replace: 'many' },
  { level: 2, category: 'vocab', pattern: /\bapproximately\b/gi, replace: 'about' },
  { level: 2, category: 'vocab', pattern: /\bsufficient\b/gi, replace: 'enough' },
  { level: 2, category: 'vocab', pattern: /\bobtain\b/gi, replace: 'get' },
  { level: 2, category: 'vocab', pattern: /\bregarding\b/gi, replace: 'about' },
  { level: 2, category: 'vocab', pattern: /\bseamless(?:ly)?\b/gi, replace: 'smooth' },
  { level: 2, category: 'vocab', pattern: /\bcutting-edge\b/gi, replace: 'advanced' },
  { level: 2, category: 'vocab', pattern: /\bstate-of-the-art\b/gi, replace: 'advanced' },
  { level: 2, category: 'vocab', pattern: /\bgame-changer\b/gi, replace: 'major change' },
  { level: 2, category: 'vocab', pattern: /\bholistic\b/gi, replace: 'overall' },

  // ---- Level 2: empty intensifiers (delete) ----
  { level: 2, category: 'vocab', pattern: /\boverarching\b/gi, replace: '' },
  { level: 2, category: 'vocab', pattern: /\bintricate\b/gi, replace: '' },
  { level: 2, category: 'vocab', pattern: /\bvibrant\b/gi, replace: '' },
  { level: 2, category: 'vocab', pattern: /\bmust-visit\b/gi, replace: '' },
  { level: 2, category: 'vocab', pattern: /\bbreathtaking\b/gi, replace: '' },
  { level: 2, category: 'vocab', pattern: /\bstunning\b/gi, replace: '' },
  { level: 2, category: 'vocab', pattern: /\benriching\b/gi, replace: '' },
  { level: 2, category: 'vocab', pattern: /\brobust\b/gi, replace: '' },
  { level: 2, category: 'vocab', pattern: /\bcomprehensive\b/gi, replace: '' },
  { level: 2, category: 'vocab', pattern: /\bunlock\b/gi, replace: 'enable' },
  { level: 2, category: 'vocab', pattern: /\btransformative\b/gi, replace: 'significant' },
  { level: 2, category: 'vocab', pattern: /\bunprecedented\b/gi, replace: '' },
  { level: 2, category: 'vocab', pattern: /\btapestry\b/gi, replace: 'mix' },
  { level: 2, category: 'vocab', pattern: /\bmultifaceted\b/gi, replace: 'complex' },
  { level: 2, category: 'vocab', pattern: /\bnuanced\b/gi, replace: 'detailed' },
  { level: 2, category: 'vocab', pattern: /\bthe\s+intersection\s+of\b/gi, replace: 'the overlap of' },
  { level: 2, category: 'vocab', pattern: /\bnatural\s+language\s+processing\b/gi, replace: 'text processing' },
  { level: 2, category: 'vocab', pattern: /\bdelve\b/gi, replace: 'look' },

  // ---- Level 2: epistemic cowardice / servile positivity ----
  { level: 2, category: 'servile', pattern: /\bI(?:'d|\s+would)\s+be\s+happy\s+to\b/gi, replace: 'I will' },
  { level: 2, category: 'servile', pattern: /\bI(?:'d|\s+would)\s+be\s+glad\s+to\b/gi, replace: 'I will' },
  { level: 2, category: 'servile', pattern: /\bI'm\s+happy\s+to\s+(?:help\s+)?(?:assist|help)\b/gi, replace: 'I can' },
  { level: 2, category: 'servile', pattern: /\bI(?:'d|\s+would)\s+be\s+delighted\s+to\b/gi, replace: 'I will' },
  { level: 2, category: 'servile', pattern: /\bplease\s+feel\s+free\s+to\b/gi, replace: 'please' },

  // ---- Level 2: confidence without substance ----
  { level: 2, category: 'inflate', pattern: /\bIt's?\s+worth\s+noting\s+that\b/gi, replace: '' },
  { level: 2, category: 'inflate', pattern: /\bWhat's\s+more,?\b/gi, replace: '' },
  { level: 2, category: 'inflate', pattern: /\bImportantly,?\b/gi, replace: '' },
  { level: 2, category: 'inflate', pattern: /\bNotably,?\b/gi, replace: '' },
  { level: 2, category: 'inflate', pattern: /\bMore\s+importantly,?\b/gi, replace: '' },
  { level: 2, category: 'inflate', pattern: /\bIndeed,?\b/gi, replace: '' },
  { level: 2, category: 'inflate', pattern: /\bOf\s+course,?\b/gi, replace: '' },

  // ---- Level 2: hedging ----
  { level: 2, category: 'hedging', pattern: /\bit could be argued that\b/gi, replace: '' },
  { level: 2, category: 'hedging', pattern: /\bit could potentially\b/gi, replace: 'it may' },
  { level: 2, category: 'hedging', pattern: /\bpossibly might\b/gi, replace: 'might' },
  { level: 2, category: 'hedging', pattern: /\bit is worth considering that\b/gi, replace: '' },
  { level: 2, category: 'hedging', pattern: /\bup to my last (?:training|update)[^.!?]*/gi, replace: '' },

  // ---- Level 2: weasel attributions ----
  { level: 2, category: 'weasel', pattern: /\bindustry reports? suggest\b/gi, replace: 'reports suggest' },
  { level: 2, category: 'weasel', pattern: /\bobservers have noted\b/gi, replace: '' },
  { level: 2, category: 'weasel', pattern: /\bexperts? (?:argue|believe|suggest)\b/gi, replace: '' },
  { level: 2, category: 'weasel', pattern: /\bsome critics argue\b/gi, replace: '' },

  // ---- Level 2: typography normalization ----
  // Em dash strategy is handled separately (configurable). Here we only
  // normalize en dashes and smart quotes to plain ASCII.
  { level: 2, category: 'typography', pattern: /\u2013/g, replace: '-' },
  { level: 2, category: 'typography', pattern: /[\u201c\u201d]/g, replace: '"' },
  { level: 2, category: 'typography', pattern: /[\u2018\u2019]/g, replace: "'" },
  { level: 2, category: 'typography', pattern: /\u2026/g, replace: '...' },

  // ---- Level 2: significance inflation ----
  { level: 2, category: 'inflate', pattern: /\ba testament to\b/gi, replace: '' },
  { level: 2, category: 'inflate', pattern: /\ba vital role\b/gi, replace: 'an important role' },
  { level: 2, category: 'inflate', pattern: /\ba crucial role\b/gi, replace: 'a role' },
  { level: 2, category: 'inflate', pattern: /\ba pivotal moment\b/gi, replace: 'a moment' },
  { level: 2, category: 'inflate', pattern: /\bkey turning point\b/gi, replace: 'turning point' },
  { level: 2, category: 'inflate', pattern: /\bevolving landscape\b/gi, replace: 'changes' },
  { level: 2, category: 'inflate', pattern: /\bsetting the stage for\b/gi, replace: '' },
  { level: 2, category: 'inflate', pattern: /\bindelible mark\b/gi, replace: 'mark' },
  { level: 2, category: 'inflate', pattern: /\bplays? a significant role\b/gi, replace: 'matters' },

  // ---- Level 2: signposting ----
  { level: 2, category: 'signpost', pattern: /\bLet's dive in\b[.!]?/gi, replace: '' },
  { level: 2, category: 'signpost', pattern: /\bLet's explore\b/gi, replace: '' },
  { level: 2, category: 'signpost', pattern: /\bLet's break this down\b[.!]?/gi, replace: '' },
  { level: 2, category: 'signpost', pattern: /\bHere('s| is) what you need to know\b[.!:]?/gi, replace: '' },
  { level: 2, category: 'signpost', pattern: /\bwithout further ado\b/gi, replace: '' },
  { level: 2, category: 'signpost', pattern: /\bIn conclusion,?\b/gi, replace: '' },
  { level: 2, category: 'signpost', pattern: /\bTo sum up,?\b/gi, replace: '' },
  { level: 2, category: 'signpost', pattern: /\bThat being said,?\b/gi, replace: 'still' },
  { level: 2, category: 'signpost', pattern: /\bMoving forward,?\b/gi, replace: '' },

  // ---- Level 3: aggressive structural tells ----
  { level: 3, category: 'aggressive', pattern: /\bThe future looks bright\b[^.]*\./gi, replace: '' },
  { level: 3, category: 'aggressive', pattern: /\bExciting times lie ahead\b[^.]*\./gi, replace: '' },
  { level: 3, category: 'aggressive', pattern: /\bThe journey toward excellence\b[^.]*\./gi, replace: '' },
  // Compound-modifier de-hyphenation (a common AI-output fingerprint).
  { level: 3, category: 'aggressive', pattern: /\bcross-functional\b/gi, replace: 'cross functional' },
  { level: 3, category: 'aggressive', pattern: /\bdata-driven\b/gi, replace: 'data driven' },
  { level: 3, category: 'aggressive', pattern: /\bdecision-making\b/gi, replace: 'decision making' },
  { level: 3, category: 'aggressive', pattern: /\bhigh-quality\b/gi, replace: 'high quality' },
  { level: 3, category: 'aggressive', pattern: /\breal-time\b/gi, replace: 'real time' },
  { level: 3, category: 'aggressive', pattern: /\bend-to-end\b/gi, replace: 'end to end' },
  { level: 3, category: 'aggressive', pattern: /\blong-term\b/gi, replace: 'long term' },
  { level: 3, category: 'aggressive', pattern: /\bclient-facing\b/gi, replace: 'client facing' },
  { level: 3, category: 'aggressive', pattern: /\bthird-party\b/gi, replace: 'third party' },
];

/* ==================================================================
 * 4. Protection: mask spans we must never edit, then restore them.
 * Order matters: fenced code, inline code, URLs, then quotes.
 * ================================================================== */

const PROTECT_PATTERNS = [
  { name: 'fence', re: /```[\s\S]*?```/g },
  { name: 'inline', re: /`[^`\n]*`/g },
  { name: 'url', re: /\bhttps?:\/\/[^\s)]+/gi },
];

function protect(text, { protectQuotes = false } = {}) {
  const tokens = [];
  let masked = text;

  const patterns = protectQuotes
    ? [...PROTECT_PATTERNS, { name: 'quote', re: /"[^"\n]{0,400}"/g }]
    : PROTECT_PATTERNS;

  for (const { re } of patterns) {
    masked = masked.replace(re, (m) => {
      const id = tokens.length;
      tokens.push(m);
      // Use a token unlikely to collide with rule patterns.
      return `\u0000H${id}\u0000`;
    });
  }
  return { masked, tokens };
}

function restore(text, tokens) {
  // Restore in reverse so nested masks resolve correctly.
  let out = text;
  for (let i = tokens.length - 1; i >= 0; i--) {
    out = out.replace(`\u0000H${i}\u0000`, () => tokens[i]);
  }
  return out;
}

/* ==================================================================
 * 5. Cleanup passes
 * ================================================================== */

function cleanWhitespace(text) {
  return text
    .replace(/[ \t]{2,}/g, ' ')          // collapse runs of spaces
    .replace(/ +([,.;:!?])/g, '$1')      // no space before punctuation
    .replace(/([.!?])\s*,/g, '$1')       // ". ," (orphaned comma after deletion) -> "."
    .replace(/,\s*([.!?])/g, '$1')       // "x , ." -> "x."
    .replace(/([,;:]){2,}/g, '$1')       // collapse doubled punctuation
    .replace(/\.\s*\./g, '.')            // ". ." -> "."
    .replace(/,\s*,/g, ',')              // ", ," -> ","
    .replace(/\(\s+/g, '(')              // "( x" -> "(x"
    .replace(/\s+\)/g, ')')
    .replace(/ +\n/g, '\n')              // trailing spaces on lines
    .replace(/\n{3,}/g, '\n\n')          // cap blank lines
    .replace(/^[ \t,;:.]+/gm, (m) => (m.includes('\n') ? m : ''))
    .trim();
}

// Repair "a/an" agreement, since vocab swaps can change the next word's
// initial sound (e.g. "a groundbreaking" -> "a important"). Heuristic, not
// perfect — English pronunciation has exceptions, handled via small lists.
function fixArticles(text) {
  // Words spelled with a leading vowel but pronounced with a consonant.
  const consonantVowelWords = /^(?:uni|use|user|usu|euro|eu|one|once|u\b)/i;
  // Words spelled with a leading consonant but pronounced with a vowel.
  const vowelConsonantWords = /^(?:hour|honest|honou?r|heir)/i;

  return text.replace(/\b(a|an)\s+([A-Za-z]+)/g, (m, art, word) => {
    const startsVowel = /^[aeiou]/i.test(word);
    let wantAn;
    if (startsVowel) {
      wantAn = !consonantVowelWords.test(word);
    } else {
      wantAn = vowelConsonantWords.test(word);
    }
    const fixed = wantAn ? 'an' : 'a';
    const cased = isUpperChar(art.charAt(0)) ? capitalizeFirst(fixed) : fixed;
    return `${cased} ${word}`;
  });
}


// This repairs casing broken by deletions or lowercase replacements.
function fixSentenceCase(text) {
  // Start of string.
  text = text.replace(/^(\s*)([a-z])/, (_, ws, ch) => ws + ch.toUpperCase());
  // After sentence-ending punctuation.
  text = text.replace(/([.!?]["')\]]?\s+)([a-z])/g, (_, lead, ch) => lead + ch.toUpperCase());
  // Standalone "i" -> "I".
  text = text.replace(/\bi\b/g, 'I');
  return text;
}

/* ==================================================================
 * 6. Contractions (case-preserving)
 * ================================================================== */

const CONTRACTIONS = [
  [/\bit is\b/gi, "it's"],
  [/\bthat is\b/gi, "that's"],
  [/\bthere is\b/gi, "there's"],
  [/\bwhat is\b/gi, "what's"],
  [/\bwho is\b/gi, "who's"],
  [/\bhe is\b/gi, "he's"],
  [/\bshe is\b/gi, "she's"],
  [/\bthey are\b/gi, "they're"],
  [/\bwe are\b/gi, "we're"],
  [/\byou are\b/gi, "you're"],
  [/\bcannot\b/gi, "can't"],
  [/\bwill not\b/gi, "won't"],
  [/\bdo not\b/gi, "don't"],
  [/\bdoes not\b/gi, "doesn't"],
  [/\bdid not\b/gi, "didn't"],
  [/\bis not\b/gi, "isn't"],
  [/\bare not\b/gi, "aren't"],
  [/\bwas not\b/gi, "wasn't"],
  [/\bwere not\b/gi, "weren't"],
  [/\bhas not\b/gi, "hasn't"],
  [/\bhave not\b/gi, "haven't"],
  [/\bhad not\b/gi, "hadn't"],
  [/\bwould not\b/gi, "wouldn't"],
  [/\bcould not\b/gi, "couldn't"],
  [/\bshould not\b/gi, "shouldn't"],
  [/\bI am\b/g, "I'm"],
  [/\bI have\b/g, "I've"],
  [/\bI will\b/g, "I'll"],
  [/\bwe have\b/gi, "we've"],
  [/\bwe will\b/gi, "we'll"],
  [/\bthey have\b/gi, "they've"],
  [/\bthey will\b/gi, "they'll"],
];

function addContractions(text) {
  for (const [re, rep] of CONTRACTIONS) {
    text = text.replace(re, (m) => matchLeadingCase(rep, m));
  }
  return text;
}

/* ==================================================================
 * 7. Sentence-length splitting (correct boundary detection)
 * ================================================================== */

function breakLongSentences(text, maxWords = 35) {
  return text.replace(/(\s*)([^.!?]+[.!?]+)/g, (full, lead, sentence) => {
    const words = sentence.trim().split(/\s+/);
    if (words.length <= maxWords) return full;

    const conjunctions = new Set(['and', 'but', 'or', 'so', 'yet']);
    const mid = Math.floor(words.length / 2);

    // Search outward from the midpoint for the nearest conjunction so the
    // split lands near the middle, not at the first "and" in the string.
    for (let dist = 0; dist < words.length; dist++) {
      for (const i of [mid + dist, mid - dist]) {
        if (i <= 0 || i >= words.length - 1) continue;
        const bare = words[i].toLowerCase().replace(/[^a-z]/g, '');
        if (conjunctions.has(bare)) {
          const first = words.slice(0, i).join(' ').replace(/[,;:]+$/, '');
          const second = words.slice(i + 1).join(' ');
          return `${lead}${first}. ${capitalizeFirst(second)}`;
        }
      }
    }
    return full;
  });
}

/* ==================================================================
 * 8. Optional: vary sentence openings (opt-in, deterministic)
 * Uses neutral connectors only — deliberately avoids "Interestingly/
 * Notably", which are themselves common machine tells.
 * ================================================================== */

function varySentenceOpenings(text, rand) {
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g);
  if (!sentences || sentences.length < 3) return text;

  const openers = ['In practice, ', 'For context, ', 'Meanwhile, ', 'Still, ', 'Beyond that, '];
  let result = sentences[0];

  for (let i = 1; i < sentences.length; i++) {
    const prevLen = sentences[i - 1].trim().split(/\s+/).length;
    const cur = sentences[i];
    const curLen = cur.trim().split(/\s+/).length;
    const alreadyHasOpener = /^\s*(In practice|For context|Meanwhile|Still|Beyond that)/.test(cur);

    if (curLen >= 12 && prevLen >= 8 && !alreadyHasOpener && rand() < 0.35) {
      const opener = openers[Math.floor(rand() * openers.length)];
      const body = cur.replace(/^\s+/, '');
      result += ' ' + opener + body.charAt(0).toLowerCase() + body.slice(1);
    } else {
      result += ' ' + cur.replace(/^\s+/, '');
    }
  }
  return result;
}

/* ==================================================================
 * 9. Optional: collapse rule-of-three (opt-in, LOSSY)
 * The original always ran this and DELETED the third item, changing
 * meaning. It is now off by default and clearly marked lossy. When on,
 * it only collapses lists whose items are single words (lower risk).
 * ================================================================== */

function reduceTriads(text) {
  const rule3 = /\b(\w+),\s+(\w+),\s+and\s+(\w+)\b/gi;
  return text.replace(rule3, (m, a, b) => `${a} and ${b}`);
}

/* ==================================================================
 * 10. Core engine
 * ================================================================== */

function applyRules(text, maxLevel, categories, emDashStrategy, stats) {
  let result = text;

  // Em-dash handling first, configurable. The original kept em dashes
  // (the single most common AI tell); now you choose.
  const emMap = {
    space: ' \u2014 ',
    comma: ', ',
    period: '. ',
    remove: ' ',
    keep: null,
  };
  const emRep = emMap[emDashStrategy] ?? emMap.comma;
  if (emRep !== null) {
    result = result.replace(/\s*\u2014\s*/g, () => {
      stats.typography = (stats.typography || 0) + 1;
      return emRep;
    });
  }

  for (const rule of RULES) {
    if (rule.level > maxLevel) continue;
    if (categories && !categories.has(rule.category)) continue;

    result = result.replace(rule.pattern, (match, ...rest) => {
      stats[rule.category] = (stats[rule.category] || 0) + 1;
      if (typeof rule.replace === 'function') return rule.replace(match, ...rest);
      return matchLeadingCase(rule.replace, match);
    });
  }
  return result;
}

/**
 * humanize(text, options)
 *
 * options:
 *   level         'mild' | 'moderate' | 'aggressive'   (default 'moderate')
 *   categories    string[] — restrict to these rule categories (optional)
 *   contractions  boolean — add contractions (default: true at level 3)
 *   splitLong     boolean — split >35-word sentences (default: true at level 3)
 *   varyOpenings  boolean — opt-in, deterministic (default false)
 *   reduceTriads  boolean — opt-in, LOSSY (default true at level 3)
 *   emDash        'space' | 'comma' | 'period' | 'remove' | 'keep' (default 'comma')
 *   protectQuotes boolean — also shield "quoted text" (default false)
 *   seed          number|string — PRNG seed for deterministic output
 *   maxPasses     number — re-run until stable, capped (default 2)
 *   report        boolean — return { text, stats } instead of a string
 */
export function humanize(text, options = {}) {
  if (!text) return options.report ? { text: '', stats: {} } : '';

  const {
    level = 'moderate',
    categories = null,
    contractions,
    splitLong,
    varyOpenings = false,
    reduceTriads: doTriads,
    emDash = 'comma',
    protectQuotes = false,
    seed,
    maxPasses = 2,
    report = false,
  } = options;

  const maxLevel = LEVEL_MAP[level] || 2;
  const catSet = categories ? new Set(categories) : null;
  const useContractions = contractions ?? maxLevel >= 3;
  const useSplit = splitLong ?? maxLevel >= 3;
  const rand = mulberry32(typeof seed === 'string' ? hashSeed(seed) : (seed ?? hashSeed(text)));

  const { masked, tokens } = protect(text, { protectQuotes });

  const stats = {};
  let result = masked;
  let previous = null;
  let passes = 0;

  // Repeat the rule pass until the text stops changing (idempotent) or
  // the cap is hit. This catches overlapping patterns the single pass
  // in the original missed.
  while (result !== previous && passes < Math.max(1, maxPasses)) {
    previous = result;
    result = applyRules(result, maxLevel, catSet, emDash, stats);
    result = cleanWhitespace(result);
    passes++;
  }

  const useTriads = doTriads ?? maxLevel >= 3;
  if (useTriads && maxLevel >= 2) result = reduceTriads(result);
  if (useSplit) result = breakLongSentences(result);
  if (useContractions) result = addContractions(result);
  if (varyOpenings) result = varySentenceOpenings(result, rand);

  result = fixArticles(result);
  result = fixSentenceCase(result);
  result = cleanWhitespace(result);
  result = restore(result, tokens);

  stats._passes = passes;
  return report ? { text: result, stats } : result;
}

/**
 * analyze(text) — report-only: how many tells exist, without rewriting.
 */
export function analyze(text, level = 'aggressive') {
  const { stats } = humanize(text, { level, report: true });
  delete stats._passes;
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  return { total, byCategory: stats };
}

/* ==================================================================
 * 11. CLI + self-test (only runs under Node, never when imported)
 * ================================================================== */

const isNodeMain =
  typeof process !== 'undefined' &&
  process.argv &&
  /humanizer\.js$/.test(process.argv[1] || '');

function selfTest() {
  const cases = [
    {
      name: 'phrase + filler + casing',
      in: 'In order to succeed, it is important to note that we must actually try.',
      check: (o) => /^To succeed/.test(o) && !/actually/i.test(o),
    },
    {
      name: 'does not delete the word "lower"',
      in: 'Please set the lower limit accordingly.',
      check: (o) => /lower limit/.test(o),
    },
    {
      name: 'rule-of-three is NOT lossy at mild level',
      in: 'We sell apples, oranges, and pears here.',
      check: (o) => /pears/.test(o),
      opts: { level: 'mild' },
    },
    {
      name: 'rule-of-three IS collapsed at aggressive level',
      in: 'We sell apples, oranges, and pears here.',
      check: (o) => !/pears/.test(o) && /apples and oranges/.test(o),
      opts: { level: 'aggressive' },
    },
    {
      name: 'protects code spans',
      in: 'Use `it is important to note` as a literal string.',
      check: (o) => o.includes('`it is important to note`'),
    },
    {
      name: 'protects URLs',
      in: 'See https://example.com/in-order-to/path for details.',
      check: (o) => o.includes('https://example.com/in-order-to/path'),
    },
    {
      name: 'contractions preserve capitalization',
      in: 'It is here. They are gone.',
      check: (o) => /It's here/.test(o) && /They're gone/.test(o),
    },
    {
      name: 'deterministic with a seed',
      in: 'This is sentence one. This is a slightly longer second sentence indeed. And a third long one follows here.',
      check: () => {
        const a = humanize('This is sentence one. This is a slightly longer second sentence indeed. And a third long one follows here.', { level: 'aggressive', varyOpenings: true, seed: 'x' });
        const b = humanize('This is sentence one. This is a slightly longer second sentence indeed. And a third long one follows here.', { level: 'aggressive', varyOpenings: true, seed: 'x' });
        return a === b;
      },
    },
  ];

  let pass = 0;
  for (const c of cases) {
    const opts = c.opts || { level: 'aggressive' };
    const out = humanize(c.in, opts);
    const ok = c.check(out);
    if (ok) pass++;
    console.error(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`);
    if (!ok) console.error(`   in:  ${c.in}\n   out: ${out}`);
  }
  console.error(`\n${pass}/${cases.length} passed`);
  process.exit(pass === cases.length ? 0 : 1);
}

if (isNodeMain) {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) {
    selfTest();
  } else {
    const li = args.indexOf('--level');
    const level = li >= 0 ? args[li + 1] : 'moderate';
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (input += d));
    process.stdin.on('end', () => {
      process.stdout.write(humanize(input, { level }));
    });
  }
}
