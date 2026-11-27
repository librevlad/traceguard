// TraceGuard core: normalized traceability model.
//
// An item is one artifact pulled from Jira/Confluence:
//   { key, level, summary, description?, asil?, status?, updated?, allocation?,
//     decomposition?, method?, result?, lastRunAt?, links: [{ type, target }] }
//
// level:  'SG' safety goal, 'SYS' system requirement, 'SWR' software requirement, 'TEST' test case
// asil:   'QM' | 'A' | 'B' | 'C' | 'D' (ISO 26262)
// links (always stored on the lower-level item):
//   { type: 'derives',  target: <parent requirement key> }   SYS->SG, SWR->SYS
//   { type: 'verifies', target: <requirement key> }          TEST->SWR|SYS
// TEST items carry method ('requirements' | 'fault-injection' | 'back-to-back' | 'review'),
// result ('pass' | 'fail' | 'none') and lastRunAt (ISO date).

export const REQUIREMENT_LEVELS = ['SG', 'SYS', 'SWR'];
export const ASIL_RANK = { QM: 0, A: 1, B: 2, C: 3, D: 4 };

export function isRequirement(item) {
  return REQUIREMENT_LEVELS.includes(item.level);
}

export function asilRank(asil) {
  return asil in ASIL_RANK ? ASIL_RANK[asil] : -1;
}

function push(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

// Builds lookup tables once so every rule works in O(links).
export function buildIndex(items) {
  const byKey = new Map();
  for (const item of items) byKey.set(item.key, item);

  const parents = new Map();     // child requirement -> parent keys
  const children = new Map();    // parent requirement -> child keys
  const testsOf = new Map();     // requirement -> test keys
  const verifiedBy = new Map();  // test -> requirement keys
  const broken = [];             // { from, type, target }

  for (const item of items) {
    for (const link of item.links || []) {
      if (!byKey.has(link.target)) {
        broken.push({ from: item.key, type: link.type, target: link.target });
        continue;
      }
      if (link.type === 'derives') {
        push(parents, item.key, link.target);
        push(children, link.target, item.key);
      } else if (link.type === 'verifies') {
        push(verifiedBy, item.key, link.target);
        push(testsOf, link.target, item.key);
      }
    }
  }
  return { byKey, parents, children, testsOf, verifiedBy, broken };
}

// All ancestors of a requirement (parents of parents), nearest first.
export function ancestors(index, key) {
  const seen = new Set();
  const order = [];
  let frontier = [...(index.parents.get(key) || [])];
  while (frontier.length) {
    const next = [];
    for (const k of frontier) {
      if (seen.has(k)) continue;
      seen.add(k);
      order.push(k);
      next.push(...(index.parents.get(k) || []));
    }
    frontier = next;
  }
  return order;
}

// The ASIL a requirement is verified against: its own when set (a downgrade is reported
// by its own rule), otherwise the strictest ASIL inherited from its ancestors.
export function effectiveAsil(index, key) {
  const own = index.byKey.get(key)?.asil;
  if (own) return own;
  let best = null;
  for (const k of ancestors(index, key)) {
    const a = index.byKey.get(k)?.asil;
    if (a && asilRank(a) > asilRank(best)) best = a;
  }
  return best;
}
