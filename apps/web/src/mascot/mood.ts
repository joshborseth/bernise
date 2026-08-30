export type BerniseMood = "idle" | "listening" | "thinking" | "speaking";

export function deriveBerniseMood(input: {
  readonly composerFocused: boolean;
  readonly pending: boolean;
  readonly voicing: boolean;
}): BerniseMood {
  if (input.pending) {
    return "thinking";
  }
  if (input.voicing) {
    return "speaking";
  }
  if (input.composerFocused) {
    return "listening";
  }
  return "idle";
}
