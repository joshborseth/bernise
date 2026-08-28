import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { probeCodex, probeCursor } from "../src/ProviderHealth.ts";

const cursorSource = fileURLToPath(new URL("./fake-acp-agent.mjs", import.meta.url));
const codexSource = fileURLToPath(new URL("./fake-codex-app-server.mjs", import.meta.url));

const makeFakeBin = (
  source: string,
  name: string,
  envName: string,
  mode?: string,
): { readonly bin: string; readonly workspace: string } => {
  const workspace = mkdtempSync(join(tmpdir(), `bernise-probe-${name}-`));
  const bin = join(workspace, name);
  const modePrefix = mode === undefined ? "" : `${envName}=${JSON.stringify(mode)} `;
  writeFileSync(
    bin,
    `#!/bin/sh
${modePrefix}exec ${JSON.stringify(process.execPath)} ${JSON.stringify(source)} "$@"
`,
    { encoding: "utf8" },
  );
  chmodSync(bin, 0o755);
  return { bin, workspace };
};

const probeLayer = NodeServices.layer;

describe("provider probes", () => {
  it.effect("reports Cursor ready when ACP initialize succeeds", () => {
    const fake = makeFakeBin(cursorSource, "fake-cursor-agent", "FAKE_ACP_MODE");
    return Effect.gen(function* () {
      const snapshot = yield* probeCursor({
        command: fake.bin,
        cwd: fake.workspace,
        enabled: true,
      });
      expect(snapshot.status).toBe("ready");
      expect(snapshot.installed).toBe(true);
      expect(snapshot.auth).toBe("authenticated");
    }).pipe(Effect.scoped, Effect.provide(probeLayer));
  });

  it.effect("reports Cursor missing when the binary is absent", () =>
    Effect.gen(function* () {
      const snapshot = yield* probeCursor({
        command: join(dirname(cursorSource), "definitely-missing-cursor-agent"),
        cwd: tmpdir(),
        enabled: true,
      });
      expect(snapshot.status).toBe("error");
      expect(snapshot.installed).toBe(false);
      expect(snapshot.message).toMatch(/cursor-agent|not found/i);
    }).pipe(Effect.scoped, Effect.provide(probeLayer)),
  );

  it.effect("reports Codex ready when account/read is authenticated", () => {
    const fake = makeFakeBin(codexSource, "fake-codex", "FAKE_CODEX_MODE");
    return Effect.gen(function* () {
      const snapshot = yield* probeCodex({
        command: fake.bin,
        cwd: fake.workspace,
        homePath: "",
        enabled: true,
      });
      expect(snapshot.status).toBe("ready");
      expect(snapshot.installed).toBe(true);
      expect(snapshot.auth).toBe("authenticated");
      expect(snapshot.version).toBe("0.0.0");
    }).pipe(Effect.scoped, Effect.provide(probeLayer));
  });

  it.effect("reports Codex unauthenticated when account/read requires login", () => {
    const fake = makeFakeBin(codexSource, "fake-codex", "FAKE_CODEX_MODE", "unauthenticated");
    return Effect.gen(function* () {
      const snapshot = yield* probeCodex({
        command: fake.bin,
        cwd: fake.workspace,
        homePath: "",
        enabled: true,
      });
      expect(snapshot.status).toBe("error");
      expect(snapshot.auth).toBe("unauthenticated");
      expect(snapshot.message).toMatch(/codex login/i);
    }).pipe(Effect.scoped, Effect.provide(probeLayer));
  });

  it.effect("reports Codex missing when the binary is absent", () =>
    Effect.gen(function* () {
      const snapshot = yield* probeCodex({
        command: join(dirname(codexSource), "definitely-missing-codex"),
        cwd: tmpdir(),
        homePath: "",
        enabled: true,
      });
      expect(snapshot.status).toBe("error");
      expect(snapshot.installed).toBe(false);
      expect(snapshot.message).toMatch(/codex|not found/i);
    }).pipe(Effect.scoped, Effect.provide(probeLayer)),
  );

  it.effect("skips probing a disabled provider", () =>
    Effect.gen(function* () {
      const snapshot = yield* probeCodex({
        command: "codex",
        cwd: tmpdir(),
        homePath: "",
        enabled: false,
      });
      expect(snapshot.enabled).toBe(false);
      expect(snapshot.status).toBe("warning");
      expect(snapshot.message).toMatch(/disabled/i);
    }).pipe(Effect.scoped, Effect.provide(probeLayer)),
  );
});
