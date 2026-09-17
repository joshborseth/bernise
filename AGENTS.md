# Bernise

macOS overlay pet that watches a local t3code environment. It summarizes threads and speaks when they need you or settle. It is not a code-building harness.

Coding work must not call model APIs. Intelligence lives in t3code. Bernise is listen-only in v1: no `dispatchCommand`. See [docs/companion.md](docs/companion.md).

## Layout

- `apps/pet` — Three.js cat, listen/VAD, host bridge (Vite, port 5733)
- `apps/macos` — AppKit overlay, t3code HTTP, Chatterbox TTS (build on a Mac)
- `packages/attention` — shell snapshot → `needsYou` / `settled` events
- `packages/summary` — extractive spoken brief
- `packages/speakable` — markdown strip for TTS

## TypeScript 7 / effect-tsgo

This repo uses TypeScript 7 (native `tsgo`) with [`@effect/tsgo`](https://github.com/Effect-TS/tsgo) — Effect's patched TypeScript-Go binary. Do not run stock `tsgo` alongside it.

- `prepare` runs `effect-tsgo patch` (replaces `@typescript/native-preview`'s `tsgo` with `effect-tsgo`)
- Editor: install **TypeScript (Native Preview)** (`TypeScriptTeam.native-preview`) and keep `js/ts.experimental.useTsgo` enabled in `.vscode/settings.json`
- Command palette: **TypeScript Native Preview: Enable (Experimental)**

## Commands

Install the global `vp` CLI first (`curl -fsSL https://vite.plus | bash`).

- `vp i` — install workspace dependencies
- `vp run dev` / `vp run dev:pet` — Vite pet in a browser (port 5733)
- `vp test run` — vitest for attention, summary, listen gate, speakable
- `vp run typecheck` — package builds plus the pet project
- `vp lint` — oxlint via Vite+
- `vp fmt` — oxfmt via Vite+
- `vp fmt --check` — oxfmt `--check`
- macOS overlay: `swift run` in `apps/macos` (not available in this Linux environment)

## Agent skills

### Issue tracker

Issues live in Linear workspace SLAMMER, team Bernise. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical roles map 1:1 to Linear labels `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.
