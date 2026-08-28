#!/usr/bin/env node

import * as Readline from "node:readline";

const rl = Readline.createInterface({ input: process.stdin, terminal: false });

const send = (value) => {
  process.stdout.write(`${JSON.stringify(value)}\n`);
};

let promptRequestId;
let permissionRequestId = 1000;

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
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: {},
        authMethods: [{ id: "cursor_login", name: "Cursor Login" }],
      },
    });
    return;
  }

  if (message.method === "authenticate") {
    send({ jsonrpc: "2.0", id: message.id, result: {} });
    return;
  }

  if (message.method === "session/new") {
    send({ jsonrpc: "2.0", id: message.id, result: { sessionId: "fake-acp-session" } });
    return;
  }

  if (message.method === "session/prompt") {
    promptRequestId = message.id;
    const sessionId = message.params?.sessionId ?? "fake-acp-session";
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Hello" },
        },
      },
    });
    permissionRequestId += 1;
    send({
      jsonrpc: "2.0",
      id: permissionRequestId,
      method: "session/request_permission",
      params: {
        sessionId,
        options: [
          { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
          { optionId: "reject-once", name: "Reject", kind: "reject_once" },
        ],
      },
    });
    return;
  }

  if (message.id === permissionRequestId && Object.hasOwn(message, "result")) {
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "fake-acp-session",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: " from ACP" },
        },
      },
    });
    send({
      jsonrpc: "2.0",
      id: promptRequestId,
      result: { stopReason: "end_turn" },
    });
  }
});
