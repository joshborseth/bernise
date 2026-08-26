import { Effect, Schema, Stream } from "effect";
import * as Context from "effect/Context";

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

/**
 * Agent harness contract. No layer in this scaffold — first live driver is
 * Cursor CLI, later. See docs/harness.md.
 */
export class Provider extends Context.Service<
  Provider,
  {
    readonly startSession: (workspace: string) => Effect.Effect<SessionId>;
    readonly sendTurn: (sessionId: SessionId, prompt: string) => Effect.Effect<void>;
    readonly subscribeEvents: (sessionId: SessionId) => Stream.Stream<ProviderEvent>;
  }
>()("@bernise/Provider") {}
