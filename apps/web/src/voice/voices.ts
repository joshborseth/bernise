export const berniseVoices = [
  { id: "af_sky", label: "Sky" },
  { id: "af_kore", label: "Kore" },
  { id: "af_heart", label: "Heart" },
  { id: "af_bella", label: "Bella" },
  { id: "af_nicole", label: "Nicole" },
  { id: "af_sarah", label: "Sarah" },
  { id: "bf_emma", label: "Emma" },
] as const;

export type BerniseVoiceId = (typeof berniseVoices)[number]["id"];

export const isBerniseVoiceId = (value: string): value is BerniseVoiceId =>
  berniseVoices.some((voice) => voice.id === value);
