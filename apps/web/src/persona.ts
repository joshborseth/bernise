import defaultBernisePersona from "../../server/src/persona.md?raw";

export { defaultBernisePersona };

export const resolvePersona = (persona: string): string =>
  persona.trim().length > 0 ? persona : defaultBernisePersona;
