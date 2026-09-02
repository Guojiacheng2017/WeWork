# WeWork Desktop

Electron is the endpoint launcher for the local-first WeWork App. The main
process starts and supervises the Node sidecar, creates a fresh 256-bit bearer
token for every sidecar process, and proxies a fixed allow-list of Host methods
through a sandboxed preload bridge. The renderer never receives the loopback
URL or token.

## Development and packaging

From the unified WeWork project root:

```bash
npm run dev
npm run package
```

To point Desktop at an already running Vite server:

```bash
WEWORK_UI_DEV_URL=http://127.0.0.1:5173 npm --workspace wework-desktop run dev
```

The unpacked macOS app is written to
`dist/mac-arm64/WeWork.app`. `package:dir` intentionally skips signing;
distribution builds still require an Apple identity and notarization policy.

The exposed renderer contract is `window.weworkHost`: current/select local
workspace, credential create/list, SSH probe, start/get/cancel run, and replay
events. Secrets are accepted only as transient IPC arguments for Keychain
creation and are never returned by the bridge.
