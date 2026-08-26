# Bernise

Desktop control surface for grilling technical decisions until they are explicit. Scaffold only: Effect-native Electron shell, no agents or editor yet.

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

Bernise is a harness control surface (t3code-style). Do not call model APIs for coding work. See [docs/harness.md](docs/harness.md). First live provider later: Cursor CLI. `Provider` is a service tag only — no adapters in this scaffold.

## TypeScript 7 / effect-tsgo

This repo uses TypeScript 7 (native `tsgo`) with [`@effect/tsgo`](https://github.com/Effect-TS/tsgo) — Effect's patched TypeScript-Go binary. Do not run stock `tsgo` alongside it.

- `prepare` runs `effect-tsgo patch` (replaces `@typescript/native-preview`'s `tsgo` with `effect-tsgo`)
- Editor: install **TypeScript (Native Preview)** (`TypeScriptTeam.native-preview`) and keep `js/ts.experimental.useTsgo` enabled in `.vscode/settings.json`
- Command palette: **TypeScript Native Preview: Enable (Experimental)**

## Commands

- `bun run dev` — Vite renderer + Electron (Electron supervises the Effect server)
- `bun run test` — `@effect/vitest`
- `bun run typecheck` — `tsc --build` plus the web project
- `bun run lint` — oxlint
- `bun run fmt` — oxfmt
- `bun run fmt:check` — oxfmt `--check`
