#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import * as Readline from "node:readline";

const mode = process.env.FAKE_CODEX_MODE ?? "happy";

const rl = Readline.createInterface({ input: process.stdin, terminal: false });

const send = (value) => {
  process.stdout.write(`${JSON.stringify(value)}\n`);
};

const remember = (name, value) => {
  try {
    writeFileSync(join(process.cwd(), name), `${JSON.stringify(value)}\n`);
  } catch {
    // Tests read these files from the fake workspace; ignore write failures.
  }
};

let turnRequestId;

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return;
  }
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (message === null || typeof message !== "object") {
    return;
  }

  if (message.method === "initialize") {
    send({
      id: message.id,
      result: {
        userAgent: "codex_cli_rs/0.0.0",
      },
    });
    return;
  }

  if (message.method === "initialized") {
    return;
  }

  if (message.method === "account/read") {
    if (mode === "unauthenticated") {
      send({
        id: message.id,
        result: { account: null, requiresOpenaiAuth: true },
      });
      return;
    }
    send({
      id: message.id,
      result: {
        account: { type: "chatgpt", email: "dev@example.com", planType: "plus" },
        requiresOpenaiAuth: false,
      },
    });
    return;
  }

  if (message.method === "model/list") {
    send({
      id: message.id,
      result: {
        data: [
          {
            id: "gpt-5.4-mini",
            model: "gpt-5.4-mini",
            displayName: "GPT-5.4 Mini",
            hidden: false,
            isDefault: true,
          },
          {
            id: "gpt-5.4",
            model: "gpt-5.4",
            displayName: "GPT-5.4",
            hidden: false,
            isDefault: false,
          },
          {
            id: "hidden-model",
            model: "hidden-model",
            displayName: "Hidden",
            hidden: true,
            isDefault: false,
          },
        ],
        nextCursor: null,
      },
    });
    return;
  }

  if (message.method === "thread/start") {
    remember("last-thread-start.json", {
      model: message.params?.model ?? null,
      cwd: message.params?.cwd ?? null,
      developerInstructions: message.params?.developerInstructions ?? null,
    });
    send({
      id: message.id,
      result: { thread: { id: "fake-codex-thread" } },
    });
    return;
  }

  if (message.method === "thread/resume") {
    remember("last-thread-resume.json", {
      threadId: message.params?.threadId ?? null,
      model: message.params?.model ?? null,
      cwd: message.params?.cwd ?? null,
      developerInstructions: message.params?.developerInstructions ?? null,
    });
    if (mode === "resume-fail") {
      send({
        id: message.id,
        error: { code: -32000, message: "thread not found" },
      });
      return;
    }
    send({
      id: message.id,
      result: { thread: { id: message.params?.threadId ?? "fake-codex-thread" } },
    });
    return;
  }

  if (message.method === "turn/start") {
    turnRequestId = message.id;
    remember("last-turn-start.json", {
      model: message.params?.model ?? null,
    });

    if (mode === "exit-on-prompt") {
      process.stderr.write("boom from fake codex\n");
      process.exit(1);
    }

    if (mode === "empty") {
      send({
        method: "turn/completed",
        params: { turn: { id: "turn-1", status: "completed" } },
      });
      send({
        id: turnRequestId,
        result: { turn: { id: "turn-1" } },
      });
      return;
    }

    send({
      method: "item/agentMessage/delta",
      params: { delta: "Hello" },
    });
    send({
      method: "item/commandExecution/requestApproval",
      id: 9001,
      params: { command: "ls" },
    });
    return;
  }

  if (message.id === 9001 && Object.hasOwn(message, "result")) {
    send({
      method: "item/agentMessage/delta",
      params: { delta: " from Codex" },
    });
    send({
      method: "turn/completed",
      params: { turn: { id: "turn-1", status: "completed" } },
    });
    send({
      id: turnRequestId,
      result: { turn: { id: "turn-1" } },
    });
  }
});
