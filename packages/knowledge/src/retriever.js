const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'do',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'my',
  'of',
  'on',
  'or',
  'that',
  'the',
  'to',
  'what',
  'when',
  'where',
  'which',
  'with',
  'you',
  'your',
  'la',
  'va',
  'cua',
  'cho',
  'co',
  'duoc',
  'khong',
  'thi',
  'nhu',
  'the',
  'nao',
  'tai',
  'voi',
  'cac',
  'nhung',
  'mot',
]);

const SYNONYM_MAP = Object.freeze({
  cod: ['cash', 'delivery', 'nhan_hang', 'tien_mat'],
  deposit: ['dat_coc', 'coc', 'payos', 'vietqr', 'giu_cho'],
  coc: ['dat_coc', 'deposit', 'payos', 'giu_cho'],
  dat_coc: ['giu_cho', '15_phut', 'deposit', 'payos'],
  giu_cho: ['15_phut', 'reservation', 'dat_coc'],
  bao_lau: ['15_phut', 'thoi_han', 'giu_cho'],
  reservation: ['giu_cho', 'hold', '15', 'expire'],
  hold: ['giu_cho', 'reservation', '15'],
  warranty: ['bao_hanh', 'pdi', 'service'],
  return: ['doi_tra', 'returns', 'refund', 'hoan_tien'],
  returns: ['doi_tra', 'return', 'refund'],
  terms: ['dieu_khoan', 'dieu_kien', 'disclaimer', 'privacy'],
  showroom: [
    'cua_hang',
    'lai_thu',
    'test_ride',
    'hanoi',
    'danang',
    'hcmc',
    'thu_duc',
    'long_bien',
    'son_tra',
  ],
  motorcycle: ['xe', 'xe_may', 'bike', 'dirtbike', 'cao_cao', 'enduro', 'motocross'],
  bike: ['xe', 'motorcycle', 'dirtbike', 'cao_cao'],
  cao: ['cao_cao', 'dirtbike', 'enduro', 'motocross', 'offroad'],
  sag: ['lun_phuoc', 'phuoc', 'suspension', 'seat'],
  lowering: ['ha_yen', 'lowering_link', 'low_seat', 'link'],
  boots: ['giay', 'mx_boots', 'adv_boots', 'footwear'],
});

/**
 * Strip Vietnamese diacritics and convert to lowercase ASCII-safe form.
 * Handles `đ`/`Đ` explicitly before NFD decomposition.
 * @param {string} input
 * @returns {string}
 */
export function foldVietnameseText(input) {
  if (typeof input !== 'string') {
    return '';
  }
  return input
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Tokenize text into unigrams, adjacent bigrams, and accented Vietnamese exact tokens.
 * @param {string} text
 * @param {object} [options]
 * @param {boolean} [options.expandSynonyms]
 * @returns {string[]}
 */
export function tokenizeBilingualText(text, { expandSynonyms = false } = {}) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return [];
  }

  const folded = foldVietnameseText(text);
  const rawWords = folded
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const filteredWords = rawWords.filter((w) => !STOP_WORDS.has(w));
  const baseWords = filteredWords.length > 0 ? filteredWords : rawWords;
  const tokens = [...baseWords];

  for (let i = 0; i < rawWords.length - 1; i += 1) {
    tokens.push(`${rawWords[i]}_${rawWords[i + 1]}`);
  }

  const accentedWords = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2 && /[^\x20-\x7e]/.test(w));

  for (const w of accentedWords) {
    tokens.push(`acc:${w}`);
  }

  if (expandSynonyms) {
    const extra = [];
    for (const token of tokens) {
      const syns = SYNONYM_MAP[token];
      if (syns) {
        for (const syn of syns) {
          extra.push(syn);
        }
      }
    }
    tokens.push(...extra);
  }

  return tokens;
}

/**
 * Create a lightweight in-memory BM25 retriever over knowledge chunks.
 * Uses zero external dependencies and < 2MB RAM for full EN/VI policy sets.
 * @param {Array<object>} chunks
 * @param {object} [options]
 * @param {number} [options.k1]
 * @param {number} [options.b]
 * @returns {{ search: (query: string, opts?: { locale?: 'en'|'vi', topK?: number, minScore?: number, preferredDocSlug?: string }) => Array<object>, size: number }}
 */
export function createKnowledgeRetriever(chunks, { k1 = 1.2, b = 0.75 } = {}) {
  const indexedDocs = chunks.map((chunk) => {
    const weightedSource = `${chunk.title} ${chunk.heading} ${chunk.heading} ${chunk.body}`;
    const tokens = tokenizeBilingualText(weightedSource, { expandSynonyms: false });
    const termFreq = new Map();
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) ?? 0) + 1);
    }
    return {
      chunk,
      tokensLength: Math.max(1, tokens.length),
      termFreq,
    };
  });

  function buildStats(subset) {
    const docCount = subset.length;
    const avgLen =
      docCount === 0 ? 1 : subset.reduce((sum, entry) => sum + entry.tokensLength, 0) / docCount;
    const docFreq = new Map();

    for (const entry of subset) {
      for (const term of entry.termFreq.keys()) {
        docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
      }
    }

    return { docCount, avgLen, docFreq };
  }

  const byLocale = new Map();
  for (const entry of indexedDocs) {
    const loc = entry.chunk.locale || 'en';
    if (!byLocale.has(loc)) {
      byLocale.set(loc, []);
    }
    byLocale.get(loc).push(entry);
  }

  const statsByLocale = new Map();
  for (const [loc, subset] of byLocale.entries()) {
    statsByLocale.set(loc, buildStats(subset));
  }
  const allStats = buildStats(indexedDocs);

  function search(query, { locale, topK = 3, minScore = 0.1, preferredDocSlug } = {}) {
    const queryTokens = tokenizeBilingualText(query, { expandSynonyms: true });
    if (queryTokens.length === 0) {
      return [];
    }

    const uniqueQueryTerms = Array.from(new Set(queryTokens));
    const subset = locale && byLocale.has(locale) ? byLocale.get(locale) : indexedDocs;
    const stats = locale && statsByLocale.has(locale) ? statsByLocale.get(locale) : allStats;

    if (!subset || subset.length === 0) {
      return [];
    }

    const scored = [];

    for (const entry of subset) {
      let score = 0;

      for (const term of uniqueQueryTerms) {
        const tf = entry.termFreq.get(term) ?? 0;
        if (tf === 0) {
          continue;
        }
        const df = stats.docFreq.get(term) ?? 0;
        const idf = Math.log(1 + (stats.docCount - df + 0.5) / (df + 0.5));
        const numerator = tf * (k1 + 1);
        const denominator = tf + k1 * (1 - b + (b * entry.tokensLength) / stats.avgLen);
        const termWeight = term.includes('_') ? 1.35 : term.startsWith('acc:') ? 1.25 : 1.0;
        score += idf * (numerator / denominator) * termWeight;
      }

      if (preferredDocSlug && entry.chunk.docSlug === preferredDocSlug && score > 0) {
        score *= 1.15;
      }

      if (score >= minScore) {
        scored.push({
          sectionId: entry.chunk.sectionId,
          docSlug: entry.chunk.docSlug,
          locale: entry.chunk.locale,
          title: entry.chunk.title,
          heading: entry.chunk.heading,
          snippet: entry.chunk.snippet,
          body: entry.chunk.body,
          url: entry.chunk.url,
          score: Number(score.toFixed(4)),
        });
      }
    }

    scored.sort((a, bItem) => bItem.score - a.score);
    return scored.slice(0, Math.max(1, topK));
  }

  return {
    search,
    size: indexedDocs.length,
  };
}
