# macOS overlay

Accessory AppKit app: always-on-top `NSPanel` (click-through around the cat, drag the cat to move, drop on a screen edge to perch and peer in, right-click the cat for litter/sleep/wake). The cat looks at the mouse across the whole screen. Menu extra, `WKWebView` pet, t3code HTTP poll, Chatterbox TTS.

This Linux environment cannot link AppKit. On a Mac:

```bash
cd apps/macos
BERNISE_PET_URL=http://127.0.0.1:5733 swift run
```

Run `vp run dev:pet` so the WebView has a cat to load. Pair t3code and put the bearer in `~/.bernise/t3code.json` as described in [docs/companion.md](../../docs/companion.md).

Release builds should point `WKWebView` at a copied `apps/pet/dist` instead of localhost. Mic permission is requested on first listen.
