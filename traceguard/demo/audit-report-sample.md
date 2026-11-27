# Traceability audit — Electronic brake control unit (BRK)

Generated 2026-11-27 by TraceGuard. Scope: 28 requirements, 34 test cases.

## Verification coverage

Overall: **56%** (14 of 25 software-allocated requirements verified).

| ASIL | Requirements | Verified | Coverage |
|---|---|---|---|
| D | 9 | 6 | 67% |
| C | 7 | 3 | 43% |
| B | 1 | 1 | 100% |
| QM | 8 | 4 | 50% |

## Gaps

High: **11**, medium: **7**, low: **2**.

| Severity | Item | Gap | Detail | Fix | Reference |
|---|---|---|---|---|---|
| High | SWR-3 | Too few tests for its ASIL | SWR-3 is ASIL D but has 1 test case; expected at least 2. | Add an independent test case for this requirement. | ISO 26262-6 §9.4 |
| High | SWR-3 | No fault-injection or back-to-back test | SWR-3 is ASIL D; none of its tests use fault injection or back-to-back testing. | Add a fault-injection or back-to-back test. | ISO 26262-6 Table 7 |
| High | SWR-4 | ASIL lower than its parent | SWR-4 is ASIL B but derives from SYS-2 (ASIL D) without an ASIL decomposition. | Raise SWR-4 to ASIL D, or document an ASIL decomposition. | ISO 26262-9 §5 |
| High | SWR-6 | Failing test | TC-9 verifying SWR-6 failed in its last run. | Fix the defect or the test, then re-run TC-9. | ASPICE SWE.6 BP3 |
| High | SWR-8 | Test never executed | TC-14 verifying SWR-8 has no result yet. | Run TC-14 and record the result. | ASPICE SWE.6 BP3 |
| High | SWR-9 | No verification | SWR-9 (ASIL C) has no test case. | Add a test case that verifies SWR-9. | ASPICE SWE.6 BP5 |
| High | SWR-15 | Too few tests for its ASIL | SWR-15 is ASIL D but has 1 test case; expected at least 2. | Add an independent test case for this requirement. | ISO 26262-6 §9.4 |
| High | SWR-15 | No fault-injection or back-to-back test | SWR-15 is ASIL D; none of its tests use fault injection or back-to-back testing. | Add a fault-injection or back-to-back test. | ISO 26262-6 Table 7 |
| High | SWR-16 | Changed after verification | SWR-16 was edited on 2026-11-20, after TC-18, TC-19 last ran. | Review TC-18, TC-19 against the new text of SWR-16 and re-run. | ISO 26262-8 §8 change management |
| High | SYS-9 | Not broken down | SYS-9 has no derived software requirement. | Derive at least one software requirement from SYS-9, or set its allocation to hardware. | ASPICE SYS.2 BP6 / SWE.1 BP6 |
| High | SYS-9 | No verification | SYS-9 (ASIL C) has no test case. | Add a test case that verifies SYS-9. | ASPICE SYS.5 BP5 |
| Medium | SWR-12 | No verification | SWR-12 (ASIL QM) has no test case. | Add a test case that verifies SWR-12. | ASPICE SWE.6 BP5 |
| Medium | SWR-14 | No verification | SWR-14 (ASIL QM) has no test case. | Add a test case that verifies SWR-14. | ASPICE SWE.6 BP5 |
| Medium | SWR-14 | Orphan requirement | SWR-14 does not derive from any system requirement. | Link it to the system requirement it implements, or remove it if it is not needed. | ASPICE SWE.1 BP6 |
| Medium | SWR-15 | Safety requirement without ASIL | SWR-15 traces to a safety goal but has no ASIL. | Set the ASIL of SWR-15. | ISO 26262-3 §7 |
| Medium | TC-21 | Test without requirement | TC-21 does not verify any requirement. | Link it to the requirement it checks, or retire it. | ASPICE SWE.6 BP5 |
| Medium | TC-22 | Test without requirement | TC-22 does not verify any requirement. | Link it to the requirement it checks, or retire it. | ASPICE SWE.6 BP5 |
| Medium | TC-23 | Broken link | TC-23 verifies SWR-99, but SWR-99 does not exist. | Fix or remove the link to SWR-99. | ASPICE SUP.10 |
| Low | SYS-6 | No verification | SYS-6 (ASIL QM) has no test case. | Add a test case that verifies SYS-6. | ASPICE SYS.5 BP5 |
| Low | SYS-7 | No verification | SYS-7 (ASIL QM) has no test case. | Add a test case that verifies SYS-7. | ASPICE SYS.5 BP5 |

## Suggested links (to confirm)

- TC-21 — verifies: SWR-9 (0.61), SYS-5 (0.28)
- TC-22 — verifies: SWR-12 (0.38), SWR-11 (0.13)
- TC-23 — verifies: SWR-3 (0.18), SWR-2 (0.17)
- SWR-9 — verified-by: TC-21 (0.61)
- SWR-12 — verified-by: TC-22 (0.38)

