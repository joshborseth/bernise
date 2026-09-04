import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const defaultBernisePersona = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "persona.md"),
  "utf8",
);

export const resolvePersona = (persona: string): string =>
  persona.trim().length > 0 ? persona : defaultBernisePersona;
