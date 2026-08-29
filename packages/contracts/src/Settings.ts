import { Schema } from "effect";

export const ProviderKind = Schema.Literal("codex");
export type ProviderKind = typeof ProviderKind.Type;

export const ProviderStatus = Schema.Literals(["ready", "error", "warning"]);
export type ProviderStatus = typeof ProviderStatus.Type;

export const ProviderAuthStatus = Schema.Literals(["authenticated", "unauthenticated", "unknown"]);
export type ProviderAuthStatus = typeof ProviderAuthStatus.Type;

export class CodexSettings extends Schema.Class<CodexSettings>("CodexSettings")({
  enabled: Schema.Boolean,
  binaryPath: Schema.String,
  homePath: Schema.String,
}) {}

export class HarnessSettings extends Schema.Class<HarnessSettings>("HarnessSettings")({
  codex: CodexSettings,
}) {}

export class CodexSettingsPatch extends Schema.Class<CodexSettingsPatch>("CodexSettingsPatch")({
  enabled: Schema.optionalKey(Schema.Boolean),
  binaryPath: Schema.optionalKey(Schema.String),
  homePath: Schema.optionalKey(Schema.String),
}) {}

export class HarnessSettingsPatch extends Schema.Class<HarnessSettingsPatch>(
  "HarnessSettingsPatch",
)({
  codex: Schema.optionalKey(CodexSettingsPatch),
}) {}

export class SettingsError extends Schema.TaggedError<SettingsError>()("SettingsError", {
  message: Schema.String,
}) {}

export class ProviderSnapshot extends Schema.Class<ProviderSnapshot>("ProviderSnapshot")({
  kind: ProviderKind,
  enabled: Schema.Boolean,
  installed: Schema.Boolean,
  version: Schema.NullOr(Schema.String),
  status: ProviderStatus,
  auth: ProviderAuthStatus,
  message: Schema.String,
  checkedAt: Schema.String,
}) {}

export class ProviderSnapshots extends Schema.Class<ProviderSnapshots>("ProviderSnapshots")({
  codex: ProviderSnapshot,
}) {}

export const defaultCodexSettings = new CodexSettings({
  enabled: true,
  binaryPath: "",
  homePath: "",
});

export const defaultHarnessSettings = new HarnessSettings({
  codex: defaultCodexSettings,
});

const trimPath = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return value.trim();
};

export const mergeHarnessSettings = (
  current: HarnessSettings,
  patch: HarnessSettingsPatch,
): HarnessSettings =>
  new HarnessSettings({
    codex: new CodexSettings({
      enabled: patch.codex?.enabled ?? current.codex.enabled,
      binaryPath: trimPath(patch.codex?.binaryPath) ?? current.codex.binaryPath,
      homePath: trimPath(patch.codex?.homePath) ?? current.codex.homePath,
    }),
  });
