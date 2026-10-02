<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# BLUETORN CRM — MASTER DEVELOPMENT & PRODUCTION SAFETY RULES

> [!CAUTION]
> **DEFAULT MODE: LOCAL DEVELOPMENT ONLY**
> Antigravity MUST NEVER automatically perform any release or production action without explicit, unambiguous user approval in the chat.

## 1. Absolute Production Safety Restrictions
Antigravity is strictly forbidden from automatically executing:
- `git push` or pushing to `main`
- Merging pull requests
- Deploying to production
- Modifying Hostinger production configuration or web server settings
- Modifying Hostinger production environment variables
- Connecting to or modifying the production database (`u168098130_bluetorn_crm` / `srv2218.hstgr.io`)
- Running destructive SQL (`DROP`, `TRUNCATE`, `ALTER`, `DELETE`, `UPDATE`) in production
- Running production migrations or baselining without explicit authorization
- Deleting or overwriting the production database with local data

**Explicit User Approval Requirement**: Any action touching remote git branches, pull requests, production databases, or Hostinger production environments requires explicit user approval (e.g., *"Approved, release it"* or *"Approved, commit and push"*).

## 2. Core Development Workflow
Every feature, bug fix, or refactor must strictly follow:
1. **Inspect**: Audit current implementation and schema.
2. **Plan**: Formulate changes and review risks.
3. **Branch**: Work on a dedicated feature/fix branch (`feature/<name>`, `fix/<name>`, `chore/<name>`). Never work directly on `main`.
4. **Implement Locally**: Apply code changes.
5. **Database Changes**:
   - If schema changes are required, create a NEW sequential migration file (e.g., `005_*.sql`).
   - **NEVER** edit, rename, delete, or re-run historical migrations (`001`, `002`, `003`, `004`).
   - Run migrations against **LOCAL MySQL ONLY**.
   - **NEVER** export local DB dumps as a production deployment mechanism.
6. **Local Testing**: Test the feature and run regression checks on affected modules.
7. **Quality Gates**:
   - Run `npm run typecheck` (`tsc --noEmit`).
   - Run `npm run build` (`vite build`).
   - Run `npm run verify`.
8. **Git Inspection**: Check `git status`, `git diff`, and ensure no secrets or unintended files are present.
9. **QA Report & Release Gate**: Output the structured `READY FOR USER APPROVAL` report and **STOP**. Wait for explicit approval before commit, push, or release.

## 3. Database Safety Rules
- **Local DB ≠ Production DB**: Local development connects exclusively to local MySQL (`localhost:3306/bluetorn_crm`). Production connects to Hostinger Cloud MariaDB (`srv2218.hstgr.io/u168098130_bluetorn_crm`).
- **Zero Synchronization by Overwrite**: Never overwrite, import, or drop production tables from local database exports.
- **Migration Immutability**: Applied migrations are immutable. Future schema updates must always be additive and forward-only.

## 4. Secret & Environment Variable Discipline
- **Zero Secret Commits**: Never commit `.env`, `.env.local`, production passwords, API tokens, session secrets, or client credentials.
- **Local `.env`**: Local development only.
- **Hostinger Environment Variables**: Production only.
- **Production Env Changes**: If a feature requires a new environment variable in production, STOP and report the `PRODUCTION ENVIRONMENT CHANGE REQUIRED` template. Never print secret values in chat.

## 5. Branch & Release Policy
- **Protected Main**: Direct pushes to `main` are prohibited.
- **Release Sequence**: Feature Branch → Local Verify → QA Report → User Approval → Push Branch → Pull Request → CI Quality Gate → User Review & Merge → Hostinger Deployment.

