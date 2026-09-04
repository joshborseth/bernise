import {
  defaultHarnessSettings,
  HarnessSettings,
  HarnessSettingsPatch,
  mergeHarnessSettings,
} from "@bernise/contracts";
import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultBernisePersona } from "../src/persona.ts";
import { ServerSettings, ServerSettingsLive } from "../src/ServerSettings.ts";

const defaultResolvedSettings = new HarnessSettings({
  codex: defaultHarnessSettings.codex,
  persona: defaultBernisePersona,
});

describe("mergeHarnessSettings", () => {
  it("trims Codex paths", () => {
    const next = mergeHarnessSettings(
      defaultHarnessSettings,
      new HarnessSettingsPatch({
        codex: { binaryPath: " /opt/bin/codex ", homePath: " ~/.codex " },
      }),
    );
    expect(next.codex.binaryPath).toBe("/opt/bin/codex");
    expect(next.codex.homePath).toBe("~/.codex");
    expect(next.codex.model).toBe("");
    expect(next.persona).toBe("");
  });

  it("trims and keeps a selected Codex model", () => {
    const next = mergeHarnessSettings(
      defaultHarnessSettings,
      new HarnessSettingsPatch({
        codex: { model: " gpt-5.4-mini " },
      }),
    );
    expect(next.codex.model).toBe("gpt-5.4-mini");
  });

  it("replaces persona markdown and resets on null", () => {
    const written = mergeHarnessSettings(
      defaultResolvedSettings,
      new HarnessSettingsPatch({ persona: "You are a test cat." }),
    );
    expect(written.persona).toBe("You are a test cat.");
    const reset = mergeHarnessSettings(written, new HarnessSettingsPatch({ persona: null }));
    expect(reset.persona).toBe("");
  });
});

describe("ServerSettingsLive", () => {
  it.effect("persists trimmed settings to disk", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "bernise-settings-"));
    return Effect.gen(function* () {
      const settings = yield* ServerSettings;
      expect(yield* settings.get).toEqual(defaultResolvedSettings);
      const next = yield* settings.update(
        new HarnessSettingsPatch({
          codex: { binaryPath: " /usr/local/bin/codex ", homePath: " ~/.codex " },
        }),
      );
      expect(next.codex.binaryPath).toBe("/usr/local/bin/codex");
      expect(next.codex.homePath).toBe("~/.codex");
      expect(next.persona).toBe(defaultBernisePersona);
      const written = JSON.parse(readFileSync(join(stateDir, "settings.json"), "utf8")) as {
        readonly codex: { readonly binaryPath: string };
        readonly persona?: string;
      };
      expect(written.codex.binaryPath).toBe("/usr/local/bin/codex");
      expect(written.persona).toBeUndefined();
    }).pipe(
      Effect.provide(ServerSettingsLive),
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromUnknown({ BERNISE_STATE_DIR: stateDir })),
      ),
    );
  });

  it.effect("decodes settings files that predate the model field", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "bernise-settings-legacy-"));
    writeFileSync(
      join(stateDir, "settings.json"),
      `${JSON.stringify({
        codex: { enabled: true, binaryPath: "/opt/codex", homePath: "~/.codex" },
      })}\n`,
    );
    return Effect.gen(function* () {
      const settings = yield* ServerSettings;
      const loaded = yield* settings.get;
      expect(loaded.codex.binaryPath).toBe("/opt/codex");
      expect(loaded.codex.homePath).toBe("~/.codex");
      expect(loaded.codex.model).toBe("");
      expect(loaded.persona).toBe(defaultBernisePersona);
    }).pipe(
      Effect.provide(ServerSettingsLive),
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromUnknown({ BERNISE_STATE_DIR: stateDir })),
      ),
    );
  });

  it.effect("persists persona markdown beside settings.json", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "bernise-persona-"));
    const personaPath = join(stateDir, "persona.md");
    return Effect.gen(function* () {
      const settings = yield* ServerSettings;
      const next = yield* settings.update(
        new HarnessSettingsPatch({ persona: "You are a test cat.\n" }),
      );
      expect(next.persona).toBe("You are a test cat.\n");
      expect(readFileSync(personaPath, "utf8")).toBe("You are a test cat.\n");
      const reset = yield* settings.update(new HarnessSettingsPatch({ persona: null }));
      expect(reset.persona).toBe(defaultBernisePersona);
      expect(existsSync(personaPath)).toBe(false);
    }).pipe(
      Effect.provide(ServerSettingsLive),
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromUnknown({ BERNISE_STATE_DIR: stateDir })),
      ),
    );
  });

  it.effect("loads an existing persona.md override", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "bernise-persona-load-"));
    writeFileSync(join(stateDir, "persona.md"), "Voice from disk.\n");
    return Effect.gen(function* () {
      const settings = yield* ServerSettings;
      expect((yield* settings.get).persona).toBe("Voice from disk.\n");
    }).pipe(
      Effect.provide(ServerSettingsLive),
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromUnknown({ BERNISE_STATE_DIR: stateDir })),
      ),
    );
  });

  it.effect("rejects an empty persona", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "bernise-persona-empty-"));
    return Effect.gen(function* () {
      const settings = yield* ServerSettings;
      const error = yield* settings
        .update(new HarnessSettingsPatch({ persona: "   " }))
        .pipe(Effect.flip);
      expect(error._tag).toBe("SettingsError");
      expect(error.message).toMatch(/empty/i);
      expect((yield* settings.get).persona).toBe(defaultBernisePersona);
    }).pipe(
      Effect.provide(ServerSettingsLive),
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromUnknown({ BERNISE_STATE_DIR: stateDir })),
      ),
    );
  });
});
