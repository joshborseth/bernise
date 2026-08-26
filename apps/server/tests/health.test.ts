import { BerniseRpcs, HealthStatus } from "@bernise/contracts";
import { NodeHttpServer } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpClient, HttpClientResponse, HttpRouter } from "effect/unstable/http";
import { RpcSerialization, RpcTest } from "effect/unstable/rpc";
import { HttpRoutesLive } from "../src/HttpLive.ts";
import { PingLive } from "../src/PingLive.ts";

const TestHttpLive = HttpRouter.serve(HttpRoutesLive, {
  disableListenLog: true,
  disableLogger: true,
}).pipe(Layer.provide(RpcSerialization.layerNdjson), Layer.provideMerge(NodeHttpServer.layerTest));

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
    }).pipe(Effect.provide(PingLive)),
  );
});
