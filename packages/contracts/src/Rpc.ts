import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { ProviderError, ProviderEvent, SessionId, SessionStarted, TurnResult } from "./Provider.ts";

export class Pong extends Schema.Class<Pong>("Pong")({
  pong: Schema.Literal(true),
}) {}

export class Ping extends Rpc.make("Ping", {
  success: Pong,
}) {}

export class StartSession extends Rpc.make("StartSession", {
  payload: {
    workspace: Schema.optionalKey(Schema.String),
  },
  success: SessionStarted,
  error: ProviderError,
}) {}

/** Accepts `{ stopReason }` and the previous Void encoding (`null`) so a stale server cannot decode-fail Speak. */
export const SendTurnResult = Schema.Union([TurnResult, Schema.Null]);
export type SendTurnResult = typeof SendTurnResult.Type;

export class SendTurn extends Rpc.make("SendTurn", {
  payload: {
    sessionId: SessionId,
    prompt: Schema.String,
  },
  success: SendTurnResult,
  error: ProviderError,
}) {}

export class SubscribeEvents extends Rpc.make("SubscribeEvents", {
  payload: {
    sessionId: SessionId,
  },
  success: ProviderEvent,
  error: ProviderError,
  stream: true,
}) {}

export const BerniseRpcs = RpcGroup.make(Ping, StartSession, SendTurn, SubscribeEvents);
