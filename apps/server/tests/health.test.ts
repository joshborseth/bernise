import { BerniseRpcs, HealthStatus, ProviderError } from "@bernise/contracts";
import { NodeHttpServer, NodeSocket } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer, Stream } from "effect";
import { HttpClient, HttpClientResponse, HttpRouter, HttpServer } from "effect/unstable/http";
import { RpcClient, RpcSerialization, RpcTest } from "effect/unstable/rpc";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpRoutesLive } from "../src/HttpLive.ts";
import { Provider } from "../src/Provider.ts";
import { providerHealthMemory } from "../src/ProviderHealth.ts";
import { RpcHandlersLive } from "../src/RpcLive.ts";
import { serverSettingsMemory } from "../src/ServerSettings.ts";
import { pendingSnapshots } from "./testLayers.ts";

const stateDir = mkdtempSync(join(tmpdir(), "bernise-health-"));

const TestHttpLive = HttpRouter.serve(HttpRoutesLive, {
  disableListenLog: true,
  disableLogger: true,
}).pipe(
  Layer.provide(RpcSerialization.layerJson),
  Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ BERNISE_STATE_DIR: stateDir }))),
  Layer.provideMerge(NodeHttpServer.layerTest),
);

const StubProviderLive = Layer.succeed(
  Provider,
  Provider.of({
    startSession: () => Effect.fail(new ProviderError({ message: "stub" })),
    sendTurn: () => Effect.fail(new ProviderError({ message: "stub" })),
    subscribeEvents: () => Stream.fail(new ProviderError({ message: "stub" })),
  }),
);

const WsRpcClientLive = RpcClient.layerProtocolSocket().pipe(
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

describe("bernise server", () => {
  it.effect("GET /health reports ok", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.get("/health");
      const body = yield* HttpClientResponse.schemaBodyJson(HealthStatus)(response);
      expect(body.ok).toBe(true);
      expect(body.service).toBe("bernise-server");
    }).pipe(Effect.provide(TestHttpLive)),
  );

  it.effect("Ping returns pong", () =>
    Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(BerniseRpcs);
      const pong = yield* client.Ping();
      expect(pong.pong).toBe(true);
    }).pipe(
      Effect.provide(RpcHandlersLive),
      Effect.provide(StubProviderLive),
      Effect.provide(serverSettingsMemory()),
      Effect.provide(providerHealthMemory(pendingSnapshots())),
    ),
  );

  it.effect("Ping over WebSocket /rpc", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* RpcClient.make(BerniseRpcs);
        const pong = yield* client.Ping();
        expect(pong.pong).toBe(true);
      }),
    ).pipe(Effect.provide(WsRpcClientLive), Effect.provide(TestHttpLive)),
  );

  it.effect("GetSettings and UpdateSettings persist Codex paths", () =>
    Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(BerniseRpcs);
      const initial = yield* client.GetSettings();
      expect(initial.codex.binaryPath).toBe("");
      const next = yield* client.UpdateSettings({
        codex: { binaryPath: "/usr/local/bin/codex", homePath: "~/.codex" },
      });
      expect(next.codex.binaryPath).toBe("/usr/local/bin/codex");
      expect(next.codex.homePath).toBe("~/.codex");
      expect(yield* client.GetSettings()).toEqual(next);
      const snapshots = yield* client.GetProviderSnapshots();
      expect(snapshots.codex.kind).toBe("codex");
      expect(yield* client.RefreshProviders()).toEqual(snapshots);
    }).pipe(
      Effect.provide(RpcHandlersLive),
      Effect.provide(StubProviderLive),
      Effect.provide(serverSettingsMemory()),
      Effect.provide(providerHealthMemory(pendingSnapshots())),
    ),
  );
});
