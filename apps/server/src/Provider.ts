import type { ProviderError, ProviderEvent, SessionId, TurnResult } from "@bernise/contracts";
import { Effect, Stream } from "effect";
import * as Context from "effect/Context";

export type { ProviderEvent, SessionId } from "@bernise/contracts";
export { ProviderError, ProviderTurnDelta } from "@bernise/contracts";

export type ProviderApi = {
  readonly startSession: (workspace: string) => Effect.Effect<SessionId, ProviderError>;
  readonly sendTurn: (
    sessionId: SessionId,
    prompt: string,
  ) => Effect.Effect<TurnResult, ProviderError>;
  readonly subscribeEvents: (sessionId: SessionId) => Stream.Stream<ProviderEvent, ProviderError>;
};

/**
 * Agent harness contract. Cursor ACP and Codex App Server sit behind a router.
 * See docs/harness.md.
 */
export class Provider extends Context.Service<Provider, ProviderApi>()("@bernise/Provider") {}

export class CursorProvider extends Context.Service<CursorProvider, ProviderApi>()(
  "@bernise/CursorProvider",
) {}

export class CodexProvider extends Context.Service<CodexProvider, ProviderApi>()(
  "@bernise/CodexProvider",
) {}
