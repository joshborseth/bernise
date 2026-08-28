import { BerniseRpcs, HealthStatus, ProviderError } from "@bernise/contracts";
import { NodeHttpServer } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Stream } from "effect";
import { HttpClient, HttpClientResponse, HttpRouter } from "effect/unstable/http";
import { RpcSerialization, RpcTest } from "effect/unstable/rpc";
import { HttpRoutesLive } from "../src/HttpLive.ts";
import { Provider } from "../src/Provider.ts";
import { RpcHandlersLive } from "../src/RpcLive.ts";

const TestHttpLive = HttpRouter.serve(HttpRoutesLive, {
  disableListenLog: true,
  disableLogger: true,
}).pipe(Layer.provide(RpcSerialization.layerNdjson), Layer.provideMerge(NodeHttpServer.layerTest));

const StubProviderLive = Layer.succeed(
  Provider,
  Provider.of({
    startSession: () => Effect.fail(new ProviderError({ message: "stub" })),
    sendTurn: () => Effect.fail(new ProviderError({ message: "stub" })),
    subscribeEvents: () => Stream.fail(new ProviderError({ message: "stub" })),
  }),
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

  it.effect("POST /rpc is registered for HTTP RPC", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.post("/rpc");
      expect(response.status).not.toBe(404);
    }).pipe(Effect.provide(TestHttpLive)),
  );
});
