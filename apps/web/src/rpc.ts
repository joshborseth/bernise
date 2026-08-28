import { BerniseRpcs } from "@bernise/contracts";
import { BrowserSocket } from "@effect/platform-browser";
import { Layer } from "effect";
import { AtomRpc } from "effect/unstable/reactivity";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";

const rpcSocketUrl = (): string => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/rpc`;
};

const RpcProtocolLive = RpcClient.layerProtocolSocket().pipe(
  Layer.provide(RpcSerialization.layerJson),
  Layer.provide(Layer.suspend(() => BrowserSocket.layerWebSocket(rpcSocketUrl()))),
);

export class BerniseRpc extends AtomRpc.Service()("bernise/BerniseRpc", {
  group: BerniseRpcs,
  protocol: RpcProtocolLive,
}) {}
