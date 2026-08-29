import { ProviderSnapshot, ProviderSnapshots, type HarnessSettings } from "@bernise/contracts";
import { NodeServices } from "@effect/platform-node";
import { Cause, Config, Effect, Layer, Result, SynchronizedRef } from "effect";
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import * as Context from "effect/Context";
import { ChildProcessSpawner } from "effect/unstable/process";
import { makeCodexConnection } from "./codex/JsonRpcStdio.ts";
import { resolveCodexBin } from "./providerBins.ts";
import { expandHomePath } from "./pathExpand.ts";
import { ServerSettings } from "./ServerSettings.ts";

const codexBinEnv = Config.string("BERNISE_CODEX_BIN").pipe(Config.option);

const codexProbeTimeout = "10 seconds";
const probeKillAfter = "2 seconds";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export class ProviderHealth extends Context.Service<
  ProviderHealth,
  {
    readonly snapshots: Effect.Effect<ProviderSnapshots>;
    readonly refresh: Effect.Effect<ProviderSnapshots>;
  }
>()("@bernise/ProviderHealth") {}

const nowIso = (): string => new Date().toISOString();

export const pendingSnapshot = (enabled: boolean, message: string): ProviderSnapshot =>
  new ProviderSnapshot({
    kind: "codex",
    enabled,
    installed: false,
    version: null,
    status: "warning",
    auth: "unknown",
    message,
    checkedAt: nowIso(),
  });

const disabledSnapshot = (): ProviderSnapshot =>
  pendingSnapshot(false, "Codex is disabled in Bernise settings.");

const isAuthFailure = (message: string): boolean =>
  /auth|login|unauthorized|unauthenticated/i.test(message);

const isSpawnMissing = (error: unknown, message: string): boolean => {
  if (isRecord(error) && typeof error.reason === "object" && error.reason !== null) {
    const reason = error.reason as { readonly _tag?: unknown };
    if (reason._tag === "NotFound") {
      return true;
    }
  }
  return /not found|ENOENT|Could not spawn|Install Codex CLI|code 127/i.test(message);
};

const extractErrorMessage = (error: unknown): string => {
  if (Cause.isTimeoutError(error)) {
    return "Timed out while checking provider status.";
  }
  if (isRecord(error) && typeof error.message === "string" && error.message.length > 0) {
    return error.message;
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return String(error);
};

const missingBinarySnapshot = (checkedAt: string): ProviderSnapshot =>
  new ProviderSnapshot({
    kind: "codex",
    enabled: true,
    installed: false,
    version: null,
    status: "error",
    auth: "unknown",
    message: "Codex CLI (`codex`) was not found on PATH.",
    checkedAt,
  });

const commandIsMissingFile = (command: string): boolean =>
  isAbsolute(command) && !existsSync(command);

const versionFromInitialize = (result: unknown): string | null => {
  if (!isRecord(result)) {
    return null;
  }
  if (typeof result.userAgent === "string") {
    const match = result.userAgent.match(/\/([^\s]+)/);
    return match?.[1] ?? result.userAgent;
  }
  if (isRecord(result.agentInfo) && typeof result.agentInfo.version === "string") {
    return result.agentInfo.version;
  }
  if (typeof result.protocolVersion === "number") {
    return String(result.protocolVersion);
  }
  return null;
};

export const probeCodex = Effect.fn("probeCodex")(function* (input: {
  readonly command: string;
  readonly cwd: string;
  readonly homePath: string;
  readonly enabled: boolean;
}) {
  if (!input.enabled) {
    return disabledSnapshot();
  }
  const checkedAt = nowIso();
  if (commandIsMissingFile(input.command)) {
    return missingBinarySnapshot(checkedAt);
  }
  const homePath = input.homePath.trim();
  const probe = Effect.scoped(
    Effect.gen(function* () {
      const connection = yield* makeCodexConnection({
        command: input.command,
        args: ["app-server"],
        cwd: input.cwd,
        ...(homePath.length > 0 ? { env: { CODEX_HOME: expandHomePath(homePath) } } : {}),
        forceKillAfter: probeKillAfter,
        spawnHint: `Could not spawn ${input.command}. Install Codex CLI (\`codex\`) and run \`codex login\`.`,
        onNotification: () => Effect.void,
        onRequest: () => Effect.succeed({}),
      });
      const initialized = yield* connection.send("initialize", {
        clientInfo: { name: "bernise", title: "Bernise", version: "0.0.0" },
        capabilities: { experimentalApi: true },
      });
      yield* connection.notify("initialized");
      const account = yield* connection.send("account/read", {});
      const requiresAuth =
        isRecord(account) && account.requiresOpenaiAuth === true && account.account == null;
      if (requiresAuth) {
        return new ProviderSnapshot({
          kind: "codex",
          enabled: true,
          installed: true,
          version: versionFromInitialize(initialized),
          status: "error",
          auth: "unauthenticated",
          message: "Codex CLI is not authenticated. Run `codex login` and try again.",
          checkedAt,
        });
      }
      const auth =
        isRecord(account) && account.account != null
          ? ("authenticated" as const)
          : ("unknown" as const);
      return new ProviderSnapshot({
        kind: "codex",
        enabled: true,
        installed: true,
        version: versionFromInitialize(initialized),
        status: "ready",
        auth,
        message:
          auth === "authenticated"
            ? "Codex CLI is installed and authenticated."
            : "Codex App Server responded.",
        checkedAt,
      });
    }),
  );

  const result = yield* probe.pipe(Effect.timeout(codexProbeTimeout), Effect.result);
  if (Result.isSuccess(result)) {
    return result.success;
  }
  const error = result.failure;
  const message = Cause.isTimeoutError(error)
    ? "Timed out while checking Codex app-server provider status."
    : extractErrorMessage(error);
  if (Cause.isTimeoutError(error)) {
    return new ProviderSnapshot({
      kind: "codex",
      enabled: true,
      installed: true,
      version: null,
      status: "error",
      auth: "unknown",
      message,
      checkedAt,
    });
  }
  if (isAuthFailure(message)) {
    return new ProviderSnapshot({
      kind: "codex",
      enabled: true,
      installed: true,
      version: null,
      status: "error",
      auth: "unauthenticated",
      message: "Codex CLI is not authenticated. Run `codex login` and try again.",
      checkedAt,
    });
  }
  const installed = !isSpawnMissing(error, message);
  return new ProviderSnapshot({
    kind: "codex",
    enabled: true,
    installed,
    version: null,
    status: "error",
    auth: "unknown",
    message: installed
      ? `Codex app-server provider probe failed: ${message}.`
      : "Codex CLI (`codex`) was not found on PATH.",
    checkedAt,
  });
});

const initialSnapshots = (settings: HarnessSettings): ProviderSnapshots =>
  new ProviderSnapshots({
    codex: pendingSnapshot(
      settings.codex.enabled,
      "Codex provider status has not been checked in this session yet.",
    ),
  });

export const ProviderHealthLive = Layer.effect(
  ProviderHealth,
  Effect.gen(function* () {
    const serverSettings = yield* ServerSettings;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const codexEnv = yield* codexBinEnv;
    const settings = yield* serverSettings.get;
    const ref = yield* SynchronizedRef.make(initialSnapshots(settings));

    const refresh = Effect.gen(function* () {
      const current = yield* serverSettings.get;
      const cwd = process.cwd();
      const codex = yield* probeCodex({
        command: resolveCodexBin(current.codex.binaryPath, codexEnv),
        cwd,
        homePath: current.codex.homePath,
        enabled: current.codex.enabled,
      }).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner));
      const next = new ProviderSnapshots({ codex });
      yield* SynchronizedRef.set(ref, next);
      return next;
    });

    return ProviderHealth.of({
      snapshots: SynchronizedRef.get(ref),
      refresh,
    });
  }),
).pipe(Layer.provide(NodeServices.layer));

export const providerHealthMemory = (snapshots: ProviderSnapshots) =>
  Layer.succeed(
    ProviderHealth,
    ProviderHealth.of({
      snapshots: Effect.succeed(snapshots),
      refresh: Effect.succeed(snapshots),
    }),
  );
