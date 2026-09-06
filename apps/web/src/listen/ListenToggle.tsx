import { MicIcon, MicOffIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import type { ListenStatus } from "./useListen.ts";

export function ListenToggle({
  status,
  addressed,
  onToggle,
}: {
  readonly status: ListenStatus;
  readonly addressed: boolean;
  readonly onToggle: () => void;
}) {
  const listening = status === "on";
  const mutedLook = status === "off" || status === "denied";
  const label =
    status === "denied"
      ? "Mic blocked"
      : status === "starting"
        ? "Starting…"
        : listening
          ? addressed
            ? "On you"
            : "Listening"
          : "Muted";
  const Icon = mutedLook ? MicOffIcon : MicIcon;
  return (
    <Button
      type="button"
      variant={listening ? "default" : "outline"}
      size="sm"
      className="rounded-full"
      aria-pressed={listening}
      aria-label={listening ? "Mute Bernise listen" : "Unmute Bernise listen"}
      onClick={onToggle}
    >
      <Icon data-icon="inline-start" />
      {label}
    </Button>
  );
}
