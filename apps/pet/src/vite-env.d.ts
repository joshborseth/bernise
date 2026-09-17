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
    readonly pushShellJson: (json: string) => string;
    readonly pushShellBase64: (base64: string) => string;
    readonly summarizeJson: (json: string) => string;
    readonly summarizeBase64: (base64: string) => string;
    readonly resetAttention: () => void;
    readonly hitTest: (clientX: number, clientY: number) => boolean;
    readonly setPointer: (x: number, y: number) => void;
    readonly requestAction: (action: string) => void;
  };
}
