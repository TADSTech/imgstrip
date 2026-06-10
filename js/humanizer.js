const LEVEL_MAP = { mild: 1, moderate: 2, aggressive: 3 };

const RULES = [
  // === Level 1: Phrase replacements (mild) ===
  { level: 1, type: 'phrase', pattern: /\bit is important to note that\b/gi, replace: '' },
  { level: 1, type: 'phrase', pattern: /\bit should be noted that\b/gi, replace: '' },
  { level: 1, type: 'phrase', pattern: /\bit is worth noting that\b/gi, replace: '' },
  { level: 1, type: 'phrase', pattern: /\bin order to\b/gi, replace: 'to' },
  { level: 1, type: 'phrase', pattern: /\bdue to the fact that\b/gi, replace: 'because' },
  { level: 1, type: 'phrase', pattern: /\bat this point in time\b/gi, replace: 'now' },
  { level: 1, type: 'phrase', pattern: /\bin the event that\b/gi, replace: 'if' },
  { level: 1, type: 'phrase', pattern: /\bas a matter of fact\b/gi, replace: '' },
  { level: 1, type: 'phrase', pattern: /\bthe majority of\b/gi, replace: 'most' },
  { level: 1, type: 'phrase', pattern: /\ba number of\b/gi, replace: 'some' },
  { level: 1, type: 'phrase', pattern: /\bin close proximity\b/gi, replace: 'near' },
  { level: 1, type: 'phrase', pattern: /\bprior to\b/gi, replace: 'before' },
  { level: 1, type: 'phrase', pattern: /\bsubsequent to\b/gi, replace: 'after' },
  { level: 1, type: 'phrase', pattern: /\bwith the exception of\b/gi, replace: 'except' },
  { level: 1, type: 'phrase', pattern: /\bin the vicinity of\b/gi, replace: 'near' },
  { level: 1, type: 'phrase', pattern: /\bon a daily basis\b/gi, replace: 'daily' },
  { level: 1, type: 'phrase', pattern: /\bat the end of the day\b/gi, replace: '' },
  { level: 1, type: 'phrase', pattern: /\bin this day and age\b/gi, replace: 'today' },

  // === Level 1: Filler words ===
  { level: 1, type: 'filler', pattern: /\bactually\b/gi, replace: '' },
  { level: 1, type: 'filler', pattern: /\bbasically\b/gi, replace: '' },
  { level: 1, type: 'filler', pattern: /\bessentially\b/gi, replace: '' },
  { level: 1, type: 'filler', pattern: /\bfrankly\b/gi, replace: '' },
  { level: 1, type: 'filler', pattern: /\bhonestly\b/gi, replace: '' },
  { level: 1, type: 'filler', pattern: /\blower\b/gi, replace: '' },
  { level: 1, type: 'filler', pattern: /\bnonetheless\b/gi, replace: 'still' },
  { level: 1, type: 'filler', pattern: /\bnevertheless\b/gi, replace: 'still' },
  { level: 1, type: 'filler', pattern: /\bfurthermore\b/gi, replace: '' },
  { level: 1, type: 'filler', pattern: /\bmoreover\b/gi, replace: '' },
  { level: 1, type: 'filler', pattern: /\bconsequently\b/gi, replace: 'so' },
  { level: 1, type: 'filler', pattern: /\badditionally\b/gi, replace: '' },
  { level: 1, type: 'filler', pattern: /\bthus\b/gi, replace: 'so' },
  { level: 1, type: 'filler', pattern: /\bhence\b/gi, replace: 'so' },

  // === Level 1: Chatbot artifacts ===
  { level: 1, type: 'cleanup', pattern: /\bI hope this helps\b[.!]?/gi, replace: '' },
  { level: 1, type: 'cleanup', pattern: /\bLet me know if you.*?\b/gi, replace: '' },
  { level: 1, type: 'cleanup', pattern: /\bGreat question\b[.!]?/gi, replace: '' },
  { level: 1, type: 'cleanup', pattern: /\bCertainly[.!]?\s*/gi, replace: '' },
  { level: 1, type: 'cleanup', pattern: /\bOf course[.!]?\s*/gi, replace: '' },
  { level: 1, type: 'cleanup', pattern: /\bYou('re| are) absolutely right\b[.!]?/gi, replace: '' },

  // === Level 2: AI vocabulary (moderate) ===
  { level: 2, type: 'vocab', pattern: /\bserves as\b/gi, replace: 'is' },
  { level: 2, type: 'vocab', pattern: /\bstands as\b/gi, replace: 'is' },
  { level: 2, type: 'vocab', pattern: /\bacts as\b/gi, replace: 'is' },
  { level: 2, type: 'vocab', pattern: /\bboasts\b/gi, replace: 'has' },
  { level: 2, type: 'vocab', pattern: /\bshowcases\b/gi, replace: 'shows' },
  { level: 2, type: 'vocab', pattern: /\bunderscores\b/gi, replace: 'shows' },
  { level: 2, type: 'vocab', pattern: /\bhighlights\b/gi, replace: 'shows' },
  { level: 2, type: 'vocab', pattern: /\bfostering\b/gi, replace: 'building' },
  { level: 2, type: 'vocab', pattern: /\boverarching\b/gi, replace: '' },
  { level: 2, type: 'vocab', pattern: /\bpivotal\b/gi, replace: 'important' },
  { level: 2, type: 'vocab', pattern: /\bgroundbreaking\b/gi, replace: 'important' },
  { level: 2, type: 'vocab', pattern: /\brenowned\b/gi, replace: 'well-known' },
  { level: 2, type: 'vocab', pattern: /\bintricate\b/gi, replace: '' },
  { level: 2, type: 'vocab', pattern: /\bintricacies\b/gi, replace: '' },
  { level: 2, type: 'vocab', pattern: /\binterplay\b/gi, replace: '' },
  { level: 2, type: 'vocab', pattern: /\btapestry\b/gi, replace: '' },
  { level: 2, type: 'vocab', pattern: /\btestament\b/gi, replace: '' },
  { level: 2, type: 'vocab', pattern: /\bdelves?\s+into\b/gi, replace: 'explores' },
  { level: 2, type: 'vocab', pattern: /\bnavigating\s+the\s+complexities?\b/gi, replace: 'handling' },
  { level: 2, type: 'vocab', pattern: /\bspearheaded\b/gi, replace: 'led' },
  { level: 2, type: 'vocab', pattern: /\bgarners?\b/gi, replace: 'gets' },
  { level: 2, type: 'vocab', pattern: /\bmeshes?\b/gi, replace: 'mixes' },
  { level: 2, type: 'vocab', pattern: /\bnestled\b/gi, replace: 'located' },
  { level: 2, type: 'vocab', pattern: /\bin the heart of\b/gi, replace: 'in' },
  { level: 2, type: 'vocab', pattern: /\bvibrant\b/gi, replace: '' },
  { level: 2, type: 'vocab', pattern: /\bembody\b/gi, replace: 'are' },
  { level: 2, type: 'vocab', pattern: /\bembodies\b/gi, replace: 'is' },
  { level: 2, type: 'vocab', pattern: /\bmust-visit\b/gi, replace: '' },
  { level: 2, type: 'vocab', pattern: /\bbreathtaking\b/gi, replace: '' },
  { level: 2, type: 'vocab', pattern: /\bstunning\b/gi, replace: '' },
  { level: 2, type: 'vocab', pattern: /\benriching\b/gi, replace: '' },
  { level: 2, type: 'vocab', pattern: /\bvaluable\b/gi, replace: 'useful' },

  // === Level 2: Hedging ===
  { level: 2, type: 'hedging', pattern: /\bit could be argued that\b/gi, replace: '' },
  { level: 2, type: 'hedging', pattern: /\bit could potentially\b/gi, replace: 'it may' },
  { level: 2, type: 'hedging', pattern: /\bpossibly might\b/gi, replace: 'might' },
  { level: 2, type: 'hedging', pattern: /\bup to my last training\b.+/gi, replace: '' },

  // === Level 2: Weasel words ===
  { level: 2, type: 'weasel', pattern: /\bindustry reports? suggest\b/gi, replace: 'reports suggest' },
  { level: 2, type: 'weasel', pattern: /\bobservers have noted\b/gi, replace: '' },
  { level: 2, type: 'weasel', pattern: /\bexperts? (argue|believe|suggest)\b/gi, replace: '' },
  { level: 2, type: 'weasel', pattern: /\bsome critics argue\b/gi, replace: '' },

  // === Level 2: Style fixes ===
  { level: 2, type: 'style', pattern: /\u2014/g, replace: ' \u2014 ' },
  { level: 2, type: 'style', pattern: /\u2013/g, replace: '-' },
  { level: 2, type: 'style', pattern: /\u201c|\u201d/g, replace: '"' },
  { level: 2, type: 'style', pattern: /\u2018|\u2019/g, replace: "'" },

  // === Level 2: Significance inflation ===
  { level: 2, type: 'inflate', pattern: /\ba testament to\b/gi, replace: '' },
  { level: 2, type: 'inflate', pattern: /\ba vital role\b/gi, replace: 'an important role' },
  { level: 2, type: 'inflate', pattern: /\ba crucial role\b/gi, replace: 'a role' },
  { level: 2, type: 'inflate', pattern: /\ba pivotal moment\b/gi, replace: 'a moment' },
  { level: 2, type: 'inflate', pattern: /\bkey turning point\b/gi, replace: 'turning point' },
  { level: 2, type: 'inflate', pattern: /\bevolving landscape\b/gi, replace: 'changes' },
  { level: 2, type: 'inflate', pattern: /\bmarks? a shift\b/gi, replace: 'shifts' },
  { level: 2, type: 'inflate', pattern: /\bsetting the stage for\b/gi, replace: '' },
  { level: 2, type: 'inflate', pattern: /\bindelible mark\b/gi, replace: 'mark' },

  // === Level 2: Signposting ===
  { level: 2, type: 'signpost', pattern: /\bLet's dive in\b/gi, replace: '' },
  { level: 2, type: 'signpost', pattern: /\bLet's explore\b/gi, replace: '' },
  { level: 2, type: 'signpost', pattern: /\bLet's break this down\b/gi, replace: '' },
  { level: 2, type: 'signpost', pattern: /\bHere('s| is) what you need to know\b/gi, replace: '' },
  { level: 2, type: 'signpost', pattern: /\bwithout further ado\b/gi, replace: '' },
  { level: 2, type: 'signpost', pattern: /\bIn conclusion\b/gi, replace: '' },

  // === Level 3: Aggressive ===
  { level: 3, type: 'aggressive', pattern: /\bIt's not just about\b[^.]*?;\s*it's\b/gi, replace: '' },
  { level: 3, type: 'aggressive', pattern: /\bNot only\b[^.]*?,\s*but\b/gi, replace: '' },
  { level: 3, type: 'aggressive', pattern: /\bThe future looks bright\b[^.]*\./gi, replace: '' },
  { level: 3, type: 'aggressive', pattern: /\bExciting times lie ahead\b[^.]*\./gi, replace: '' },
  { level: 3, type: 'aggressive', pattern: /\bThe journey toward excellence\b[^.]*\./gi, replace: '' },
  { level: 3, type: 'aggressive', pattern: /\bcross-functional\b/gi, replace: 'cross functional' },
  { level: 3, type: 'aggressive', pattern: /\bdata-driven\b/gi, replace: 'data driven' },
  { level: 3, type: 'aggressive', pattern: /\bdecision-making\b/gi, replace: 'decision making' },
  { level: 3, type: 'aggressive', pattern: /\bhigh-quality\b/gi, replace: 'high quality' },
  { level: 3, type: 'aggressive', pattern: /\breal-time\b/gi, replace: 'real time' },
  { level: 3, type: 'aggressive', pattern: /\bend-to-end\b/gi, replace: 'end to end' },
  { level: 3, type: 'aggressive', pattern: /\blong-term\b/gi, replace: 'long term' },
  { level: 3, type: 'aggressive', pattern: /\bclient-facing\b/gi, replace: 'client facing' },
  { level: 3, type: 'aggressive', pattern: /\bthird-party\b/gi, replace: 'third party' },
  { level: 3, type: 'aggressive', pattern: /\bwell-known\b/gi, replace: 'well known' },
];

function cleanWhitespace(text) {
  return text
    .replace(/  +/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/, ,/g, ',')
    .replace(/\. \./g, '.')
    .replace(/^, /, '')
    .replace(/^\./, '')
    .trim();
}

function addContractions(text) {
  return text
    .replace(/\bit is\b/gi, "it's")
    .replace(/\bthey are\b/gi, "they're")
    .replace(/\bwe are\b/gi, "we're")
    .replace(/\bhe is\b/gi, "he's")
    .replace(/\bshe is\b/gi, "she's")
    .replace(/\bthat is\b/gi, "that's")
    .replace(/\bthere is\b/gi, "there's")
    .replace(/\bwhat is\b/gi, "what's")
    .replace(/\bwho is\b/gi, "who's")
    .replace(/\bcannot\b/gi, "can't")
    .replace(/\bwill not\b/gi, "won't")
    .replace(/\bdo not\b/gi, "don't")
    .replace(/\bdoes not\b/gi, "doesn't")
    .replace(/\bdid not\b/gi, "didn't")
    .replace(/\bis not\b/gi, "isn't")
    .replace(/\bare not\b/gi, "aren't")
    .replace(/\bhas not\b/gi, "hasn't")
    .replace(/\bhave not\b/gi, "haven't")
    .replace(/\bwould not\b/gi, "wouldn't")
    .replace(/\bcould not\b/gi, "couldn't")
    .replace(/\bshould not\b/gi, "shouldn't")
    .replace(/\bI am\b/gi, "I'm")
    .replace(/\bI have\b/gi, "I've")
    .replace(/\bI will\b/gi, "I'll")
    .replace(/\bwe have\b/gi, "we've")
    .replace(/\bwe will\b/gi, "we'll")
    .replace(/\bthey have\b/gi, "they've")
    .replace(/\bthey will\b/gi, "they'll");
}

function breakLongSentences(text, maxWords = 35) {
  return text.replace(/[^.!?]+[.!?]+/g, (sentence) => {
    const trimmed = sentence.trim();
    const words = trimmed.split(/\s+/);
    if (words.length <= maxWords) return sentence;

    const conjunctions = ['and', 'but', 'or', 'so', 'yet'];
    const mid = Math.floor(words.length / 2);
    for (let i = mid; i < words.length; i++) {
      if (conjunctions.includes(words[i].toLowerCase().replace(/[,;:]/, ''))) {
        const breakPoint = trimmed.indexOf(words[i]);
        return trimmed.slice(0, breakPoint) + '. ' +
               words[i].charAt(0).toUpperCase() + words[i].slice(1) +
               trimmed.slice(breakPoint + words[i].length);
      }
    }
    return sentence;
  });
}

function varySentenceOpenings(text) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  if (sentences.length < 3) return text;

  const openers = [
    '', '', '',
    'Interestingly, ',
    'Notably, ',
    'In practice, ',
    'For context, ',
    'Meanwhile, ',
    'On the other hand, ',
    'Still, ',
    'Beyond that, ',
  ];

  let result = sentences[0];
  for (let i = 1; i < sentences.length; i++) {
    const prevLen = sentences[i - 1].trim().split(/\s+/).length;
    const currLen = sentences[i].trim().split(/\s+/).length;

    if (currLen >= 12 && prevLen >= 8) {
      const pick = Math.floor(Math.random() * (openers.length - 3)) + 3;
      result += ' ' + openers[pick] + sentences[i].trim().charAt(0).toLowerCase() + sentences[i].trim().slice(1);
    } else {
      result += ' ' + sentences[i];
    }
  }
  return result;
}

function reduceRuleOfThree(text) {
  const rule3 = /\b(\w+(?:\s+\w+){0,3}),\s+(\w+(?:\s+\w+){0,3}),\s+and\s+(\w+(?:\s+\w+){0,3})\b/gi;
  return text.replace(rule3, (match, a, b, c) => {
    return `${a} and ${b}`;
  });
}

export function humanize(text, level = 'moderate') {
  if (!text) return '';

  const maxLevel = LEVEL_MAP[level] || 2;
  let result = text;

  for (const rule of RULES) {
    if (rule.level <= maxLevel) {
      result = result.replace(rule.pattern, rule.replace);
    }
  }

  result = cleanWhitespace(result);

  if (maxLevel >= 2) {
    result = reduceRuleOfThree(result);
  }

  if (maxLevel >= 3) {
    result = breakLongSentences(result);
    result = addContractions(result);
    result = varySentenceOpenings(result);
  }

  result = result.replace(/[ \t]+/g, ' ').replace(/^[,\s]+/, '').replace(/^[.\s]+/, '').trim();

  return result;
}
