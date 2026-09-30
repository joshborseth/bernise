#!/usr/bin/env python3
"""Local Chatterbox Turbo for Bernise.

Loads the model once, then serves WAV on 127.0.0.1. Apple Silicon only,
unless BERNISE_TTS_FAKE=1, which returns silence and skips MLX.
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

HOST = "127.0.0.1"
DEFAULT_PORT = 7041
DEFAULT_MODEL = "mlx-community/chatterbox-turbo-4bit"
MAX_TEXT = 20_000
MAX_BODY = 64 * 1024

_engine = None
_speak_lock = threading.Lock()


def _port() -> int:
    raw = os.environ.get("BERNISE_TTS_PORT", str(DEFAULT_PORT))
    try:
        port = int(raw)
    except ValueError:
        print(f"Bernise speech: BERNISE_TTS_PORT is not a port: {raw}", file=sys.stderr)
        sys.exit(1)
    if port < 1 or port > 65535:
        print(f"Bernise speech: BERNISE_TTS_PORT is out of range: {port}", file=sys.stderr)
        sys.exit(1)
    return port


def _watch_parent() -> None:
    parent = os.getppid()

    def loop() -> None:
        while True:
            time.sleep(1)
            if os.getppid() != parent:
                os._exit(0)

    threading.Thread(target=loop, daemon=True).start()


def _wav(samples: bytes, sample_rate: int) -> bytes:
    import struct

    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + len(samples),
        b"WAVE",
        b"fmt ",
        16,
        1,
        1,
        sample_rate,
        sample_rate * 2,
        2,
        16,
        b"data",
        len(samples),
    )
    return header + samples


def _silent_wav() -> bytes:
    return _wav(b"\x00\x00" * 4800, 24_000)


def _load_engine():
    ref = os.environ.get("BERNISE_TTS_REF_AUDIO", "").strip()
    if ref and not os.path.isfile(ref):
        print(f"Bernise speech: reference audio not found: {ref}", file=sys.stderr)
        sys.exit(1)

    model_id = os.environ.get("BERNISE_TTS_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    print(f"Bernise speech: loading {model_id}", flush=True)
    from mlx_audio.tts.utils import load_model

    model = load_model(model_id)
    if ref:
        print(f"Bernise speech: voice from {ref}", flush=True)
        model.prepare_conditionals(ref)
    return model


def _synthesize(text: str) -> bytes:
    if os.environ.get("BERNISE_TTS_FAKE") == "1":
        return _silent_wav()

    import numpy as np

    pieces = []
    rate = 24_000
    for result in _engine.generate(text=text):
        rate = int(result.sample_rate)
        pieces.append(np.asarray(np.array(result.audio), dtype=np.float32).reshape(-1))
    if not pieces:
        raise RuntimeError("The speech model returned no audio.")
    samples = np.concatenate(pieces)
    pcm = np.clip(samples, -1.0, 1.0)
    ints = (pcm * 32767.0).astype("<i2")
    return _wav(ints.tobytes(), rate)


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        print(f"Bernise speech: {fmt % args}", flush=True)

    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] != "/health":
            self._send(404, b"Not found\n", "text/plain; charset=utf-8")
            return
        self._send(200, b'{"ready":true}\n', "application/json")

    def do_POST(self) -> None:
        if self.path.split("?", 1)[0] != "/speak":
            self._send(404, b"Not found\n", "text/plain; charset=utf-8")
            return
        try:
            length = int(self.headers.get("Content-Length", "0") or "0")
        except ValueError:
            self._send(400, b"Expected a Content-Length.\n", "text/plain; charset=utf-8")
            return
        if length < 0 or length > MAX_BODY:
            self._send(400, b"Request is too large.\n", "text/plain; charset=utf-8")
            return
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
            text = payload["text"]
        except (UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError):
            self._send(400, b"Expected JSON with a text field.\n", "text/plain; charset=utf-8")
            return
        if not isinstance(text, str):
            self._send(400, b"Expected JSON with a text field.\n", "text/plain; charset=utf-8")
            return
        text = text.strip()
        if not text:
            self._send(400, b"Nothing to speak.\n", "text/plain; charset=utf-8")
            return
        text = text[:MAX_TEXT]
        try:
            with _speak_lock:
                audio = _synthesize(text)
        except Exception as exc:
            detail = f"Speech failed: {exc}\n".encode()
            self._send(500, detail, "text/plain; charset=utf-8")
            return
        self._send(200, audio, "audio/wav")

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)


class _Server(HTTPServer):
    allow_reuse_address = True


def main() -> None:
    global _engine
    if os.environ.get("BERNISE_TTS_WATCH_PARENT") == "1":
        _watch_parent()
    ref = os.environ.get("BERNISE_TTS_REF_AUDIO", "").strip()
    if ref and not os.path.isfile(ref):
        print(f"Bernise speech: reference audio not found: {ref}", file=sys.stderr)
        sys.exit(1)
    if os.environ.get("BERNISE_TTS_FAKE") == "1":
        print("Bernise speech: fake engine ready", flush=True)
    else:
        _engine = _load_engine()
        print("Bernise speech: ready", flush=True)
    port = _port()
    server = _Server((HOST, port), _Handler)
    print(f"Bernise speech: http://{HOST}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
