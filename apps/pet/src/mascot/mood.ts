export type BerniseMood = "idle" | "listening" | "thinking" | "speaking";

export function deriveBerniseMood(input: {
  readonly composerFocused: boolean;
  readonly pending: boolean;
  readonly voicing: boolean;
  readonly speechActive?: boolean;
  readonly addressed?: boolean;
}): BerniseMood {
  if (input.pending) {
    return "thinking";
  }
  if (input.voicing) {
    return "speaking";
  }
  if (input.composerFocused || input.speechActive === true || input.addressed === true) {
    return "listening";
  }
  return "idle";
}
