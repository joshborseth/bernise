import { BerniseRpcs, HealthStatus, type Pong } from "@bernise/contracts";
import { BrowserSocket } from "@effect/platform-browser";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import * as Context from "effect/Context";
import { RpcClient, RpcGroup, RpcSerialization } from "effect/unstable/rpc";
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError";
import { useEffect, useState } from "react";

class BerniseClient extends Context.Service<
  BerniseClient,
  RpcClient.RpcClient<RpcGroup.Rpcs<typeof BerniseRpcs>, RpcClientError>
>()("@bernise/BerniseClient") {
  static readonly layer = Layer.effect(BerniseClient)(RpcClient.make(BerniseRpcs));
}

class HealthRequestError extends Schema.TaggedError<HealthRequestError>()("HealthRequestError", {
  cause: Schema.Unknown,
}) {}

const rpcUrl = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/rpc`;

const ClientLive = BerniseClient.layer.pipe(
  Layer.provide(RpcClient.layerProtocolSocket()),
  Layer.provide(BrowserSocket.layerWebSocket(rpcUrl)),
  Layer.provide(RpcSerialization.layerNdjson),
);

type ProbeState =
  | { readonly status: "checking" }
  | { readonly status: "ok"; readonly health: HealthStatus; readonly pong: Pong }
  | { readonly status: "error"; readonly message: string };

const loadStatus = Effect.gen(function* () {
  const raw = yield* Effect.tryPromise({
    try: async () => {
      const response = await fetch("/health");
      if (!response.ok) {
        throw `health ${response.status}`;
      }
      return response.json() as Promise<unknown>;
    },
    catch: (cause) => new HealthRequestError({ cause }),
  });
  const health = yield* Schema.decodeUnknownEffect(HealthStatus)(raw);
  const client = yield* BerniseClient;
  const pong = yield* client.Ping();
  return { health, pong } as const;
});

export function App() {
  const [state, setState] = useState<ProbeState>({ status: "checking" });

  useEffect(() => {
    const runtime = ManagedRuntime.make(ClientLive);
    void runtime.runPromise(loadStatus).then(
      ({ health, pong }) => {
        setState({ status: "ok", health, pong });
      },
      (error: unknown) => {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "probe failed",
        });
      },
    );
    return () => {
      void runtime.dispose();
    };
  }, []);

  return (
    <main className="shell">
      <p className="eyebrow">Control surface</p>
      <h1>Bernise</h1>
      <p className="lede">
        Effect-native shell. The server is the execution boundary. Agents come later.
      </p>
      <section className="panel" aria-live="polite">
        <header>
          <span className={`lamp lamp-${state.status}`} />
          <h2>Runtime probe</h2>
        </header>
        {state.status === "checking" ? <p className="mono">waiting for health + ping</p> : null}
        {state.status === "ok" ? (
          <dl className="mono">
            <div>
              <dt>health</dt>
              <dd>
                {state.health.service} / {String(state.health.ok)}
              </dd>
            </div>
            <div>
              <dt>rpc ping</dt>
              <dd>{String(state.pong.pong)}</dd>
            </div>
          </dl>
        ) : null}
        {state.status === "error" ? <p className="mono error">{state.message}</p> : null}
      </section>
    </main>
  );
}
