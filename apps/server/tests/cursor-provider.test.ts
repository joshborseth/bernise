import { BerniseRpcs, ProviderTurnDelta } from "@bernise/contracts";
import { NodeHttpServer, NodeSocket } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Fiber, Layer, Stream } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { RpcClient, RpcSerialization, RpcTest } from "effect/unstable/rpc";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CursorProviderLive, pickPermissionOptionId } from "../src/CursorProviderLive.ts";
import { HttpRoutesLive } from "../src/HttpLive.ts";
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

  it.effect("delivers text deltas even if the subscriber attaches after the turn", () => {
    const fake = makeFakeBin();
    return Effect.gen(function* () {
      const provider = yield* Provider;
      const sessionId = yield* provider.startSession("");
      yield* provider.sendTurn(sessionId, "hello");
      const events = yield* Stream.runCollect(Stream.take(provider.subscribeEvents(sessionId), 2));
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

describe("Provider RPCs over WebSocket", () => {
  it.effect("SubscribeEvents streams deltas over /rpc", () => {
    const fake = makeFakeBin();
    const TestWsLive = HttpRouter.serve(HttpRoutesLive, {
      disableListenLog: true,
      disableLogger: true,
    }).pipe(
      Layer.provide(RpcSerialization.layerJson),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            BERNISE_CURSOR_BIN: fake.bin,
            BERNISE_WORKSPACE: fake.workspace,
          }),
        ),
      ),
      Layer.provideMerge(NodeHttpServer.layerTest),
    );
    const WsClientLive = RpcClient.layerProtocolSocket().pipe(
      Layer.provide(RpcSerialization.layerJson),
      Layer.provide(
        Effect.gen(function* () {
          const server = yield* HttpServer.HttpServer;
          const address = server.address;
          if (address._tag !== "TcpAddress") {
            return yield* Effect.die("expected TCP test server");
          }
          return NodeSocket.layerWebSocket(`http://127.0.0.1:${String(address.port)}/rpc`);
        }).pipe(Layer.unwrap),
      ),
    );
    return Effect.scoped(
      Effect.gen(function* () {
        const client = yield* RpcClient.make(BerniseRpcs);
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
      }),
    ).pipe(Effect.provide(WsClientLive), Effect.provide(TestWsLive));
  });
});
