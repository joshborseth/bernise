import { BerniseRpcs } from "@bernise/contracts";
import { NodeHttpServer } from "@effect/platform-node";
import { Config, Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";
import * as Http from "node:http";
import { CursorProviderLive } from "./CursorProviderLive.ts";
import { HealthLive } from "./HealthLive.ts";
import { RpcHandlersLive } from "./RpcLive.ts";

export const portConfig = Config.port("BERNISE_PORT").pipe(Config.withDefault(13773));
export const hostConfig = Config.string("BERNISE_HOST").pipe(Config.withDefault("127.0.0.1"));

const RpcLive = RpcServer.layerHttp({
  group: BerniseRpcs,
  path: "/rpc",
}).pipe(Layer.provide(RpcHandlersLive), Layer.provide(CursorProviderLive));

export const HttpRoutesLive = Layer.mergeAll(HealthLive, RpcLive, HttpRouter.cors());

export const HttpLive = Layer.unwrap(
  Effect.gen(function* () {
    const port = yield* portConfig;
    const host = yield* hostConfig;
    return HttpRouter.serve(HttpRoutesLive).pipe(
      Layer.provide(RpcSerialization.layerNdjson),
      Layer.provide(
        NodeHttpServer.layer(() => Http.createServer(), {
          port,
          host,
        }),
      ),
    );
  }),
);
