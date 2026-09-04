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
import { defaultBernisePersona, resolvePersona } from "./persona.ts";

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

const withResolvedPersona = (settings: HarnessSettings): HarnessSettings =>
  new HarnessSettings({
    codex: settings.codex,
    persona: resolvePersona(settings.persona),
  });

const makeSettingsService = Effect.fn("makeSettingsService")(function* (options: {
  readonly persist: (settings: HarnessSettings) => Effect.Effect<void, SettingsError>;
  readonly initial: HarnessSettings;
}) {
  const ref = yield* SynchronizedRef.make(withResolvedPersona(options.initial));
  return ServerSettings.of({
    get: SynchronizedRef.get(ref),
    update: (patch) =>
      SynchronizedRef.modifyEffect(ref, (current) => {
        if (typeof patch.persona === "string" && patch.persona.trim().length === 0) {
          return Effect.fail(new SettingsError({ message: "Persona markdown cannot be empty." }));
        }
        const next = withResolvedPersona(mergeHarnessSettings(current, patch));
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
    const personaPath = path.join(stateDir, "persona.md");

    const persist = (settings: HarnessSettings) =>
      Effect.gen(function* () {
        yield* fs.makeDirectory(stateDir, { recursive: true });
        yield* fs.writeFileString(
          settingsPath,
          `${JSON.stringify({ codex: settings.codex }, null, 2)}\n`,
        );
        if (settings.persona === defaultBernisePersona) {
          yield* fs.remove(personaPath, { force: true });
        } else {
          yield* fs.writeFileString(personaPath, settings.persona);
        }
      }).pipe(
        Effect.mapError(
          (cause) =>
            new SettingsError({
              message: `Could not write ${settingsPath}: ${cause.message}`,
            }),
        ),
      );

    const personaExists = yield* fs.exists(personaPath).pipe(Effect.orElseSucceed(() => false));
    const personaFromFile = personaExists
      ? yield* fs.readFileString(personaPath).pipe(Effect.orElseSucceed(() => ""))
      : "";

    const exists = yield* fs.exists(settingsPath).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return yield* makeSettingsService({
        persist,
        initial: new HarnessSettings({
          codex: defaultHarnessSettings.codex,
          persona: personaFromFile,
        }),
      });
    }

    const raw = yield* fs.readFileString(settingsPath).pipe(Effect.orElseSucceed(() => ""));
    const decoded = yield* Effect.try(() => JSON.parse(raw) as unknown).pipe(
      Effect.flatMap((parsed) => decodeSettings(parsed)),
      Effect.orElseSucceed(() => defaultHarnessSettings),
    );
    return yield* makeSettingsService({
      persist,
      initial: new HarnessSettings({
        codex: decoded.codex,
        persona: personaFromFile.length > 0 ? personaFromFile : decoded.persona,
      }),
    });
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
