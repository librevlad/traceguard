// Gap rules: each rule looks at one item and returns zero or more gaps.
// A gap: { rule, severity: 'high'|'medium'|'low', key, title, detail, fix, ref }
import { isRequirement, asilRank, ancestors, effectiveAsil } from './model.js';
import { verificationStatus, needsDeepVerification, ROBUST_METHODS } from './verify.js';

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

function byAsil(asil, floor = 'low') {
  if (asilRank(asil) >= 3) return 'high';
  if (asilRank(asil) >= 1) return 'medium';
  return floor;
}

const gap = (rule, severity, key, title, detail, fix, ref) => ({ rule, severity, key, title, detail, fix, ref });

export const RULES = [
  {
    id: 'not-broken-down',
    applies: item => item.level === 'SG' || (item.level === 'SYS' && (!item.allocation || item.allocation === 'sw')),
    check(item, index) {
      if ((index.children.get(item.key) || []).length) return [];
      const asil = effectiveAsil(index, item.key);
      const lower = item.level === 'SG' ? 'system requirement' : 'software requirement';
      return [gap(this.id, byAsil(asil, 'medium'), item.key, 'Not broken down',
        `${item.key} has no derived ${lower}.`,
        `Derive at least one ${lower} from ${item.key}, or set its allocation to hardware.`,
        'ASPICE SYS.2 BP6 / SWE.1 BP6')];
    },
  },
  {
    id: 'orphan-requirement',
    applies: item => item.level === 'SWR',
    check(item, index) {
      if ((index.parents.get(item.key) || []).length) return [];
      return [gap(this.id, 'medium', item.key, 'Orphan requirement',
        `${item.key} does not derive from any system requirement.`,
        'Link it to the system requirement it implements, or remove it if it is not needed.',
        'ASPICE SWE.1 BP6')];
    },
  },
  {
    id: 'not-verified',
    applies: item => item.level === 'SWR' || (item.level === 'SYS' && (!item.allocation || item.allocation === 'sw')),
    check(item, index) {
      const s = verificationStatus(index, item);
      if (s.tests.length) return [];
      return [gap(this.id, byAsil(s.asil, item.level === 'SWR' ? 'medium' : 'low'), item.key, 'No verification',
        `${item.key}${s.asil ? ` (ASIL ${s.asil})` : ''} has no test case.`,
        `Add a test case that verifies ${item.key}.`,
        item.level === 'SWR' ? 'ASPICE SWE.6 BP5' : 'ASPICE SYS.5 BP5')];
    },
  },
  {
    id: 'insufficient-verification',
    applies: item => item.level === 'SWR' || item.level === 'SYS',
    // Structural check on the linked tests; their results are judged by failing-verification.
    check(item, index) {
      const s = verificationStatus(index, item);
      if (!s.tests.length || !needsDeepVerification(s.asil)) return [];
      const out = [];
      if (s.tests.length < 2) {
        out.push(gap(this.id, 'high', item.key, 'Too few tests for its ASIL',
          `${item.key} is ASIL ${s.asil} but has ${s.tests.length} test case; expected at least 2.`,
          'Add an independent test case for this requirement.', 'ISO 26262-6 §9.4'));
      }
      if (!s.tests.some(t => ROBUST_METHODS.includes(t.method))) {
        out.push(gap(this.id, 'high', item.key, 'No fault-injection or back-to-back test',
          `${item.key} is ASIL ${s.asil}; none of its tests use fault injection or back-to-back testing.`,
          'Add a fault-injection or back-to-back test.', 'ISO 26262-6 Table 7'));
      }
      return out;
    },
  },
  {
    id: 'failing-verification',
    applies: item => isRequirement(item),
    check(item, index) {
      const s = verificationStatus(index, item);
      const out = s.failing.map(t => gap(this.id, byAsil(s.asil, 'medium'), item.key, 'Failing test',
        `${t.key} verifying ${item.key} failed in its last run.`,
        `Fix the defect or the test, then re-run ${t.key}.`, 'ASPICE SWE.6 BP3'));
      for (const t of s.notRun) {
        out.push(gap(this.id, byAsil(s.asil, 'low'), item.key, 'Test never executed',
          `${t.key} verifying ${item.key} has no result yet.`,
          `Run ${t.key} and record the result.`, 'ASPICE SWE.6 BP3'));
      }
      return out;
    },
  },
  {
    id: 'suspect-link',
    applies: item => isRequirement(item),
    check(item, index) {
      const s = verificationStatus(index, item);
      if (!s.suspect.length) return [];
      const keys = s.suspect.map(t => t.key).join(', ');
      return [gap(this.id, byAsil(s.asil, 'medium'), item.key, 'Changed after verification',
        `${item.key} was edited on ${item.updated?.slice(0, 10)}, after ${keys} last ran.`,
        `Review ${keys} against the new text of ${item.key} and re-run.`, 'ISO 26262-8 §8 change management')];
    },
  },
  {
    id: 'asil-downgrade',
    applies: item => isRequirement(item) && item.level !== 'SG',
    check(item, index) {
      if (item.decomposition) return [];
      const out = [];
      for (const p of index.parents.get(item.key) || []) {
        const parent = index.byKey.get(p);
        if (parent?.asil && item.asil && asilRank(item.asil) < asilRank(parent.asil)) {
          out.push(gap(this.id, 'high', item.key, 'ASIL lower than its parent',
            `${item.key} is ASIL ${item.asil} but derives from ${p} (ASIL ${parent.asil}) without an ASIL decomposition.`,
            `Raise ${item.key} to ASIL ${parent.asil}, or document an ASIL decomposition.`, 'ISO 26262-9 §5'));
        }
      }
      return out;
    },
  },
  {
    id: 'missing-asil',
    applies: item => (item.level === 'SYS' || item.level === 'SWR'),
    check(item, index) {
      if (item.asil) return [];
      const safety = ancestors(index, item.key).some(k => index.byKey.get(k)?.level === 'SG');
      if (!safety) return [];
      return [gap(this.id, 'medium', item.key, 'Safety requirement without ASIL',
        `${item.key} traces to a safety goal but has no ASIL.`,
        `Set the ASIL of ${item.key}.`, 'ISO 26262-3 §7')];
    },
  },
  {
    id: 'orphan-test',
    applies: item => item.level === 'TEST',
    check(item, index) {
      // A test whose only link points nowhere is reported once, as a broken link.
      if ((item.links || []).some(l => l.type === 'verifies')) return [];
      return [gap(this.id, 'medium', item.key, 'Test without requirement',
        `${item.key} does not verify any requirement.`,
        'Link it to the requirement it checks, or retire it.', 'ASPICE SWE.6 BP5')];
    },
  },
];

export function findGaps(items, index) {
  const gaps = [];
  for (const item of items) {
    for (const rule of RULES) {
      if (rule.applies(item)) gaps.push(...rule.check(item, index));
    }
  }
  for (const b of index.broken) {
    gaps.push(gap('broken-link', 'medium', b.from, 'Broken link',
      `${b.from} ${b.type} ${b.target}, but ${b.target} does not exist.`,
      `Fix or remove the link to ${b.target}.`, 'ASPICE SUP.10'));
  }
  return gaps.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    || a.key.localeCompare(b.key, 'en', { numeric: true }) || a.rule.localeCompare(b.rule));
}
