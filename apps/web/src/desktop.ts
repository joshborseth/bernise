export type RecentProject = {
  readonly path: string;
  readonly name: string;
  readonly lastOpenedAt: string;
};

export type DesktopLaunchState = {
  readonly activeProject: RecentProject | null;
  readonly recentProjects: ReadonlyArray<RecentProject>;
};

export type OpenProjectResult =
  | { readonly status: "cancelled" }
  | {
      readonly status: "ready";
      readonly project: RecentProject;
      readonly recentProjects: ReadonlyArray<RecentProject>;
    }
  | { readonly status: "error"; readonly message: string };

export type BerniseDesktopBridge = {
  readonly getLaunchState: () => Promise<DesktopLaunchState>;
  readonly browseProject: () => Promise<OpenProjectResult>;
  readonly openProject: (path: string) => Promise<OpenProjectResult>;
};

declare global {
  interface Window {
    readonly berniseDesktop?: BerniseDesktopBridge;
  }
}

export const desktopBridge = (): BerniseDesktopBridge | undefined => window.berniseDesktop;
