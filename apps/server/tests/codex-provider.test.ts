import { CodexModel, ModelCatalog, ProviderTurnDelta, TurnResult } from "@bernise/contracts";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Stream } from "effect";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clientRequestResult, readCodexModelPage } from "../src/CodexProviderLive.ts";
import { berniseDeveloperInstructions } from "../src/persona.ts";
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

  it.effect("passes a selected model into thread/start and turn/start", () => {
    const fake = makeFakeBin();
    return Effect.gen(function* () {
      const provider = yield* Provider;
      const sessionId = yield* provider.startSession("", "gpt-5.4-mini");
      yield* provider.sendTurn(sessionId, "hello", "gpt-5.4");
      const thread = JSON.parse(
        readFileSync(join(fake.workspace, "last-thread-start.json"), "utf8"),
      ) as { readonly model: string | null };
      const turn = JSON.parse(
        readFileSync(join(fake.workspace, "last-turn-start.json"), "utf8"),
      ) as {
        readonly model: string | null;
      };
      expect(thread.model).toBe("gpt-5.4-mini");
      expect(turn.model).toBe("gpt-5.4");
    }).pipe(Effect.provide(codexDriverLayer(fake.bin, fake.workspace)));
  });

  it.effect("sends Bernise developerInstructions on thread/start", () => {
    const fake = makeFakeBin();
    return Effect.gen(function* () {
      const provider = yield* Provider;
      yield* provider.startSession("");
      const thread = JSON.parse(
        readFileSync(join(fake.workspace, "last-thread-start.json"), "utf8"),
      ) as {
        readonly cwd: string | null;
        readonly developerInstructions: string | null;
      };
      expect(thread.cwd).toBe(fake.workspace);
      expect(thread.developerInstructions).toBe(berniseDeveloperInstructions);
    }).pipe(Effect.provide(codexDriverLayer(fake.bin, fake.workspace)));
  });

  it.effect("lists visible Codex models and skips hidden entries", () => {
    const fake = makeFakeBin();
    return Effect.gen(function* () {
      const provider = yield* Provider;
      const catalog = yield* provider.listModels;
      expect(catalog).toEqual(
        new ModelCatalog({
          models: [
            new CodexModel({
              id: "gpt-5.4-mini",
              displayName: "GPT-5.4 Mini",
              isDefault: true,
            }),
            new CodexModel({ id: "gpt-5.4", displayName: "GPT-5.4", isDefault: false }),
          ],
        }),
      );
    }).pipe(Effect.provide(codexDriverLayer(fake.bin, fake.workspace)));
  });
});

describe("readCodexModelPage", () => {
  it("reads ids, display names, defaults, and pagination", () => {
    expect(
      readCodexModelPage({
        data: [
          { id: "gpt-5.4", displayName: "GPT-5.4", isDefault: true },
          { model: "fallback-id", hidden: false },
          { id: "hidden-model", hidden: true },
          { notAModel: true },
        ],
        nextCursor: "page-2",
      }),
    ).toEqual({
      models: [
        new CodexModel({ id: "gpt-5.4", displayName: "GPT-5.4", isDefault: true }),
        new CodexModel({ id: "fallback-id", displayName: "fallback-id", isDefault: false }),
      ],
      nextCursor: "page-2",
    });
  });

  it("reads models from a models or items array", () => {
    expect(
      readCodexModelPage({
        models: [{ id: "gpt-5.6-terra", displayName: "GPT-5.6-Terra", isDefault: true }],
      }),
    ).toEqual({
      models: [
        new CodexModel({ id: "gpt-5.6-terra", displayName: "GPT-5.6-Terra", isDefault: true }),
      ],
      nextCursor: undefined,
    });
  });
});
