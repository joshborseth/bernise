/**
 * Worktree setup, run by the t3.json "Setup Worktree" action as
 * `node scripts/setup-worktree.ts`. Plain Node keeps one command working in
 * every shell T3 Code spawns (zsh, bash, fish, PowerShell).
 *
 * Installs workspace dependencies with `vp i`. Bun and Vite+ are resolved
 * from the locations `.cursor/install.sh` uses, then from PATH.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

const projectRoot = process.env.T3CODE_PROJECT_ROOT;
if (!projectRoot) {
  throw new Error("T3CODE_PROJECT_ROOT is not set. Run this through the t3.json setup action.");
}

const worktree = NodePath.dirname(import.meta.dirname);
const home = NodeOS.homedir();
const bunBin = NodePath.join(process.env.BUN_INSTALL ?? NodePath.join(home, ".bun"), "bin");
const vpBin = NodePath.join(home, ".local", "share", "vite-plus", "bin");
const pathValue = [bunBin, vpBin, process.env.PATH ?? ""]
  .filter((entry) => entry.length > 0)
  .join(NodePath.delimiter);

const install = NodeChildProcess.spawnSync("vp i", {
  cwd: worktree,
  shell: true,
  stdio: "inherit",
  env: { ...process.env, PATH: pathValue },
});

process.exit(install.status ?? 1);
