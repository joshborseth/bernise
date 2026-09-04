# Bernise

Desktop control surface for grilling technical decisions until they are explicit. Effect-native Electron shell with a Codex App Server harness.

## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show...` for relevant patterns (supports multiple topics)
3. Search `~/.local/share/effect-solutions/effect` for real implementations

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Never guess at Effect patterns - check the guide first.

## Local Effect Source

The Effect v4 repository is cloned to `~/.local/share/effect-solutions/effect` for reference.
Use this to explore APIs, find usage examples, and understand implementation
details when the documentation isn't enough.

## Agent harness

Bernise is a harness control surface (t3code-style). Coding work must not call model APIs; Codex CLI (`codex app-server`) is the live provider. See [docs/harness.md](docs/harness.md). `Provider` is implemented by `CodexProviderLive`.

## TypeScript 7 / effect-tsgo

This repo uses TypeScript 7 (native `tsgo`) with [`@effect/tsgo`](https://github.com/Effect-TS/tsgo) — Effect's patched TypeScript-Go binary. Do not run stock `tsgo` alongside it.

- `prepare` runs `effect-tsgo patch` (replaces `@typescript/native-preview`'s `tsgo` with `effect-tsgo`)
- Editor: install **TypeScript (Native Preview)** (`TypeScriptTeam.native-preview`) and keep `js/ts.experimental.useTsgo` enabled in `.vscode/settings.json`
- Command palette: **TypeScript Native Preview: Enable (Experimental)**

## Commands

Install the global `vp` CLI first (`curl -fsSL https://vite.plus | bash`).

- `vp i` — install workspace dependencies
- `vp run dev` — Electron + Vite renderer; Electron supervises the Effect server (ports 13773 / 5733)
- `vp run dev:desktop` — same as `dev`
- `vp run dev:web` — Vite + Effect server in a browser (ports 13773 / 5733)
- `vp test run` — `@effect/vitest`
- `vp run typecheck` — `tsc --build` plus the web and scripts projects
- `vp lint` — oxlint via Vite+
- `vp fmt` — oxfmt via Vite+
- `vp fmt --check` — oxfmt `--check`

## Agent skills

### Issue tracker

Issues live in Linear workspace SLAMMER, team Bernise. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical roles map 1:1 to Linear labels `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.
