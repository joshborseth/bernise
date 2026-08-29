import type {
  ModelCatalog,
  ProviderError,
  ProviderEvent,
  SessionId,
  TurnResult,
} from "@bernise/contracts";
import { Effect, Stream } from "effect";
import * as Context from "effect/Context";

export type { ProviderEvent, SessionId } from "@bernise/contracts";
export { ProviderError, ProviderTurnDelta } from "@bernise/contracts";

export type ProviderApi = {
  readonly startSession: (
    workspace: string,
    model?: string,
  ) => Effect.Effect<SessionId, ProviderError>;
  readonly sendTurn: (
    sessionId: SessionId,
    prompt: string,
    model?: string,
  ) => Effect.Effect<TurnResult, ProviderError>;
  readonly subscribeEvents: (sessionId: SessionId) => Stream.Stream<ProviderEvent, ProviderError>;
  readonly listModels: Effect.Effect<ModelCatalog, ProviderError>;
};

/**
 * Agent harness contract. Codex App Server is the live driver.
 * See docs/harness.md.
 */
export class Provider extends Context.Service<Provider, ProviderApi>()("@bernise/Provider") {}
