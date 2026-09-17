export const mascotActionIds = ["sleep", "wake", "litter", "bite", "hiss"] as const;

export type MascotActionId = (typeof mascotActionIds)[number];

export type MascotPlayState = {
  readonly sleeping: boolean;
  readonly usingLitter: boolean;
  readonly purring: boolean;
  readonly biting: boolean;
  readonly hissing: boolean;
};

export type MascotActionItem = {
  readonly id: MascotActionId;
  readonly label: string;
};

export const mascotActions: ReadonlyArray<MascotActionItem> = [
  { id: "sleep", label: "Sleep" },
  { id: "wake", label: "Wake" },
  { id: "litter", label: "Litter box" },
  { id: "bite", label: "Bite" },
  { id: "hiss", label: "Hiss" },
];

const idlePlayState: MascotPlayState = {
  sleeping: false,
  usingLitter: false,
  purring: false,
  biting: false,
  hissing: false,
};

const actionListeners = new Set<(id: MascotActionId) => void>();

export function parseMascotAction(value: unknown): MascotActionId | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return mascotActionIds.find((id) => id === value);
}

export function playMascotAction(value: unknown): void {
  const id = parseMascotAction(value);
  if (id === undefined) {
    return;
  }
  for (const listener of actionListeners) {
    listener(id);
  }
}

export function subscribeMascotAction(listener: (id: MascotActionId) => void): () => void {
  actionListeners.add(listener);
  return () => {
    actionListeners.delete(listener);
  };
}

export function applyMascotAction(state: MascotPlayState, action: MascotActionId): MascotPlayState {
  switch (action) {
    case "sleep":
      return { ...idlePlayState, sleeping: true };
    case "wake":
      return idlePlayState;
    case "litter":
      return { ...idlePlayState, usingLitter: true };
    case "bite":
      return { ...idlePlayState, biting: true };
    case "hiss":
      return { ...idlePlayState, hissing: true };
  }
}

export function isMascotActionEnabled(state: MascotPlayState, action: MascotActionId): boolean {
  switch (action) {
    case "sleep":
      return !state.sleeping;
    case "wake":
      return state.sleeping || state.usingLitter || state.biting || state.hissing || state.purring;
    case "litter":
      return !state.usingLitter;
    case "bite":
      return !state.biting;
    case "hiss":
      return !state.hissing;
  }
}
