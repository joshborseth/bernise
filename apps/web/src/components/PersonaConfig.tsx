import { useAtom, useAtomValue } from "@effect/atom-react";
import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { useEffect, useRef, useState } from "react";
import { formatError } from "../chat.ts";
import { resolvePersona } from "../persona.ts";
import { settingsAtom, updateSettingsAtom } from "../settings.ts";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Textarea } from "~/components/ui/textarea";

export function PersonaConfig({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const settings = useAtomValue(settingsAtom);
  const persona = resolvePersona(settings.persona);
  return <PersonaEditor open={open} onOpenChange={onOpenChange} persona={persona} />;
}

function PersonaEditor({
  open,
  onOpenChange,
  persona,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly persona: string;
}) {
  const [updateResult, updateSettings] = useAtom(updateSettingsAtom);
  const [draft, setDraft] = useState(persona);
  const closeAfterSaveRef = useRef(false);
  useEffect(() => {
    setDraft(persona);
  }, [persona]);
  useEffect(() => {
    if (!open) {
      closeAfterSaveRef.current = false;
      return;
    }
    if (!closeAfterSaveRef.current) {
      return;
    }
    if (AsyncResult.isSuccess(updateResult)) {
      closeAfterSaveRef.current = false;
      onOpenChange(false);
      return;
    }
    if (
      AsyncResult.isFailure(updateResult) &&
      !Cause.hasInterruptsOnly(updateResult.cause)
    ) {
      closeAfterSaveRef.current = false;
    }
  }, [open, onOpenChange, updateResult]);
  const saving = AsyncResult.isWaiting(updateResult);
  const dirty = draft !== persona;
  const canSave = dirty && draft.trim().length > 0 && !saving;
  const saveError =
    AsyncResult.isFailure(updateResult) && !Cause.hasInterruptsOnly(updateResult.cause)
      ? formatError(Cause.squash(updateResult.cause))
      : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="persona-modal flex max-h-[min(90dvh,42rem)] w-full max-w-2xl flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Bernise Persona</DialogTitle>
        </DialogHeader>
        <Textarea
          value={draft}
          spellCheck={false}
          aria-label="Bernise persona"
          disabled={saving}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          className="field-sizing-fixed min-h-80 flex-1 resize-none rounded-md font-mono text-sm leading-relaxed"
        />
        {saveError !== undefined ? (
          <p className="m-0 text-sm leading-relaxed text-destructive" role="alert">
            {saveError}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => {
              updateSettings({ persona: null });
            }}
          >
            Restore default
          </Button>
          <Button
            type="button"
            disabled={!canSave}
            onClick={() => {
              closeAfterSaveRef.current = true;
              updateSettings({ persona: draft });
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
