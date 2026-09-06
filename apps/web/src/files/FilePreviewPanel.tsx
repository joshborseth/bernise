import { Editor } from "@pierre/diffs/editor";
import { EditProvider, File, Virtualizer } from "@pierre/diffs/react";
import { useAtom, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import { LoaderCircleIcon, WrapTextIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatError } from "../chat.ts";
import { Button } from "~/components/ui/button";
import { syntaxThemeName } from "~/lib/fenceMeta";
import { cn } from "~/lib/utils";
import { workspaceFileAtom, workspaceFileEpochAtom, writeWorkspaceFileAtom } from "../workspace.ts";
import { FILE_SAVE_DEBOUNCE_MS, FileSaveCoordinator } from "./fileSaveCoordinator.ts";

const FILE_SURFACE_UNSAFE_CSS = `
  diffs-container {
    --diffs-bg: #1b1e28 !important;
    --diffs-light-bg: #1b1e28 !important;
    --diffs-dark-bg: #1b1e28 !important;
    background-color: #1b1e28 !important;
    color: #a6accd !important;
  }
`;

export function FilePreviewPanel({
  relativePath,
  onClose,
}: {
  readonly relativePath: string;
  readonly onClose: () => void;
}) {
  const file = useAtomValue(workspaceFileAtom(relativePath));
  const [epoch, setEpoch] = useAtom(workspaceFileEpochAtom(relativePath));
  const [wordWrap, setWordWrap] = useState(true);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  const basename = relativePath.slice(Math.max(0, relativePath.lastIndexOf("/") + 1));

  return (
    <section className="file-preview flex h-full min-h-0 flex-col" aria-label={relativePath}>
      <header className="flex flex-none items-center gap-2 border-b border-border bg-card px-3 py-2">
        <p className="m-0 min-w-0 flex-1 truncate font-mono text-[0.78rem] tracking-[0.01em]">
          <span className="text-muted-foreground">
            {relativePath === basename ? "" : relativePath}
          </span>
          {relativePath === basename ? (
            <span>{basename}</span>
          ) : (
            <span className="text-foreground">{basename}</span>
          )}
        </p>
        <p
          className={cn(
            "m-0 shrink-0 text-[0.68rem] tracking-[0.04em] uppercase",
            saveState === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Saved"}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-pressed={wordWrap}
          aria-label={wordWrap ? "Disable line wrap" : "Wrap lines"}
          onClick={() => {
            setWordWrap((value) => !value);
          }}
        >
          <WrapTextIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Close file"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </header>
      {saveError === undefined ? null : (
        <p className="m-0 flex-none px-3 py-1 text-[0.72rem] text-destructive" role="alert">
          {saveError}
        </p>
      )}
      {AsyncResult.isWaiting(file) || file._tag === "Initial" ? (
        <div className="grid flex-1 place-items-center text-muted-foreground">
          <LoaderCircleIcon className="size-5 animate-spin" />
        </div>
      ) : AsyncResult.isFailure(file) ? (
        <div className="grid flex-1 place-items-center gap-2 px-6 text-center">
          <p className="m-0 text-sm text-destructive">{formatError(file.cause)}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setEpoch(epoch + 1);
            }}
          >
            Retry
          </Button>
        </div>
      ) : file.value.truncated ? (
        <ReadOnlyFileSurface
          relativePath={relativePath}
          contents={file.value.contents}
          wordWrap={wordWrap}
          notice="This file is larger than 1MB, so only the start is shown and editing is off."
        />
      ) : (
        <EditableFileSurface
          key={relativePath}
          relativePath={relativePath}
          contents={file.value.contents}
          wordWrap={wordWrap}
          onSaveState={setSaveState}
          onSaveError={setSaveError}
        />
      )}
    </section>
  );
}

function ReadOnlyFileSurface({
  relativePath,
  contents,
  wordWrap,
  notice,
}: {
  readonly relativePath: string;
  readonly contents: string;
  readonly wordWrap: boolean;
  readonly notice: string;
}) {
  return (
    <>
      <p className="m-0 flex-none px-3 py-1 text-[0.72rem] text-muted-foreground">{notice}</p>
      <Virtualizer className="file-preview-virtualizer min-h-0 flex-1 overflow-auto">
        <File
          file={{
            name: relativePath,
            contents,
            cacheKey: `${relativePath}:${contents.length}`,
          }}
          options={{
            disableFileHeader: true,
            overflow: wordWrap ? "wrap" : "scroll",
            theme: syntaxThemeName,
            themeType: "dark",
            unsafeCSS: FILE_SURFACE_UNSAFE_CSS,
          }}
          className="min-h-full"
        />
      </Virtualizer>
    </>
  );
}

function EditableFileSurface({
  relativePath,
  contents,
  wordWrap,
  onSaveState,
  onSaveError,
}: {
  readonly relativePath: string;
  readonly contents: string;
  readonly wordWrap: boolean;
  readonly onSaveState: (state: "saved" | "saving" | "error") => void;
  readonly onSaveError: (message: string | undefined) => void;
}) {
  const [writeResult, writeFile] = useAtom(writeWorkspaceFileAtom);
  const saveWaiterRef = useRef<{
    resolve: () => void;
    reject: (error: unknown) => void;
  } | null>(null);

  useEffect(() => {
    const waiter = saveWaiterRef.current;
    if (waiter === null) {
      return;
    }
    if (AsyncResult.isSuccess(writeResult)) {
      waiter.resolve();
      saveWaiterRef.current = null;
      return;
    }
    if (AsyncResult.isFailure(writeResult)) {
      waiter.reject(writeResult.cause);
      saveWaiterRef.current = null;
    }
  }, [writeResult]);

  const persistFile = useCallback(
    (nextContents: string) => {
      return new Promise<void>((resolve, reject) => {
        // oxlint-disable-next-line react/refs -- assigned when the debounce timer fires
        saveWaiterRef.current = { resolve, reject };
        writeFile({ payload: { path: relativePath, contents: nextContents } });
      });
    },
    [relativePath, writeFile],
  );

  const coordinator = useMemo(
    () =>
      new FileSaveCoordinator({
        debounceMs: FILE_SAVE_DEBOUNCE_MS,
        persist: persistFile,
        onPendingChange: (pending) => {
          onSaveState(pending ? "saving" : "saved");
        },
        onConfirmed: () => {
          onSaveError(undefined);
          onSaveState("saved");
        },
        onFailed: (error) => {
          onSaveState("error");
          onSaveError(formatError(error));
        },
      }),
    [onSaveError, onSaveState, persistFile],
  );

  useEffect(
    () => () => {
      coordinator.dispose();
    },
    [coordinator],
  );

  const editor = useMemo(
    () =>
      new Editor({
        persistState: true,
        persistStateStorage: "inMemory",
        onChange: (file) => {
          coordinator.change(file.contents);
        },
      }),
    [coordinator],
  );

  useEffect(
    () => () => {
      editor.cleanUp();
    },
    [editor],
  );

  return (
    <EditProvider editor={editor}>
      <div className="flex min-h-0 flex-1">
        <Virtualizer className="file-preview-virtualizer min-h-0 flex-1 overflow-auto">
          <File
            file={{
              name: relativePath,
              contents,
              cacheKey: relativePath,
            }}
            options={{
              disableFileHeader: true,
              overflow: wordWrap ? "wrap" : "scroll",
              theme: syntaxThemeName,
              themeType: "dark",
              unsafeCSS: FILE_SURFACE_UNSAFE_CSS,
            }}
            className="min-h-full"
            contentEditable
          />
        </Virtualizer>
      </div>
    </EditProvider>
  );
}
