import { BerniseRpcs, HealthStatus, ProviderError } from "@bernise/contracts";
import { NodeHttpServer, NodeSocket } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Stream } from "effect";
import { HttpClient, HttpClientResponse, HttpRouter, HttpServer } from "effect/unstable/http";
import { RpcClient, RpcSerialization, RpcTest } from "effect/unstable/rpc";
import { HttpRoutesLive } from "../src/HttpLive.ts";
import { Provider } from "../src/Provider.ts";
import { RpcHandlersLive } from "../src/RpcLive.ts";

const TestHttpLive = HttpRouter.serve(HttpRoutesLive, {
  disableListenLog: true,
  disableLogger: true,
}).pipe(Layer.provide(RpcSerialization.layerJson), Layer.provideMerge(NodeHttpServer.layerTest));

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
    }).pipe(Effect.provide(RpcHandlersLive), Effect.provide(StubProviderLive)),
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
});
