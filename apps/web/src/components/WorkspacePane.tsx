import { SettingsIcon } from "lucide-react";
import { type ReactNode } from "react";
import { WorkspaceExplorer } from "./WorkspaceExplorer.tsx";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";

export function WorkspacePane({
  onOpenPersona,
  onOpenProject,
  projectSwitchDisabled,
  footerExtra,
}: {
  readonly onOpenPersona: () => void;
  readonly onOpenProject?: (() => void) | undefined;
  readonly projectSwitchDisabled?: boolean | undefined;
  readonly footerExtra?: ReactNode;
}) {
  return (
    <aside
      className="workspace-pane flex h-full min-h-0 min-w-0 flex-col text-sidebar-foreground"
      aria-label="Workspace"
    >
      <WorkspaceExplorer onOpenProject={onOpenProject} switchDisabled={projectSwitchDisabled} />
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
