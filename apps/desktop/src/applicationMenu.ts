import type { MenuItemConstructorOptions } from "electron";

export const applicationMenuTemplate = (
  platform: NodeJS.Platform = process.platform,
): Array<MenuItemConstructorOptions> => {
  const isMac = platform === "darwin";
  const template: Array<MenuItemConstructorOptions> = [];
  if (isMac) {
    template.push({ role: "appMenu" });
  } else {
    template.push({
      label: "File",
      submenu: [{ role: "quit" }],
    });
  }
  template.push(
    { role: "editMenu" },
    { role: "viewMenu" },
    {
      label: "Window",
      submenu: isMac
        ? [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }]
        : [{ role: "minimize" }, { role: "zoom" }],
    },
  );
  return template;
};

const isModWAccelerator = (accelerator: string): boolean =>
  /^(CommandOrControl|CmdOrCtrl|Command|Cmd|Control|Ctrl)\+W$/i.test(accelerator.trim());

export const menuClosesWindowOnModW = (
  items: ReadonlyArray<MenuItemConstructorOptions>,
): boolean => {
  for (const item of items) {
    if (item.role === "close") {
      return true;
    }
    if (item.accelerator !== undefined && isModWAccelerator(item.accelerator)) {
      return true;
    }
    const submenu = item.submenu;
    if (Array.isArray(submenu) && menuClosesWindowOnModW(submenu)) {
      return true;
    }
  }
  return false;
};
