# CLAUDE.md

Guidance for Claude Code and other AI assistants working in this repository.

> **Status: Empty scaffold.** As of this writing the repository contains only a
> `.gitkeep` placeholder and a single `Initialize repository` commit — there is
> no application code, build tooling, or dependency manifest yet. Sections below
> marked _(to be filled in)_ are placeholders. **When you add real code, update
> this file in the same change** so it always reflects the actual state of the
> codebase.

## Repository

- **Name:** Sacred-Texts-Sacred-Truth
- **Remote:** `mytwc2024-sudo/sacred-texts-sacred-truth`
- **Default branch:** `main`
- **Current contents:** `.gitkeep` only (no source, no config, no manifests)

## Working conventions

These apply now, before any code exists, and should continue to hold as the
project grows.

### Branching & commits

- **`main` is the default/integration branch.** Do not commit directly to it for
  feature work — use a dedicated branch and open a pull request.
- Use short, descriptive branch names (e.g. `feature/…`, `fix/…`, `docs/…`).
- Write clear, imperative commit messages ("Add X", "Fix Y") describing *why*,
  not just *what*.
- Keep the working tree clean before switching context; commit or stash first.

### Pushing

```bash
git push -u origin <branch-name>
```

Retry transient network failures with exponential backoff (2s, 4s, 8s, 16s).
Do **not** open a pull request unless it is explicitly requested.

## First-time setup (for the initial codebase)

When the project's technology is chosen, replace this section with concrete
instructions. Until then, whoever bootstraps the codebase should, in the same
commit that adds the first real code:

1. Add the project manifest / build config (e.g. `package.json`, `pyproject.toml`,
   `go.mod`, `Cargo.toml`, …).
2. Add a `.gitignore` appropriate to the stack.
3. Add a top-level `README.md` describing what the project is and how to run it.
4. Fill in the placeholder sections below.

## Project structure _(to be filled in)_

There is currently no directory structure to document. Once code is added,
describe the top-level layout and where the important pieces live.

## Build, run & test _(to be filled in)_

No build system, entry point, or test suite exists yet. When they do, document
the exact commands here, for example:

```
# install dependencies
# run the app / dev server
# run the test suite
# lint / format
```

Always prefer the project's own scripts over ad-hoc commands, and keep the
commands in this file in sync with the tooling.

## Conventions & style _(to be filled in)_

Record language/framework conventions, formatting and lint rules, naming
patterns, and any architectural decisions here as they are established, so
assistants can match the surrounding code.

## Notes for AI assistants

- This repository is essentially blank. **Do not fabricate** a tech stack,
  commands, or file paths that do not exist — verify against the actual tree
  first (`git ls-files`).
- When you introduce the first real code, treat updating this CLAUDE.md as part
  of the task, not an afterthought.
- Follow the branching and push conventions above; never push to `main` for
  feature work, and don't create pull requests unless asked.
