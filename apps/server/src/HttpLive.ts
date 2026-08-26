import { BerniseRpcs } from "@bernise/contracts";
import { NodeHttpServer } from "@effect/platform-node";
import { Config, Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";
import * as Http from "node:http";
import { HealthLive } from "./HealthLive.ts";
import { PingLive } from "./PingLive.ts";

export const portConfig = Config.port("BERNISE_PORT").pipe(Config.withDefault(8787));

const RpcLive = RpcServer.layerHttp({
  group: BerniseRpcs,
  path: "/rpc",
}).pipe(Layer.provide(PingLive));

export const HttpRoutesLive = Layer.mergeAll(HealthLive, RpcLive, HttpRouter.cors());

export const HttpLive = Layer.unwrap(
  Effect.gen(function* () {
    const port = yield* portConfig;
    return HttpRouter.serve(HttpRoutesLive).pipe(
      Layer.provide(RpcSerialization.layerNdjson),
      Layer.provide(
        NodeHttpServer.layer(() => Http.createServer(), {
          port,
          host: "127.0.0.1",
        }),
      ),
    );
  }),
);
