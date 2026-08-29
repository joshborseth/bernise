import {
  CodexSettingsPatch,
  defaultHarnessSettings,
  ModelCatalog,
  ProviderSnapshot,
  ProviderSnapshots,
} from "@bernise/contracts";
import { Cause, Effect } from "effect";
import { Atom, AsyncResult } from "effect/unstable/reactivity";
import { BerniseRpc } from "./rpc.ts";

const emptySnapshots = new ProviderSnapshots({
  codex: new ProviderSnapshot({
    kind: "codex",
    enabled: true,
    installed: false,
    version: null,
    status: "warning",
    auth: "unknown",
    message: "Codex provider status has not been checked in this session yet.",
    checkedAt: "",
  }),
});

export const emptyModelCatalog = new ModelCatalog({ models: [] });

export const settingsAtom = Atom.make(defaultHarnessSettings).pipe(Atom.keepAlive);
export const snapshotsAtom = Atom.make(emptySnapshots).pipe(Atom.keepAlive);
export const settingsBusyAtom = Atom.make(false);
export const modelsEpochAtom = Atom.make(0).pipe(Atom.keepAlive);

const modelsByEpochAtom = Atom.family((_epoch: number) =>
  BerniseRpc.runtime.atom((_get) =>
    Effect.gen(function* () {
      const client = yield* BerniseRpc;
      return yield* client("ListModels", undefined);
    }),
  ),
);

export const modelsResultAtom = Atom.make((get) => get(modelsByEpochAtom(get(modelsEpochAtom))));

export type ComposerModelOption = {
  readonly id: string;
  readonly label: string;
};

export type ComposerModelView =
  | {
      readonly kind: "select";
      readonly options: ReadonlyArray<ComposerModelOption>;
      readonly value: string;
    }
  | { readonly kind: "error"; readonly error: unknown }
  | { readonly kind: "pending" };

export const catalogDefaultModelId = (catalog: ModelCatalog): string | undefined => {
  const preferred = catalog.models.find((model) => model.isDefault) ?? catalog.models[0];
  return preferred?.id;
};

export const composerModelOptions = (
  catalog: ModelCatalog,
  selected: string,
): ReadonlyArray<ComposerModelOption> => {
  const options: Array<ComposerModelOption> = [];
  const seen = new Set<string>();
  for (const model of catalog.models) {
    if (seen.has(model.id)) {
      continue;
    }
    seen.add(model.id);
    options.push({ id: model.id, label: model.displayName });
  }
  if (selected.length > 0 && !seen.has(selected)) {
    options.push({ id: selected, label: selected });
  }
  return options;
};

export const composerModelView = (
  result: AsyncResult.AsyncResult<ModelCatalog, unknown>,
  selected: string,
): ComposerModelView => {
  if (AsyncResult.isSuccess(result)) {
    const options = composerModelOptions(result.value, selected);
    const value = selected.length > 0 ? selected : (catalogDefaultModelId(result.value) ?? "");
    if (options.length === 0 || value.length === 0) {
      return { kind: "error", error: new Error("Codex did not return any models.") };
    }
    return { kind: "select", options, value };
  }
  if (AsyncResult.isFailure(result)) {
    if (!Cause.hasInterruptsOnly(result.cause)) {
      return { kind: "error", error: Cause.squash(result.cause) };
    }
  }
  if (selected.length > 0) {
    return { kind: "select", options: [{ id: selected, label: selected }], value: selected };
  }
  return { kind: "pending" };
};

export const bootSettingsAtom = BerniseRpc.runtime
  .atom((get) =>
    Effect.gen(function* () {
      const client = yield* BerniseRpc;
      const settings = yield* client("GetSettings", undefined);
      get.set(settingsAtom, settings);
      const snapshots = yield* client("GetProviderSnapshots", undefined);
      get.set(snapshotsAtom, snapshots);
    }),
  )
  .pipe(Atom.keepAlive);

export const refreshProvidersAtom = BerniseRpc.runtime.fn((_: void, get) =>
  Effect.gen(function* () {
    get.set(settingsBusyAtom, true);
    const client = yield* BerniseRpc;
    const snapshots = yield* client("RefreshProviders", undefined);
    get.set(snapshotsAtom, snapshots);
    get.set(modelsEpochAtom, get.registry.get(modelsEpochAtom) + 1);
  }).pipe(Effect.ensuring(Effect.sync(() => get.set(settingsBusyAtom, false)))),
);

export type SettingsPatch = {
  readonly codex?: CodexSettingsPatch;
};

export const updateSettingsAtom = BerniseRpc.runtime.fn((patch: SettingsPatch, get) =>
  Effect.gen(function* () {
    const client = yield* BerniseRpc;
    const next = yield* client("UpdateSettings", patch);
    get.set(settingsAtom, next);
    return next;
  }),
);
