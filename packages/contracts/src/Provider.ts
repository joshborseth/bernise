import { Schema } from "effect";

export const SessionId = Schema.String.pipe(Schema.brand("SessionId"));
export type SessionId = typeof SessionId.Type;

export class ProviderTurnDelta extends Schema.TaggedClass<ProviderTurnDelta>()(
  "ProviderTurnDelta",
  {
    text: Schema.String,
  },
) {}

export const ProviderEvent = Schema.Union([ProviderTurnDelta]);
export type ProviderEvent = typeof ProviderEvent.Type;

export class ProviderError extends Schema.TaggedError<ProviderError>()("ProviderError", {
  message: Schema.String,
}) {}

export class SessionStarted extends Schema.Class<SessionStarted>("SessionStarted")({
  sessionId: SessionId,
}) {}

export class TurnResult extends Schema.Class<TurnResult>("TurnResult")({
  stopReason: Schema.String,
}) {}
