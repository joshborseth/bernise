import { BerniseRpcs } from "@bernise/contracts";
import { BrowserSocket } from "@effect/platform-browser";
import { Deferred, Effect, Layer } from "effect";
import { RpcClient, RpcClientError, RpcGroup, RpcSerialization } from "effect/unstable/rpc";

const rpcSocketUrl = (): string => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/rpc`;
};

const RpcClientLive = RpcClient.layerProtocolSocket().pipe(
  Layer.provide(RpcSerialization.layerJson),
  Layer.provide(BrowserSocket.layerWebSocket(rpcSocketUrl())),
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
