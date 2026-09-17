let shared: AudioContext | undefined;

export function audioContext(): AudioContext {
  shared ??= new AudioContext();
  return shared;
}
