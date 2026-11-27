// Verification status of one requirement, shared by the gap rules, the matrix and coverage.
import { effectiveAsil, asilRank } from './model.js';

export const ROBUST_METHODS = ['fault-injection', 'back-to-back'];

// ASIL C/D: ISO 26262-6 highly recommends fault injection or back-to-back testing,
// so we require two passing tests and at least one robust method.
export function needsDeepVerification(asil) {
  return asilRank(asil) >= 3;
}

export function verificationStatus(index, req) {
  const asil = effectiveAsil(index, req.key);
  const tests = (index.testsOf.get(req.key) || []).map(k => index.byKey.get(k));
  const passing = tests.filter(t => t.result === 'pass');
  const failing = tests.filter(t => t.result === 'fail');
  const notRun = tests.filter(t => !t.result || t.result === 'none');
  const reqUpdated = req.updated ? Date.parse(req.updated) : null;
  const suspect = tests.filter(t => reqUpdated && t.lastRunAt && Date.parse(t.lastRunAt) < reqUpdated);

  const problems = [];
  if (!tests.length) problems.push('no-tests');
  if (failing.length) problems.push('failing');
  if (suspect.length) problems.push('suspect');
  if (needsDeepVerification(asil)) {
    if (passing.length < 2) problems.push('too-few-tests');
    if (!passing.some(t => ROBUST_METHODS.includes(t.method))) problems.push('no-robust-method');
  }
  const verified = passing.length > 0 && !failing.length && !suspect.length && !problems.includes('too-few-tests')
    && !problems.includes('no-robust-method');

  return { asil, tests, passing, failing, notRun, suspect, problems, verified };
}
