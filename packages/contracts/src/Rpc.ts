import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

export class Pong extends Schema.Class<Pong>("Pong")({
  pong: Schema.Literal(true),
}) {}

export class Ping extends Rpc.make("Ping", {
  success: Pong,
}) {}

export const BerniseRpcs = RpcGroup.make(Ping);
