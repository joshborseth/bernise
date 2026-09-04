#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for the Bernise monorepo.
# Installs the pinned package manager (bun) and the Vite+ (`vp`) toolchain,
# then refreshes workspace dependencies. Safe to re-run: existing installs are
# reused and `bun install` is deterministic against the committed lockfile.
set -euo pipefail

BUN_VERSION_TAG="bun-v1.4.0"
EXPECTED_BUN_VERSION="1.4.0"
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
VP_BIN_DIR="$HOME/.local/share/vite-plus/bin"
export PATH="$BUN_INSTALL/bin:$VP_BIN_DIR:$PATH"

# 1. Pinned bun (package manager for the workspace; also runs the Effect server).
if ! command -v bun >/dev/null 2>&1 || [ "$(bun --version 2>/dev/null)" != "$EXPECTED_BUN_VERSION" ]; then
  echo "[install] Installing bun $EXPECTED_BUN_VERSION"
  curl -fsSL https://bun.sh/install | bash -s "$BUN_VERSION_TAG"
else
  echo "[install] bun $EXPECTED_BUN_VERSION already present"
fi

# 2. Vite+ CLI (`vp`) — the repo's build/lint/test/dev orchestrator.
if ! command -v vp >/dev/null 2>&1; then
  echo "[install] Installing Vite+ (vp) toolchain"
  curl -fsSL https://vite.plus | bash
else
  echo "[install] vp already present"
fi

export PATH="$BUN_INSTALL/bin:$VP_BIN_DIR:$PATH"

# 3. Workspace dependencies. `bun install` runs the `prepare` hook
#    (`effect-tsgo patch`), which is itself idempotent.
echo "[install] Installing workspace dependencies (vp i)"
vp i

echo "[install] Done."
