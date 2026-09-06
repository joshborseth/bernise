import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Kbd } from "~/components/ui/kbd";
import { listedAppHotkeys } from "../hotkeys.ts";

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const listed = listedAppHotkeys();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-3 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>What each hotkey does.</DialogDescription>
        </DialogHeader>
        <ul className="m-0 grid list-none gap-1 p-0">
          {listed.map((item) => (
            <li key={item.label} className="flex items-center justify-between gap-4 py-1">
              <span className="text-sm">{item.label}</span>
              <Kbd>{item.keys}</Kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
