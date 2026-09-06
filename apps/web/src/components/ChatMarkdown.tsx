import { CheckIcon, CopyIcon, WrapTextIcon } from "lucide-react";
import {
  Suspense,
  createContext,
  use,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Markdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { PierreEntryIcon } from "./chat/PierreEntryIcon.tsx";
import { Button } from "~/components/ui/button";
import {
  extractCodeMeta,
  extractFenceLanguage,
  extractFenceTitle,
  isMermaidLanguage,
  syntheticFileNameForLanguage,
} from "~/lib/fenceMeta";
import { resolveWorkspaceFileLink } from "~/lib/markdownLinks";
import { getMermaidSvgPromise } from "~/lib/mermaid";
import { highlightCodeToHtml } from "~/lib/syntaxHighlighting";
import { cn } from "~/lib/utils";

type ChatMarkdownContextValue = {
  readonly workspaceRoot: string;
  readonly onOpenFile: (relativePath: string) => void;
};

const ChatMarkdownContext = createContext<ChatMarkdownContextValue>({
  workspaceRoot: "",
  onOpenFile: () => undefined,
});

export function ChatMarkdown({
  text,
  workspaceRoot,
  onOpenFile,
  className,
}: {
  readonly text: string;
  readonly workspaceRoot: string;
  readonly onOpenFile: (relativePath: string) => void;
  readonly className?: string;
}) {
  const context = useMemo(() => ({ workspaceRoot, onOpenFile }), [onOpenFile, workspaceRoot]);
  return (
    <ChatMarkdownContext.Provider value={context}>
      <div className={cn("chat-markdown", className)}>
        <Markdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          rehypePlugins={[rehypeRaw, rehypeSanitize]}
          components={markdownComponents}
        >
          {text}
        </Markdown>
      </div>
    </ChatMarkdownContext.Provider>
  );
}

function MarkdownPre({ children }: { readonly children?: ReactNode }) {
  return <>{children}</>;
}

function MarkdownCode({
  className,
  children,
  node,
}: {
  readonly className?: string | undefined;
  readonly children?: ReactNode;
  readonly node?: unknown;
}) {
  const { workspaceRoot, onOpenFile } = useContext(ChatMarkdownContext);
  const code = nodeToPlainText(children).replace(/\n$/, "");
  const language = extractFenceLanguage(className);
  const isBlock = Boolean(className?.includes("language-")) || code.includes("\n");
  if (!isBlock) {
    const fileLink = resolveWorkspaceFileLink(code.trim(), workspaceRoot);
    if (fileLink) {
      return (
        <FileChip
          relativePath={fileLink.relativePath}
          basename={fileLink.basename}
          onOpenFile={onOpenFile}
        />
      );
    }
    return <code className="chat-markdown-inline-code">{code}</code>;
  }
  if (isMermaidLanguage(language)) {
    return <MermaidBlock code={code} />;
  }
  const fenceTitle = extractFenceTitle(extractCodeMeta(node));
  return (
    <MarkdownCodeBlock code={code} language={language} fenceTitle={fenceTitle}>
      <Suspense
        fallback={
          <pre className="chat-markdown-shiki-fallback">
            <code>{code}</code>
          </pre>
        }
      >
        <ShikiCodeBlock code={code} language={language} />
      </Suspense>
    </MarkdownCodeBlock>
  );
}

function MarkdownAnchor({
  href,
  children,
}: {
  readonly href?: string | undefined;
  readonly children?: ReactNode;
}) {
  const { workspaceRoot, onOpenFile } = useContext(ChatMarkdownContext);
  const fileLink = resolveWorkspaceFileLink(href, workspaceRoot);
  if (fileLink) {
    return (
      <FileChip
        relativePath={fileLink.relativePath}
        basename={fileLink.basename}
        onOpenFile={onOpenFile}
      />
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

const markdownComponents: Components = {
  pre: MarkdownPre,
  code: MarkdownCode,
  a: MarkdownAnchor,
};

function FileChip({
  relativePath,
  basename,
  onOpenFile,
}: {
  readonly relativePath: string;
  readonly basename: string;
  readonly onOpenFile: (relativePath: string) => void;
}) {
  return (
    <button
      type="button"
      className="chat-markdown-file-chip"
      onClick={() => {
        onOpenFile(relativePath);
      }}
    >
      <PierreEntryIcon pathValue={relativePath} kind="file" className="size-3.5" />
      <span>{basename}</span>
    </button>
  );
}

function MarkdownCodeBlock({
  code,
  language,
  fenceTitle,
  children,
}: {
  readonly code: string;
  readonly language: string;
  readonly fenceTitle: string | null;
  readonly children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const [wrapped, setWrapped] = useState(true);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const title = fenceTitle ?? language;
  const iconPath = fenceTitle ?? syntheticFileNameForLanguage(language);

  const handleCopy = useCallback(() => {
    if (typeof navigator === "undefined" || navigator.clipboard == null) {
      return;
    }
    void navigator.clipboard.writeText(code).then(() => {
      if (copiedTimerRef.current != null) {
        clearTimeout(copiedTimerRef.current);
      }
      setCopied(true);
      copiedTimerRef.current = setTimeout(() => {
        setCopied(false);
        copiedTimerRef.current = null;
      }, 1200);
    });
  }, [code]);

  useEffect(
    () => () => {
      if (copiedTimerRef.current != null) {
        clearTimeout(copiedTimerRef.current);
      }
    },
    [],
  );

  return (
    <div
      className="chat-markdown-codeblock"
      data-language={language}
      data-wrap={wrapped ? "true" : "false"}
    >
      <div className="chat-markdown-codeblock-header">
        <span className="chat-markdown-codeblock-title">
          <PierreEntryIcon pathValue={iconPath} kind="file" />
          <span className="truncate">{title}</span>
        </span>
        <span className="flex items-center gap-0.5" role="toolbar" aria-label="Code block actions">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-pressed={wrapped}
            aria-label={wrapped ? "Disable line wrap" : "Wrap lines"}
            onClick={() => {
              setWrapped((value) => !value);
            }}
          >
            <WrapTextIcon className="size-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={copied ? "Copied" : "Copy code"}
            onClick={handleCopy}
          >
            {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
          </Button>
        </span>
      </div>
      {children}
    </div>
  );
}

function ShikiCodeBlock({ code, language }: { readonly code: string; readonly language: string }) {
  const html = use(highlightCodeToHtml(code, language));
  return <div className="chat-markdown-shiki" dangerouslySetInnerHTML={{ __html: html }} />;
}

function MermaidBlock({ code }: { readonly code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getMermaidSvgPromise(code).then(
      (next) => {
        if (!cancelled) {
          setSvg(next);
        }
      },
      () => {
        if (!cancelled) {
          setFailed(true);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (failed) {
    return (
      <MarkdownCodeBlock code={code} language="mermaid" fenceTitle={null}>
        <pre className="chat-markdown-shiki-fallback">
          <code>{code}</code>
        </pre>
      </MarkdownCodeBlock>
    );
  }
  if (svg === null) {
    return <div className="chat-markdown-mermaid-pending" aria-hidden />;
  }
  return (
    <div
      className="chat-markdown-mermaid"
      aria-label="Mermaid diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

const nodeToPlainText = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(nodeToPlainText).join("");
  }
  return "";
};
