import { Schema } from "effect";

export const ProviderKind = Schema.Literals(["cursor", "codex"]);
export type ProviderKind = typeof ProviderKind.Type;

export const ProviderStatus = Schema.Literals(["ready", "error", "warning"]);
export type ProviderStatus = typeof ProviderStatus.Type;

export const ProviderAuthStatus = Schema.Literals(["authenticated", "unauthenticated", "unknown"]);
export type ProviderAuthStatus = typeof ProviderAuthStatus.Type;

export class CursorSettings extends Schema.Class<CursorSettings>("CursorSettings")({
  enabled: Schema.Boolean,
  binaryPath: Schema.String,
}) {}

export class CodexSettings extends Schema.Class<CodexSettings>("CodexSettings")({
  enabled: Schema.Boolean,
  binaryPath: Schema.String,
  homePath: Schema.String,
}) {}

export class HarnessSettings extends Schema.Class<HarnessSettings>("HarnessSettings")({
  activeProvider: ProviderKind,
  cursor: CursorSettings,
  codex: CodexSettings,
}) {}

export class CursorSettingsPatch extends Schema.Class<CursorSettingsPatch>("CursorSettingsPatch")({
  enabled: Schema.optionalKey(Schema.Boolean),
  binaryPath: Schema.optionalKey(Schema.String),
}) {}

export class CodexSettingsPatch extends Schema.Class<CodexSettingsPatch>("CodexSettingsPatch")({
  enabled: Schema.optionalKey(Schema.Boolean),
  binaryPath: Schema.optionalKey(Schema.String),
  homePath: Schema.optionalKey(Schema.String),
}) {}

export class HarnessSettingsPatch extends Schema.Class<HarnessSettingsPatch>(
  "HarnessSettingsPatch",
)({
  activeProvider: Schema.optionalKey(ProviderKind),
  cursor: Schema.optionalKey(CursorSettingsPatch),
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
  cursor: ProviderSnapshot,
  codex: ProviderSnapshot,
}) {}

export const defaultCursorSettings = new CursorSettings({
  enabled: true,
  binaryPath: "",
});

export const defaultCodexSettings = new CodexSettings({
  enabled: true,
  binaryPath: "",
  homePath: "",
});

export const defaultHarnessSettings = new HarnessSettings({
  activeProvider: "cursor",
  cursor: defaultCursorSettings,
  codex: defaultCodexSettings,
});

export const providerDisplayName = (kind: ProviderKind): string =>
  kind === "codex" ? "Codex" : "Cursor";

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
    activeProvider: patch.activeProvider ?? current.activeProvider,
    cursor: new CursorSettings({
      enabled: patch.cursor?.enabled ?? current.cursor.enabled,
      binaryPath: trimPath(patch.cursor?.binaryPath) ?? current.cursor.binaryPath,
    }),
    codex: new CodexSettings({
      enabled: patch.codex?.enabled ?? current.codex.enabled,
      binaryPath: trimPath(patch.codex?.binaryPath) ?? current.codex.binaryPath,
      homePath: trimPath(patch.codex?.homePath) ?? current.codex.homePath,
    }),
  });
