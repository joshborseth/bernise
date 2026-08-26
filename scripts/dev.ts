import { spawn, type Subprocess } from "bun";
import * as Path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const children: Array<Subprocess> = [];

function run(cmd: Array<string>, cwd: string): Subprocess {
  const child = spawn({
    cmd,
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: {
      ...process.env,
      BERNISE_ROOT: root,
    },
  });
  children.push(child);
  return child;
}

function shutdown() {
  for (const child of children) {
    child.kill();
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

run(["bun", "run", "dev"], Path.join(root, "apps/web"));
run(["bun", "run", "dev"], Path.join(root, "apps/desktop"));

const codes = await Promise.all(children.map((child) => child.exited));
process.exit(codes.find((code) => code !== 0) ?? 0);
