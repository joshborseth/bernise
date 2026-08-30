export type WavFormat = {
  readonly sampleRate: number;
  readonly channels: number;
  readonly bitsPerSample: number;
  readonly dataOffset: number;
};

const textAt = (bytes: Uint8Array, offset: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));

const u32 = (bytes: Uint8Array, offset: number): number => {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
  return view.getUint32(0, true);
};

const u16 = (bytes: Uint8Array, offset: number): number => {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 2);
  return view.getUint16(0, true);
};

/** Parse a PCM WAV header, including streamed files whose chunk sizes are 0xFFFFFFFF. */
export const tryParseWavHeader = (bytes: Uint8Array): WavFormat | undefined => {
  if (bytes.byteLength < 12) {
    return undefined;
  }
  if (textAt(bytes, 0, 4) !== "RIFF" || textAt(bytes, 8, 4) !== "WAVE") {
    return undefined;
  }

  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;

  while (offset + 8 <= bytes.byteLength) {
    const id = textAt(bytes, offset, 4);
    const size = u32(bytes, offset + 4);
    const body = offset + 8;
    if (id === "fmt " && body + 16 <= bytes.byteLength) {
      channels = u16(bytes, body + 2);
      sampleRate = u32(bytes, body + 4);
      bitsPerSample = u16(bytes, body + 14);
    }
    if (id === "data") {
      if (sampleRate <= 0 || channels <= 0 || bitsPerSample <= 0) {
        return undefined;
      }
      return { sampleRate, channels, bitsPerSample, dataOffset: body };
    }
    if (size === 0xffffffff) {
      return undefined;
    }
    offset = body + size + (size % 2);
  }

  return undefined;
};

export const pcmS16leToF32 = (bytes: Uint8Array): Float32Array => {
  const samples = Math.floor(bytes.byteLength / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, samples * 2);
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
};

export const concatBytes = (left: Uint8Array, right: Uint8Array): Uint8Array<ArrayBuffer> => {
  const next = new Uint8Array(left.byteLength + right.byteLength);
  next.set(left, 0);
  next.set(right, left.byteLength);
  return next;
};

export const encodePcmWav = (
  pcm: Int16Array,
  options?: { readonly sampleRate?: number; readonly streaming?: boolean },
): Uint8Array<ArrayBuffer> => {
  const sampleRate = options?.sampleRate ?? 24000;
  const streaming = options?.streaming ?? true;
  const dataBytes = pcm.byteLength;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const riffSize = streaming ? 0xffffffff : 36 + dataBytes;
  const dataSize = streaming ? 0xffffffff : dataBytes;

  bytes.set([82, 73, 70, 70], 0);
  view.setUint32(4, riffSize, true);
  bytes.set([87, 65, 86, 69, 102, 109, 116, 32], 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  bytes.set([100, 97, 116, 97], 36);
  view.setUint32(40, dataSize, true);
  bytes.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 44);
  return bytes;
};
