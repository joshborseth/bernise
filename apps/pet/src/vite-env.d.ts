/// <reference types="vite/client" />

type BerniseNativeHandler = {
  readonly postMessage: (message: unknown) => void;
};

interface Window {
  webkit?: {
    readonly messageHandlers?: {
      readonly bernise?: BerniseNativeHandler;
    };
  };
  __bernise?: {
    readonly setHostState: (partial: import("./host.ts").HostStatePatch) => void;
    readonly playAction: (value: unknown) => void;
    readonly setPointer: (pointer: {
      readonly clientX: number;
      readonly clientY: number;
      readonly viewWidth?: number;
      readonly viewHeight?: number;
    }) => void;
    readonly pushShellJson: (json: string) => string;
    readonly pushShellBase64: (base64: string) => string;
    readonly pushShellStreamJson: (json: string) => string;
    readonly pushShellStreamBase64: (base64: string) => string;
    readonly summarizeJson: (json: string) => string;
    readonly summarizeBase64: (base64: string) => string;
    readonly resetAttention: () => void;
    readonly hitTest: (clientX: number, clientY: number) => boolean;
    readonly requestAction: (action: string) => void;
  };
}
