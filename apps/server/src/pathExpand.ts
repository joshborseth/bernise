import { homedir } from "node:os";
import { join } from "node:path";

export const expandHomePath = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed === "~") {
    return homedir();
  }
  if (trimmed.startsWith("~/")) {
    return join(homedir(), trimmed.slice(2));
  }
  return trimmed;
};
