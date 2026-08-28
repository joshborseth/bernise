#!/usr/bin/env node

import * as Readline from "node:readline";

const mode = process.env.FAKE_ACP_MODE ?? "happy";

const rl = Readline.createInterface({ input: process.stdin, terminal: false });

const send = (value) => {
  process.stdout.write(`${JSON.stringify(value)}\n`);
};

let promptRequestId;
let permissionRequestId = 1000;
let askQuestionRequestId = 2000;

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

    if (mode === "exit-on-prompt") {
      process.stderr.write("boom from fake acp\n");
      process.exit(1);
    }

    if (mode === "empty") {
      send({
        jsonrpc: "2.0",
        id: promptRequestId,
        result: { stopReason: "end_turn" },
      });
      return;
    }

    if (mode === "ask-question") {
      askQuestionRequestId += 1;
      send({
        jsonrpc: "2.0",
        id: askQuestionRequestId,
        method: "cursor/ask_question",
        params: {
          toolCallId: "call_q",
          title: "Need input",
          questions: [
            {
              id: "q1",
              prompt: "Which mode?",
              options: [{ id: "agent", label: "Agent" }],
            },
          ],
        },
      });
      return;
    }

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

  if (message.id === askQuestionRequestId && Object.hasOwn(message, "result")) {
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "fake-acp-session",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Hello from ACP" },
        },
      },
    });
    send({
      jsonrpc: "2.0",
      id: promptRequestId,
      result: { stopReason: "end_turn" },
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
