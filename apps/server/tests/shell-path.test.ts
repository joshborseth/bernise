import { describe, expect, it } from "@effect/vitest";
import {
  extractPathFromShellOutput,
  installLoginShellPathIntoProcess,
  listLoginShellCandidates,
  mergePathEntries,
  readPathFromLaunchctl,
  readPathFromLoginShell,
  type ExecFileSyncLike,
} from "../src/shellPath.ts";

const markedPath = (pathValue: string, noise = ""): string =>
  `${noise}__BERNISE_PATH_START__\n${pathValue}\n__BERNISE_PATH_END__\n`;

describe("extractPathFromShellOutput", () => {
  it("extracts the path between capture markers", () => {
    expect(extractPathFromShellOutput(markedPath("/opt/homebrew/bin:/usr/bin"))).toBe(
      "/opt/homebrew/bin:/usr/bin",
    );
  });

  it("ignores shell startup noise around the capture markers", () => {
    expect(
      extractPathFromShellOutput(markedPath("/opt/homebrew/bin:/usr/bin", "Welcome to fish\n")),
    ).toBe("/opt/homebrew/bin:/usr/bin");
  });

  it("returns null when the markers are missing", () => {
    expect(extractPathFromShellOutput("/opt/homebrew/bin /usr/bin")).toBeNull();
  });
});

describe("listLoginShellCandidates", () => {
  it("returns env shell, user shell, then the platform fallback without duplicates", () => {
    expect(listLoginShellCandidates("darwin", " /opt/homebrew/bin/nu ", "/bin/zsh")).toEqual([
      "/opt/homebrew/bin/nu",
      "/bin/zsh",
    ]);
  });

  it("falls back to the platform default when no shells are available", () => {
    expect(listLoginShellCandidates("linux", undefined, "")).toEqual(["/bin/bash"]);
  });
});

describe("mergePathEntries", () => {
  it("prefers login-shell PATH entries and keeps inherited extras", () => {
    expect(
      mergePathEntries("/opt/homebrew/bin:/usr/bin", "/Users/test/.local/bin:/usr/bin", "darwin"),
    ).toBe("/opt/homebrew/bin:/usr/bin:/Users/test/.local/bin");
  });

  it("skips empty segments", () => {
    expect(mergePathEntries("/opt/homebrew/bin::/usr/bin", undefined, "darwin")).toBe(
      "/opt/homebrew/bin:/usr/bin",
    );
  });
});

describe("readPathFromLoginShell", () => {
  it("uses a shell-agnostic printenv PATH probe", () => {
    const calls: Array<{
      readonly file: string;
      readonly args: ReadonlyArray<string>;
      readonly options: { encoding: "utf8"; timeout: number };
    }> = [];
    const execFile: ExecFileSyncLike = (file, args, options) => {
      calls.push({ file, args, options });
      return markedPath("/a:/b");
    };

    expect(readPathFromLoginShell("/opt/homebrew/bin/fish", execFile)).toBe("/a:/b");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.file).toBe("/opt/homebrew/bin/fish");
    expect(calls[0]?.args[0]).toBe("-ilc");
    expect(calls[0]?.args[1]).toContain("printenv PATH || true");
    expect(calls[0]?.args[1]).toContain("__BERNISE_PATH_START__");
    expect(calls[0]?.args[1]).toContain("__BERNISE_PATH_END__");
    expect(calls[0]?.options).toEqual({ encoding: "utf8", timeout: 5000 });
  });

  it("returns undefined when the login shell probe fails", () => {
    const execFile: ExecFileSyncLike = () => {
      throw new Error("spawn /bin/zsh ENOENT");
    };
    expect(readPathFromLoginShell("/bin/zsh", execFile)).toBeUndefined();
  });
});

describe("readPathFromLaunchctl", () => {
  it("returns a trimmed PATH value from launchctl", () => {
    const calls: Array<{
      readonly file: string;
      readonly args: ReadonlyArray<string>;
    }> = [];
    const execFile: ExecFileSyncLike = (file, args) => {
      calls.push({ file, args });
      return "  /opt/homebrew/bin:/usr/bin  \n";
    };

    expect(readPathFromLaunchctl(execFile)).toBe("/opt/homebrew/bin:/usr/bin");
    expect(calls).toEqual([{ file: "/bin/launchctl", args: ["getenv", "PATH"] }]);
  });

  it("returns undefined when launchctl is unavailable", () => {
    const execFile: ExecFileSyncLike = () => {
      throw new Error("spawn /bin/launchctl ENOENT");
    };
    expect(readPathFromLaunchctl(execFile)).toBeUndefined();
  });
});

describe("installLoginShellPathIntoProcess", () => {
  it("writes login-shell PATH first, then inherited extras", () => {
    const env: NodeJS.ProcessEnv = {
      PATH: "/usr/bin:/bin",
      SHELL: "/bin/zsh",
    };
    const execFile: ExecFileSyncLike = (file) => {
      if (file === "/bin/zsh") {
        return markedPath("/opt/homebrew/bin:/usr/bin");
      }
      throw new Error(`unexpected exec ${file}`);
    };

    expect(
      installLoginShellPathIntoProcess({
        env,
        platform: "darwin",
        execFile,
        userShell: "",
      }),
    ).toBe("/opt/homebrew/bin:/usr/bin:/bin");
    expect(env.PATH).toBe("/opt/homebrew/bin:/usr/bin:/bin");
  });

  it("falls back to launchctl on darwin when login shells fail", () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin" };
    const execFile: ExecFileSyncLike = (file) => {
      if (file === "/bin/launchctl") {
        return "/opt/homebrew/bin:/usr/bin\n";
      }
      throw new Error("login shell missing");
    };

    expect(
      installLoginShellPathIntoProcess({
        env,
        platform: "darwin",
        execFile,
        userShell: "",
      }),
    ).toBe("/opt/homebrew/bin:/usr/bin");
  });

  it("leaves Windows PATH unchanged", () => {
    const env: NodeJS.ProcessEnv = { PATH: "C:\\Windows\\System32" };
    const execFile: ExecFileSyncLike = () => {
      throw new Error("should not probe a login shell on Windows");
    };

    expect(
      installLoginShellPathIntoProcess({
        env,
        platform: "win32",
        execFile,
        userShell: "",
      }),
    ).toBe("C:\\Windows\\System32");
    expect(env.PATH).toBe("C:\\Windows\\System32");
  });
});
