# Contributing to DevRelay

## Branches

Create one focused branch per task from `main`:

```text
task/short-description
```

Do not push implementation commits directly to `main`. Open a pull request and merge only after required CI and preview checks pass.

## Commits

Use a short imperative subject that describes the coherent change:

```text
Configure monorepo validation
Add monitor policy evaluation
Fix duplicate incident creation
```

Avoid generated-by attribution, internal planning commentary, issue transcripts, local paths, and secrets in commits or pull requests.

## Validation

Start local dependencies before running the complete check:

```powershell
pnpm infra:up
pnpm check
```

Changes to testable behavior must include the most appropriate automated coverage. UI changes also require rendered browser verification of the affected flow, responsive states, keyboard behavior, and console errors.

Before committing, inspect the complete staged diff and confirm it contains only intended public project files.
