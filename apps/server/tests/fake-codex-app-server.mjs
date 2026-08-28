#!/usr/bin/env node

import * as Readline from "node:readline";

const mode = process.env.FAKE_CODEX_MODE ?? "happy";

const rl = Readline.createInterface({ input: process.stdin, terminal: false });

const send = (value) => {
  process.stdout.write(`${JSON.stringify(value)}\n`);
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

  if (message.method === "thread/start") {
    send({
      id: message.id,
      result: { thread: { id: "fake-codex-thread" } },
    });
    return;
  }

  if (message.method === "turn/start") {
    turnRequestId = message.id;

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
