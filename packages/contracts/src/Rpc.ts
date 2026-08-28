import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { ProviderError, ProviderEvent, SessionId, SessionStarted, TurnResult } from "./Provider.ts";
import {
  CodexSettingsPatch,
  CursorSettingsPatch,
  HarnessSettings,
  ProviderKind,
  ProviderSnapshots,
  SettingsError,
} from "./Settings.ts";

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

export class GetSettings extends Rpc.make("GetSettings", {
  success: HarnessSettings,
}) {}

export class UpdateSettings extends Rpc.make("UpdateSettings", {
  payload: {
    activeProvider: Schema.optionalKey(ProviderKind),
    cursor: Schema.optionalKey(CursorSettingsPatch),
    codex: Schema.optionalKey(CodexSettingsPatch),
  },
  success: HarnessSettings,
  error: SettingsError,
}) {}

export class GetProviderSnapshots extends Rpc.make("GetProviderSnapshots", {
  success: ProviderSnapshots,
}) {}

export class RefreshProviders extends Rpc.make("RefreshProviders", {
  success: ProviderSnapshots,
}) {}

export const BerniseRpcs = RpcGroup.make(
  Ping,
  StartSession,
  SendTurn,
  SubscribeEvents,
  GetSettings,
  UpdateSettings,
  GetProviderSnapshots,
  RefreshProviders,
);
