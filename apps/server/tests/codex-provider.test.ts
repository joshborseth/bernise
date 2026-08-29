import { ProviderTurnDelta, TurnResult } from "@bernise/contracts";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Stream } from "effect";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clientRequestResult } from "../src/CodexProviderLive.ts";
import { Provider } from "../src/Provider.ts";
import { codexDriverLayer } from "./testLayers.ts";

const fakeAgentSource = fileURLToPath(new URL("./fake-codex-app-server.mjs", import.meta.url));

const makeFakeBin = (mode?: string): { readonly bin: string; readonly workspace: string } => {
  const workspace = mkdtempSync(join(tmpdir(), "bernise-codex-"));
  const bin = join(workspace, "fake-codex");
  const modePrefix = mode === undefined ? "" : `FAKE_CODEX_MODE=${JSON.stringify(mode)} `;
  writeFileSync(
    bin,
    `#!/bin/sh
${modePrefix}exec ${JSON.stringify(process.execPath)} ${JSON.stringify(fakeAgentSource)} "$@"
`,
    { encoding: "utf8" },
  );
  chmodSync(bin, 0o755);
  return { bin, workspace };
};

describe("Codex clientRequestResult", () => {
  it("auto-accepts approval requests", () => {
    expect(clientRequestResult("item/commandExecution/requestApproval")).toEqual({
      decision: "accept",
    });
    expect(clientRequestResult("thread/start")).toEqual({});
  });
});

describe("CodexProviderLive", () => {
  it.effect("starts a session, auto-approves, and streams text deltas", () => {
    const fake = makeFakeBin();
    return Effect.gen(function* () {
      const provider = yield* Provider;
      const sessionId = yield* provider.startSession("");
      const fiber = yield* Stream.runCollect(
        Stream.take(provider.subscribeEvents(sessionId), 2),
      ).pipe(Effect.forkDetach);
      const turn = yield* provider.sendTurn(sessionId, "hello");
      expect(turn).toEqual(new TurnResult({ stopReason: "completed" }));
      const events = yield* Fiber.join(fiber);
      expect(events).toEqual([
        new ProviderTurnDelta({ text: "Hello" }),
        new ProviderTurnDelta({ text: " from Codex" }),
      ]);
    }).pipe(Effect.provide(codexDriverLayer(fake.bin, fake.workspace)));
  });

  it.effect("returns stopReason when the turn has no assistant text", () => {
    const fake = makeFakeBin("empty");
    return Effect.gen(function* () {
      const provider = yield* Provider;
      const sessionId = yield* provider.startSession("");
      const turn = yield* provider.sendTurn(sessionId, "hello");
      expect(turn).toEqual(new TurnResult({ stopReason: "completed" }));
    }).pipe(Effect.provide(codexDriverLayer(fake.bin, fake.workspace)));
  });

  it.effect("fails sendTurn when the agent exits mid-turn", () => {
    const fake = makeFakeBin("exit-on-prompt");
    return Effect.gen(function* () {
      const provider = yield* Provider;
      const sessionId = yield* provider.startSession("");
      const error = yield* provider.sendTurn(sessionId, "hello").pipe(Effect.flip);
      expect(error._tag).toBe("ProviderError");
      expect(error.message).toMatch(/exited|stdout closed|boom from fake codex/i);
    }).pipe(Effect.provide(codexDriverLayer(fake.bin, fake.workspace)));
  });

  it.effect("fails startSession when the binary is missing", () =>
    Effect.gen(function* () {
      const provider = yield* Provider;
      const error = yield* provider.startSession("/tmp").pipe(Effect.flip);
      expect(error._tag).toBe("ProviderError");
      expect(error.message).toMatch(/codex|Install Codex CLI/i);
    }).pipe(
      Effect.provide(
        codexDriverLayer(join(dirname(fakeAgentSource), "definitely-missing-codex"), tmpdir()),
      ),
    ),
  );
});
