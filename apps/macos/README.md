# macOS overlay

Accessory AppKit app: always-on-top `NSPanel` (click-through around the cat, drag the cat to move, drop on a screen edge to perch head-first, right-click the cat for litter/sleep/wake). The cat looks at the mouse across the whole screen. Menu extra, `WKWebView` pet, t3code shell stream, local Chatterbox Turbo.

This Linux environment cannot link AppKit or run MLX. On a Mac:

```bash
cd apps/macos
python3 -m venv .venv
.venv/bin/pip install -r tts/requirements.txt
BERNISE_PET_URL=http://127.0.0.1:5733 swift run
```

The overlay starts `tts/server.py` with that virtualenv and speaks through `http://127.0.0.1:7041`. Run `vp run dev:pet` so the WebView has a cat to load. Pair t3code and put the bearer in `~/.bernise/t3code.json` as described in [docs/companion.md](../../docs/companion.md).

Release builds should point `WKWebView` at a copied `apps/pet/dist` instead of localhost. Mic permission is requested on first listen.
