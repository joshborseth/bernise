import { defaultHarnessSettings, HarnessSettings, ProviderSnapshots } from "@bernise/contracts";
import { ConfigProvider, Effect, Layer, Stream } from "effect";
import { CodexProviderLive } from "../src/CodexProviderLive.ts";
import { pendingSnapshot } from "../src/ProviderHealth.ts";
import { serverSettingsMemory } from "../src/ServerSettings.ts";
import { ttsStub } from "../src/Tts.ts";

export const testConfig = (env: Record<string, string>) =>
  ConfigProvider.layer(ConfigProvider.fromUnknown(env));

export const codexDriverLayer = (
  bin: string,
  workspace: string,
  settings: HarnessSettings = defaultHarnessSettings,
) =>
  CodexProviderLive.pipe(
    Layer.provide(serverSettingsMemory(settings)),
    Layer.provide(testConfig({ BERNISE_CODEX_BIN: bin, BERNISE_WORKSPACE: workspace })),
  );

export const pendingSnapshots = () =>
  new ProviderSnapshots({
    codex: pendingSnapshot(true, "pending"),
  });

export const silentWav = new Uint8Array([
  82, 73, 70, 70, 36, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32, 16, 0, 0, 0, 1, 0, 1, 0, 68, 172,
  0, 0, 136, 88, 1, 0, 2, 0, 16, 0, 100, 97, 116, 97, 0, 0, 0, 0,
]);

export const ttsMemory = ttsStub(() => Effect.succeed({ stream: Stream.make(silentWav) }));
