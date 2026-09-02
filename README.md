# WeWork

WeWork is one local-first application project with four explicit runtime boundaries:

- `src/`: React renderer and local team experience;
- `desktop/`: Electron host and secure preload bridge;
- `app-runtime/`: local Agent/Pi execution sidecar;
- `server/`: optional Python collaboration service.

The directories live in one project and use one top-level command surface. They
remain separate processes so model keys, SSH credentials and filesystem access
never enter renderer state.

## Install and run

```bash
npm install
npm run dev
```

`npm run dev` starts Vite, waits for it to become ready, then launches the
Electron host and its Runtime sidecar.

## Build, test and package

```bash
npm test
npm run build
npm run package
```

The unpacked desktop application is produced under `desktop/dist/`.

For a Windows x64 ZIP, run on Windows from this project directory:

```powershell
npm install
npm run package:win
```

Extract the ZIP from `desktop/dist/` and run `WeWork.exe` with all
extracted files alongside it. This is unsigned; managed-device policy may block
execution. Native directory selection and credential storage currently use
macOS implementations and are not yet supported on Windows.

The optional collaboration server keeps its Python environment isolated:

```bash
python3 -m venv server/.venv
server/.venv/bin/pip install -r server/requirements.txt
npm run server:test
npm run server:dev
```

Browser-only UI work remains available with `npm run dev:web`. Desktop-native
workspace selection, credentials and Runtime execution require `npm run dev`.
