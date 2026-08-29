export const patchAside = "Patch is in the bubble.";

export type SpeakableOptions = {
  readonly skipCode: boolean;
};

export type SpeakableState = {
  readonly lineCarry: string;
  readonly inFence: boolean;
  readonly fenceHadContent: boolean;
  readonly pending: string;
};

export const emptySpeakable: SpeakableState = {
  lineCarry: "",
  inFence: false,
  fenceHadContent: false,
  pending: "",
};

export type SpeakableResult = {
  readonly state: SpeakableState;
  readonly sentences: ReadonlyArray<string>;
};

const ones = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
] as const;

const numberWord = (value: number): string => {
  if (value >= 0 && value < ones.length) {
    return ones[value] ?? String(value);
  }
  return String(value);
};

const isFenceLine = (line: string): boolean => line.trimStart().startsWith("```");

const isIndentedCode = (line: string): boolean => line.startsWith("    ") || line.startsWith("\t");

const rewriteProse = (text: string): string => {
  let value = text;
  value = value.replace(/\r\n/g, "\n");
  value = value.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1");
  value = value.replace(/\bhttps?:\/\/\S+/g, "");
  value = value.replace(
    /❓\s*\*\*Q(\d+)\*\*(?:\s*-\s*\*\*([^*]+)\*\*)?:?/g,
    (_match, rawNumber: string, title: string | undefined) => {
      const label = `Question ${numberWord(Number(rawNumber))}`;
      if (title !== undefined && title.trim().length > 0) {
        return `${label}. ${title.trim()}.`;
      }
      return `${label}.`;
    },
  );
  value = value.replace(/➡️/g, "I would go with");
  value = value.replace(/^#{1,6}\s+/gm, "");
  value = value.replace(/\*\*([^*]+)\*\*/g, "$1");
  value = value.replace(/__([^_]+)__/g, "$1");
  value = value.replace(/`([^`]+)`/g, "$1");
  value = value.replace(/\*([^*]+)\*/g, "$1");
  value = value.replace(/^\s*[-*]\s+/gm, "");
  value = value.replace(/^\s*\d+[.)]\s+/gm, "");
  value = value.replace(/^[-\s]*---[-\s]*$/gm, " ");
  value = value.replace(/\s+/g, " ");
  return value;
};

const takeSentences = (
  pending: string,
  flush: boolean,
): { readonly sentences: ReadonlyArray<string>; readonly rest: string } => {
  const rewritten = rewriteProse(pending);
  if (rewritten.trim().length === 0) {
    return { sentences: [], rest: flush ? "" : pending };
  }

  const sentences: Array<string> = [];
  const pattern = /[^.!?]*[.!?]+(?:["')\]]+)?/g;
  let cursor = 0;
  let match = pattern.exec(rewritten);
  while (match !== null) {
    const piece = match[0].trim();
    if (piece.length > 0) {
      sentences.push(piece);
    }
    cursor = match.index + match[0].length;
    match = pattern.exec(rewritten);
  }

  const restClean = rewritten.slice(cursor).trimStart();
  if (flush) {
    const leftover = restClean.trim();
    if (leftover.length > 0) {
      sentences.push(leftover);
    }
    return { sentences, rest: "" };
  }

  if (restClean.trim().length > 220) {
    sentences.push(restClean.trim());
    return { sentences, rest: "" };
  }

  return { sentences, rest: restClean };
};

const handleLine = (
  state: SpeakableState,
  line: string,
  skipCode: boolean,
): { readonly state: SpeakableState; readonly asides: ReadonlyArray<string> } => {
  if (isFenceLine(line)) {
    if (state.inFence) {
      const asides = skipCode && state.fenceHadContent ? [patchAside] : [];
      return {
        state: {
          ...state,
          inFence: false,
          fenceHadContent: false,
        },
        asides,
      };
    }
    return {
      state: {
        ...state,
        inFence: true,
        fenceHadContent: false,
      },
      asides: [],
    };
  }

  if (state.inFence) {
    const hadContent = state.fenceHadContent || line.trim().length > 0;
    if (skipCode) {
      return {
        state: { ...state, fenceHadContent: hadContent },
        asides: [],
      };
    }
    return {
      state: {
        ...state,
        fenceHadContent: hadContent,
        pending: `${state.pending}${line}`,
      },
      asides: [],
    };
  }

  if (skipCode && isIndentedCode(line) && line.trim().length > 0) {
    return { state, asides: [] };
  }

  return {
    state: { ...state, pending: `${state.pending}${line}` },
    asides: [],
  };
};

const emitPending = (
  state: SpeakableState,
  sentences: Array<string>,
  flush: boolean,
): SpeakableState => {
  const split = takeSentences(state.pending, flush);
  sentences.push(...split.sentences);
  return { ...state, pending: split.rest };
};

const consume = (
  state: SpeakableState,
  chunk: string,
  options: SpeakableOptions,
  flush: boolean,
): SpeakableResult => {
  const combined = `${state.lineCarry}${chunk}`;
  const parts = combined.split("\n");
  const complete = flush ? parts : parts.slice(0, -1);
  const lineCarry = flush ? "" : (parts[parts.length - 1] ?? "");

  const sentences: Array<string> = [];
  let next: SpeakableState = { ...state, lineCarry: "" };
  for (const part of complete) {
    const handled = handleLine(next, `${part}\n`, options.skipCode);
    next = handled.state;
    next = emitPending(next, sentences, false);
    sentences.push(...handled.asides);
  }

  const holdFence = isFenceLine(lineCarry);
  const holdIndent = options.skipCode && isIndentedCode(lineCarry);
  if (!next.inFence && !holdFence && !holdIndent && lineCarry.length > 0) {
    next = { ...next, pending: `${next.pending}${lineCarry}` };
  }

  next = emitPending(next, sentences, flush);
  return {
    state: {
      ...next,
      lineCarry: next.inFence || holdFence || holdIndent ? lineCarry : "",
    },
    sentences,
  };
};

export const pushSpeakable = (
  state: SpeakableState,
  chunk: string,
  options: SpeakableOptions,
): SpeakableResult => consume(state, chunk, options, false);

export const flushSpeakable = (state: SpeakableState, options: SpeakableOptions): SpeakableResult =>
  consume(state, "", options, true);
