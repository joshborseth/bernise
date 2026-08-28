import {
  defaultHarnessSettings,
  HarnessSettings,
  HarnessSettingsPatch,
  mergeHarnessSettings,
  SettingsError,
} from "@bernise/contracts";
import { NodeServices } from "@effect/platform-node";
import { Config, Effect, FileSystem, Layer, Path, Schema, SynchronizedRef } from "effect";
import * as Context from "effect/Context";
import { homedir } from "node:os";
import { join } from "node:path";

const stateDirConfig = Config.string("BERNISE_STATE_DIR").pipe(
  Config.withDefault(join(homedir(), ".bernise")),
);

export class ServerSettings extends Context.Service<
  ServerSettings,
  {
    readonly get: Effect.Effect<HarnessSettings>;
    readonly update: (patch: HarnessSettingsPatch) => Effect.Effect<HarnessSettings, SettingsError>;
  }
>()("@bernise/ServerSettings") {}

const decodeSettings = Schema.decodeUnknownEffect(HarnessSettings);

const makeSettingsService = Effect.fn("makeSettingsService")(function* (options: {
  readonly persist: (settings: HarnessSettings) => Effect.Effect<void, SettingsError>;
  readonly initial: HarnessSettings;
}) {
  const ref = yield* SynchronizedRef.make(options.initial);
  return ServerSettings.of({
    get: SynchronizedRef.get(ref),
    update: (patch) =>
      SynchronizedRef.modifyEffect(ref, (current) => {
        const next = mergeHarnessSettings(current, patch);
        return options.persist(next).pipe(Effect.as([next, next] as const));
      }),
  });
});

export const ServerSettingsLive = Layer.effect(
  ServerSettings,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const stateDir = yield* stateDirConfig;
    const settingsPath = path.join(stateDir, "settings.json");

    const persist = (settings: HarnessSettings) =>
      Effect.gen(function* () {
        yield* fs.makeDirectory(stateDir, { recursive: true });
        yield* fs.writeFileString(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
      }).pipe(
        Effect.mapError(
          (cause) =>
            new SettingsError({
              message: `Could not write ${settingsPath}: ${cause.message}`,
            }),
        ),
      );

    const exists = yield* fs.exists(settingsPath).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return yield* makeSettingsService({ persist, initial: defaultHarnessSettings });
    }

    const raw = yield* fs.readFileString(settingsPath).pipe(Effect.orElseSucceed(() => ""));
    const decoded = yield* Effect.try(() => JSON.parse(raw) as unknown).pipe(
      Effect.flatMap((parsed) => decodeSettings(parsed)),
      Effect.orElseSucceed(() => defaultHarnessSettings),
    );
    return yield* makeSettingsService({ persist, initial: decoded });
  }),
).pipe(Layer.provide(NodeServices.layer));

export const serverSettingsMemory = (initial: HarnessSettings = defaultHarnessSettings) =>
  Layer.effect(
    ServerSettings,
    makeSettingsService({
      persist: () => Effect.void,
      initial,
    }),
  );
