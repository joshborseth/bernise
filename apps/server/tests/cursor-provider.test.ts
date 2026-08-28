import { BerniseRpcs, ProviderTurnDelta } from "@bernise/contracts";
import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Fiber, Layer, Stream } from "effect";
import { RpcTest } from "effect/unstable/rpc";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CursorProviderLive, pickPermissionOptionId } from "../src/CursorProviderLive.ts";
import { Provider } from "../src/Provider.ts";
import { RpcHandlersLive } from "../src/RpcLive.ts";

const fakeAgentSource = fileURLToPath(new URL("./fake-acp-agent.mjs", import.meta.url));

const makeFakeBin = (): { readonly bin: string; readonly workspace: string } => {
  const workspace = mkdtempSync(join(tmpdir(), "bernise-acp-"));
  const bin = join(workspace, "fake-cursor-agent");
  writeFileSync(
    bin,
    `#!/bin/sh
exec ${JSON.stringify(process.execPath)} ${JSON.stringify(fakeAgentSource)} "$@"
`,
    { encoding: "utf8" },
  );
  chmodSync(bin, 0o755);
  return { bin, workspace };
};

const providerLayer = (bin: string, workspace: string) =>
  CursorProviderLive.pipe(
    Layer.provide(
      ConfigProvider.layer(
        ConfigProvider.fromUnknown({
          BERNISE_CURSOR_BIN: bin,
          BERNISE_WORKSPACE: workspace,
        }),
      ),
    ),
  );

describe("pickPermissionOptionId", () => {
  it("prefers allow_once", () => {
    expect(
      pickPermissionOptionId({
        options: [
          { optionId: "reject-once", kind: "reject_once" },
          { optionId: "allow-once", kind: "allow_once" },
        ],
      }),
    ).toBe("allow-once");
  });
});

describe("CursorProviderLive", () => {
  it.effect("starts a session, auto-approves permission, and streams text deltas", () => {
    const fake = makeFakeBin();
    return Effect.gen(function* () {
      const provider = yield* Provider;
      const sessionId = yield* provider.startSession("");
      const fiber = yield* Stream.runCollect(
        Stream.take(provider.subscribeEvents(sessionId), 2),
      ).pipe(Effect.forkDetach);
      yield* provider.sendTurn(sessionId, "hello");
      const events = yield* Fiber.join(fiber);
      expect(events).toEqual([
        new ProviderTurnDelta({ text: "Hello" }),
        new ProviderTurnDelta({ text: " from ACP" }),
      ]);
    }).pipe(Effect.provide(providerLayer(fake.bin, fake.workspace)));
  });

  it.effect("fails startSession when the binary is missing", () =>
    Effect.gen(function* () {
      const provider = yield* Provider;
      const error = yield* provider.startSession("/tmp").pipe(Effect.flip);
      expect(error._tag).toBe("ProviderError");
      expect(error.message).toMatch(/cursor-agent|Install Cursor CLI/i);
    }).pipe(
      Effect.provide(
        CursorProviderLive.pipe(
          Layer.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({
                BERNISE_CURSOR_BIN: join(
                  dirname(fakeAgentSource),
                  "definitely-missing-cursor-agent",
                ),
                BERNISE_WORKSPACE: tmpdir(),
              }),
            ),
          ),
        ),
      ),
    ),
  );
});

describe("Provider RPCs", () => {
  it.effect("StartSession / SubscribeEvents / SendTurn streams text deltas", () => {
    const fake = makeFakeBin();
    return Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(BerniseRpcs);
      const started = yield* client.StartSession({ workspace: fake.workspace });
      const fiber = yield* Stream.runCollect(
        Stream.take(client.SubscribeEvents({ sessionId: started.sessionId }), 2),
      ).pipe(Effect.forkDetach);
      yield* client.SendTurn({ sessionId: started.sessionId, prompt: "hello" });
      const events = yield* Fiber.join(fiber);
      expect(events).toEqual([
        new ProviderTurnDelta({ text: "Hello" }),
        new ProviderTurnDelta({ text: " from ACP" }),
      ]);
    }).pipe(
      Effect.provide(RpcHandlersLive),
      Effect.provide(providerLayer(fake.bin, fake.workspace)),
    );
  });
});
