import { NodeRuntime } from "@effect/platform-node";
import { Config, Effect } from "effect";
import { app, BrowserWindow, dialog, ipcMain, Menu, session, systemPreferences } from "electron";
import { applicationMenuTemplate } from "./applicationMenu.ts";
import * as Path from "node:path";
import * as Process from "node:process";
import { fileURLToPath } from "node:url";
import { canonicalProject, ProjectRegistry, type RecentProject } from "./projectRegistry.ts";
import { waitForUrl, WorkspaceServerSupervisor } from "./workspaceServer.ts";

// Must run before app.whenReady(). Chromium's overlay compositor races with
// WebGL buffer recycling and logs SharedImageManager::ProduceOverlay /
// Invalid mailbox. This keeps GPU/WebGL; it only skips overlay promotion.
app.commandLine.appendSwitch("disable-gpu-memory-buffer-compositor-resources");

const portConfig = Config.port("BERNISE_PORT").pipe(Config.withDefault(13773));
const webUrlConfig = Config.string("BERNISE_WEB_URL").pipe(
  Config.withDefault("http://127.0.0.1:5733"),
);
const repoRootConfig = Config.string("BERNISE_ROOT").pipe(
  Config.withDefault(fileURLToPath(new URL("../../../", import.meta.url))),
);

const createWindow = Effect.fn("createWindow")(function* (webUrl: string) {
  const preload = Path.join(Path.dirname(fileURLToPath(import.meta.url)), "preload.cjs");
  yield* Effect.acquireRelease(
    Effect.sync(() => {
      const window = new BrowserWindow({
        width: 1100,
        height: 760,
        backgroundColor: "#1b1e28",
        title: "Bernise",
        show: false,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          preload,
        },
      });
      window.once("ready-to-show", () => {
        if (!window.isDestroyed()) {
          window.show();
        }
      });
      void window.loadURL(webUrl);
      return window;
    }),
    (window) =>
      Effect.sync(() => {
        if (!window.isDestroyed()) {
          window.destroy();
        }
      }),
  );
});

const errorMessage = (cause: unknown): string =>
  cause instanceof Error && cause.message.length > 0 ? cause.message : String(cause);

const program = Effect.gen(function* () {
  const port = yield* portConfig;
  const webUrl = yield* webUrlConfig;
  const repoRoot = yield* repoRootConfig;

  yield* Effect.promise(() => app.whenReady());
  if (Process.platform === "darwin") {
    yield* Effect.promise(() => systemPreferences.askForMediaAccess("microphone"));
  }
  session.defaultSession.setPermissionCheckHandler((_contents, permission, _origin, details) => {
    return permission === "media" || details.mediaType === "audio" || permission === "fullscreen";
  });
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === "media" || permission === "fullscreen");
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(applicationMenuTemplate()));
  const supervisor = yield* Effect.acquireRelease(
    Effect.sync(() => new WorkspaceServerSupervisor(port, repoRoot)),
    (instance) => Effect.promise(() => instance.stop()),
  );
  const registry = new ProjectRegistry(Path.join(app.getPath("userData"), "projects.json"));
  let activeProject: RecentProject | undefined;

  yield* Effect.acquireRelease(
    Effect.sync(() => {
      ipcMain.handle("bernise:get-launch-state", async () => ({
        activeProject: activeProject ?? null,
        recentProjects: await registry.list(),
      }));
      ipcMain.handle("bernise:open-project", async (_event, path: string) => {
        try {
          const project = await canonicalProject(path);
          activeProject = undefined;
          await supervisor.start(project.path);
          const recentProjects = await registry.remember(project);
          activeProject = project;
          return { status: "ready" as const, project, recentProjects };
        } catch (cause) {
          return { status: "error" as const, message: errorMessage(cause) };
        }
      });
      ipcMain.handle("bernise:browse-project", async (event) => {
        const parent = BrowserWindow.fromWebContents(event.sender);
        const result =
          parent === null
            ? await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] })
            : await dialog.showOpenDialog(parent, {
                properties: ["openDirectory", "createDirectory"],
              });
        if (result.canceled || result.filePaths[0] === undefined) {
          return { status: "cancelled" as const };
        }
        try {
          const project = await canonicalProject(result.filePaths[0]);
          activeProject = undefined;
          await supervisor.start(project.path);
          const recentProjects = await registry.remember(project);
          activeProject = project;
          return { status: "ready" as const, project, recentProjects };
        } catch (cause) {
          return { status: "error" as const, message: errorMessage(cause) };
        }
      });
    }),
    () =>
      Effect.sync(() => {
        ipcMain.removeHandler("bernise:get-launch-state");
        ipcMain.removeHandler("bernise:open-project");
        ipcMain.removeHandler("bernise:browse-project");
      }),
  );

  yield* waitForUrl(webUrl);
  yield* createWindow(webUrl);

  yield* Effect.callback<void>((resume) => {
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        resume(Effect.void);
      }
    });
    app.on("before-quit", () => {
      resume(Effect.void);
    });
  });
}).pipe(Effect.scoped);

NodeRuntime.runMain(program);
