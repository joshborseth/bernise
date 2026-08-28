import type { ProviderError, ProviderEvent, SessionId } from "@bernise/contracts";
import { Effect, Stream } from "effect";
import * as Context from "effect/Context";

export type { ProviderEvent, SessionId } from "@bernise/contracts";
export { ProviderError, ProviderTurnDelta } from "@bernise/contracts";

/**
 * Agent harness contract. Cursor CLI is the first live driver.
 * See docs/harness.md.
 */
export class Provider extends Context.Service<
  Provider,
  {
    readonly startSession: (workspace: string) => Effect.Effect<SessionId, ProviderError>;
    readonly sendTurn: (
      sessionId: SessionId,
      prompt: string,
    ) => Effect.Effect<string, ProviderError>;
    readonly subscribeEvents: (sessionId: SessionId) => Stream.Stream<ProviderEvent, ProviderError>;
  }
>()("@bernise/Provider") {}
