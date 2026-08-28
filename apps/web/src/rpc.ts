import { BerniseRpcs } from "@bernise/contracts";
import { Deferred, Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { RpcClient, RpcClientError, RpcGroup, RpcSerialization } from "effect/unstable/rpc";

const RpcClientLive = RpcClient.layerProtocolHttp({ url: "/rpc" }).pipe(
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(FetchHttpClient.layer),
);

type BerniseClient = RpcClient.RpcClient<
  RpcGroup.Rpcs<typeof BerniseRpcs>,
  RpcClientError.RpcClientError
>;

const clientDeferred = Deferred.makeUnsafe<BerniseClient>();
let booted = false;

const boot = (): void => {
  if (booted) {
    return;
  }
  booted = true;
  Effect.runFork(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* RpcClient.make(BerniseRpcs);
        yield* Deferred.succeed(clientDeferred, client);
        return yield* Effect.never;
      }).pipe(Effect.provide(RpcClientLive)),
    ),
  );
};

export const berniseClient: Effect.Effect<BerniseClient> = Effect.gen(function* () {
  boot();
  return yield* Deferred.await(clientDeferred);
});
