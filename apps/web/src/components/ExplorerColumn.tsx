import { SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";
import { WorkspaceExplorer } from "./WorkspaceExplorer.tsx";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";

export function ExplorerColumn({
  onOpenPersona,
  footerExtra,
}: {
  readonly onOpenPersona: () => void;
  readonly footerExtra?: ReactNode;
}) {
  return (
    <aside
      className="explorer-pane flex h-full min-h-0 min-w-0 flex-col overflow-hidden text-sidebar-foreground"
      aria-label="Workspace"
    >
      <WorkspaceExplorer />
      <SidebarFooter className="border-t border-sidebar-border/80">
        <div className="flex items-end gap-2">
          <SidebarMenu className="min-w-0 flex-1">
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onOpenPersona} tooltip="Bernise Persona">
                <SettingsIcon />
                <span>Bernise Persona</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {footerExtra}
        </div>
      </SidebarFooter>
    </aside>
  );
}
