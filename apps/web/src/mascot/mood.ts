export type BerniseMood = "idle" | "listening" | "thinking" | "speaking";

export function deriveBerniseMood(input: {
  readonly composerFocused: boolean;
  readonly pending: boolean;
  readonly speaking?: boolean;
}): BerniseMood {
  if (input.speaking === true) {
    return "speaking";
  }
  if (input.pending) {
    return "thinking";
  }
  if (input.composerFocused) {
    return "listening";
  }
  return "idle";
}
