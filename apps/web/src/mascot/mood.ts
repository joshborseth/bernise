export type BerniseMood = "idle" | "listening" | "thinking" | "speaking";

export function deriveBerniseMood(input: {
  readonly composerFocused: boolean;
  readonly lastFrom: "bernise" | "user";
}): Exclude<BerniseMood, "speaking"> {
  if (input.composerFocused) {
    return "listening";
  }
  if (input.lastFrom === "user") {
    return "thinking";
  }
  return "idle";
}
