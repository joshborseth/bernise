import {
  defaultHarnessSettings,
  HarnessSettings,
  HarnessSettingsPatch,
  mergeHarnessSettings,
  ProviderTurnDelta,
  TurnResult,
} from "@bernise/contracts";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Stream } from "effect";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Provider } from "../src/Provider.ts";
import { ServerSettings } from "../src/ServerSettings.ts";
import { harnessMemoryLayer } from "./testLayers.ts";

const cursorSource = fileURLToPath(new URL("./fake-acp-agent.mjs", import.meta.url));
const codexSource = fileURLToPath(new URL("./fake-codex-app-server.mjs", import.meta.url));

const makeFakeBin = (
  source: string,
  name: string,
): { readonly bin: string; readonly workspace: string } => {
  const workspace = mkdtempSync(join(tmpdir(), `bernise-router-${name}-`));
  const bin = join(workspace, name);
  writeFileSync(
    bin,
    `#!/bin/sh
exec ${JSON.stringify(process.execPath)} ${JSON.stringify(source)} "$@"
`,
    { encoding: "utf8" },
  );
  chmodSync(bin, 0o755);
  return { bin, workspace };
};

describe("mergeHarnessSettings", () => {
  it("trims provider paths", () => {
    const next = mergeHarnessSettings(
      defaultHarnessSettings,
      new HarnessSettingsPatch({
        cursor: { binaryPath: " /opt/bin/cursor-agent " },
        codex: { binaryPath: " /opt/bin/codex ", homePath: " ~/.codex " },
      }),
    );
    expect(next.cursor.binaryPath).toBe("/opt/bin/cursor-agent");
    expect(next.codex.binaryPath).toBe("/opt/bin/codex");
    expect(next.codex.homePath).toBe("~/.codex");
  });
});

describe("ProviderRouterLive", () => {
  it.effect("keeps SendTurn on the session driver after switching activeProvider", () => {
    const cursor = makeFakeBin(cursorSource, "fake-cursor-agent");
    const codex = makeFakeBin(codexSource, "fake-codex");
    const settings = new HarnessSettings({
      ...defaultHarnessSettings,
      activeProvider: "cursor",
    });
    return Effect.gen(function* () {
      const provider = yield* Provider;
      const serverSettings = yield* ServerSettings;
      const sessionId = yield* provider.startSession(cursor.workspace);
      yield* serverSettings.update(new HarnessSettingsPatch({ activeProvider: "codex" }));
      const fiber = yield* Stream.runCollect(
        Stream.take(provider.subscribeEvents(sessionId), 2),
      ).pipe(Effect.forkDetach);
      const turn = yield* provider.sendTurn(sessionId, "hello");
      expect(turn).toEqual(new TurnResult({ stopReason: "end_turn" }));
      const events = yield* Fiber.join(fiber);
      expect(events).toEqual([
        new ProviderTurnDelta({ text: "Hello" }),
        new ProviderTurnDelta({ text: " from ACP" }),
      ]);
    }).pipe(
      Effect.provide(
        harnessMemoryLayer({
          cursorBin: cursor.bin,
          codexBin: codex.bin,
          workspace: cursor.workspace,
          settings,
          stateDir: cursor.workspace,
        }),
      ),
    );
  });
});
