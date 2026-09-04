import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { ProviderError, ProviderEvent, SessionId, SessionStarted, TurnResult } from "./Provider.ts";
import {
  PersistenceError,
  ThreadDeleted,
  ThreadId,
  ThreadList,
  ThreadShell,
  ThreadSnapshot,
} from "./Thread.ts";
import {
  CodexSettingsPatch,
  HarnessSettings,
  ModelCatalog,
  ProviderSnapshots,
  SettingsError,
} from "./Settings.ts";

export class Pong extends Schema.Class<Pong>("Pong")({
  pong: Schema.Literal(true),
}) {}

export class WorkspaceInfo extends Schema.Class<WorkspaceInfo>("WorkspaceInfo")({
  path: Schema.String,
  name: Schema.String,
}) {}

export class Ping extends Rpc.make("Ping", {
  success: Pong,
}) {}

export class StartSession extends Rpc.make("StartSession", {
  payload: {
    threadId: ThreadId,
    workspace: Schema.optionalKey(Schema.String),
    model: Schema.optionalKey(Schema.String),
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
    model: Schema.optionalKey(Schema.String),
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

export class GetWorkspace extends Rpc.make("GetWorkspace", {
  success: WorkspaceInfo,
}) {}

export class GetSettings extends Rpc.make("GetSettings", {
  success: HarnessSettings,
}) {}

export class UpdateSettings extends Rpc.make("UpdateSettings", {
  payload: {
    codex: Schema.optionalKey(CodexSettingsPatch),
    persona: Schema.optionalKey(Schema.NullOr(Schema.String)),
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

export class ListModels extends Rpc.make("ListModels", {
  success: ModelCatalog,
  error: ProviderError,
}) {}

export class ListThreads extends Rpc.make("ListThreads", {
  success: ThreadList,
  error: PersistenceError,
}) {}

export class GetThread extends Rpc.make("GetThread", {
  payload: {
    threadId: ThreadId,
  },
  success: ThreadSnapshot,
  error: PersistenceError,
}) {}

export class RenameThread extends Rpc.make("RenameThread", {
  payload: {
    threadId: ThreadId,
    title: Schema.String,
  },
  success: ThreadShell,
  error: PersistenceError,
}) {}

export class DeleteThread extends Rpc.make("DeleteThread", {
  payload: {
    threadId: ThreadId,
  },
  success: ThreadDeleted,
  error: PersistenceError,
}) {}

export const BerniseRpcs = RpcGroup.make(
  Ping,
  StartSession,
  SendTurn,
  SubscribeEvents,
  GetWorkspace,
  GetSettings,
  UpdateSettings,
  GetProviderSnapshots,
  RefreshProviders,
  ListModels,
  ListThreads,
  GetThread,
  RenameThread,
  DeleteThread,
);
