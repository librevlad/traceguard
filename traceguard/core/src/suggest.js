// Link suggestions without an LLM: TF-IDF cosine similarity between summaries and descriptions.
// The Rovo agent shows these as proposals; a human confirms every link.

const STOP = new Set(('the a an and or of to in on for with by is be shall must when if then than from at as it its ' +
  'this that within into per not no are was were has have will can should may each every any all one two only ' +
  'test tests check verify verifies verified requirement ecu').split(' '));

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[_/]/g, ' ')
    .split(/[^a-z0-9а-яіїєґ]+/i)
    .filter(w => w.length >= 3 && !STOP.has(w));
}

function vectorize(docs) {
  const df = new Map();
  const tfs = docs.map(d => {
    const tf = new Map();
    for (const w of tokenize(d.text)) tf.set(w, (tf.get(w) || 0) + 1);
    for (const w of tf.keys()) df.set(w, (df.get(w) || 0) + 1);
    return tf;
  });
  const n = docs.length;
  return tfs.map(tf => {
    const v = new Map();
    let norm = 0;
    for (const [w, c] of tf) {
      const x = (1 + Math.log(c)) * Math.log(1 + n / df.get(w));
      v.set(w, x);
      norm += x * x;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [w, x] of v) v.set(w, x / norm);
    return v;
  });
}

function cosine(a, b) {
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  let s = 0;
  for (const [w, x] of small) {
    const y = big.get(w);
    if (y) s += x * y;
  }
  return s;
}

export function suggestLinks(items, index, { limit = 3, minScore = 0.12 } = {}) {
  const reqs = items.filter(i => i.level === 'SYS' || i.level === 'SWR');
  const tests = items.filter(i => i.level === 'TEST');
  const docs = [...reqs, ...tests].map(i => ({ key: i.key, text: `${i.summary || ''} ${i.description || ''}` }));
  const vecs = vectorize(docs);
  const vec = new Map(docs.map((d, n) => [d.key, vecs[n]]));

  const rank = (from, pool) => pool
    .map(c => ({ key: c.key, score: Number(cosine(vec.get(from.key), vec.get(c.key)).toFixed(2)) }))
    .filter(c => c.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const out = [];
  for (const t of tests) {
    if ((index.verifiedBy.get(t.key) || []).length) continue;
    const candidates = rank(t, reqs);
    if (candidates.length) out.push({ from: t.key, link: 'verifies', candidates });
  }
  for (const r of reqs.filter(i => i.level === 'SWR')) {
    if (!(index.testsOf.get(r.key) || []).length) {
      const candidates = rank(r, tests.filter(t => !(index.verifiedBy.get(t.key) || []).length));
      if (candidates.length) out.push({ from: r.key, link: 'verified-by', candidates });
    }
    if (!(index.parents.get(r.key) || []).length) {
      const candidates = rank(r, reqs.filter(i => i.level === 'SYS'));
      if (candidates.length) out.push({ from: r.key, link: 'derives', candidates });
    }
  }
  return out;
}
