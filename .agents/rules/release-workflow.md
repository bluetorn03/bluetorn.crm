---
trigger: always_on
description: "Feature development lifecycle, local verification gates, and release approval workflow"
---

# Development & Release Workflow Rules

## 1. Branch Strategy
- Never develop directly on `main`.
- All development, fixes, and chores must be done on dedicated branches:
  - `feature/<short-name>`
  - `fix/<short-name>`
  - `chore/<short-name>`

## 2. Required 14-Step Feature Cycle
1. Inspect current implementation.
2. Plan changes.
3. Implement locally.
4. If DB changes needed: create new sequential migration; never edit applied migrations.
5. Apply migration to LOCAL DB only.
6. Test feature locally.
7. Test affected existing features.
8. Run typecheck: `npm run typecheck` (`tsc --noEmit`).
9. Run production build: `npm run build` (`vite build`).
10. Run verification suite: `npm run verify`.
11. Inspect `git diff`.
12. Inspect `git status`.
13. Produce structured QA Report (`READY FOR USER APPROVAL`).
14. **STOP and wait for user approval**.

## 3. Release Gate Template
When work is complete and verified locally, present the following summary and pause:

```markdown
=============================
READY FOR USER APPROVAL
=============================
1. What changed: <summary>
2. Why it changed: <business/technical context>
3. Files changed: <list of files>
4. Database migration created?: <Yes/No - filename>
5. Local migration result: <Success/Skipped>
6. Tests result: <Success/Skipped>
7. Typecheck result: <Success: tsc --noEmit passed>
8. Build result: <Success: vite build passed>
9. Regression result: <Passed/None detected>
10. Production environment changes required?: <No / List variable names>
11. Production database changes required?: <No / Yes with details>
12. Hostinger manual actions required?: <None / Description>
13. Deployment trigger: <PR merge to main / app.zip upload>
14. Exact release commands: <git commands to be executed upon approval>
15. Rollback/recovery considerations: <steps to revert>
16. Remaining risks: <residual risks>
```
Do NOT commit, push, or deploy without explicit user approval.
