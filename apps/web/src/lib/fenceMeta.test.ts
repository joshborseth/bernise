import { describe, expect, it } from "@effect/vitest";
import {
  extractFenceLanguage,
  extractFenceTitle,
  syntheticFileNameForLanguage,
} from "./fenceMeta.ts";

describe("extractFenceLanguage", () => {
  it("reads a language-* class and maps gitignore to ini", () => {
    expect(extractFenceLanguage("language-ts")).toBe("ts");
    expect(extractFenceLanguage("language-gitignore")).toBe("ini");
    expect(extractFenceLanguage(undefined)).toBe("text");
  });
});

describe("extractFenceTitle", () => {
  it("reads title, file, and filename attributes, then a bare filename token", () => {
    expect(extractFenceTitle('title="src/main.ts"')).toBe("src/main.ts");
    expect(extractFenceTitle("file=App.tsx")).toBe("App.tsx");
    expect(extractFenceTitle("ts src/lib/utils.ts")).toBe("src/lib/utils.ts");
    expect(extractFenceTitle("ts")).toBeNull();
  });
});

describe("syntheticFileNameForLanguage", () => {
  it("maps language ids to a fake filename for icons", () => {
    expect(syntheticFileNameForLanguage("typescript")).toBe("file.ts");
    expect(syntheticFileNameForLanguage("unknownlang")).toBe("file.unknownlang");
  });
});
