# WeWork

WeWork opens directly into a collaborative workspace and uses the Pi runtime to run assistants.

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

For a Linux ARM64 build (including Phytium/aarch64), build on an ARM64 Linux
desktop or in an equivalent ARM64 build environment:

```bash
sudo apt-get install libsecret-tools
npm install
npm run package:linux-arm64
```

The DEB and AppImage artifacts are written under `desktop/dist/`. Credentials
are stored through the desktop Secret Service; a running keyring provider such
as GNOME Keyring or KWallet is required. The target machine's glibc and desktop
libraries must also satisfy the Electron runtime bundled with the application.

For a Windows x64 ZIP, run on Windows from this project directory:

```powershell
npm install
npm run package:win
```

Extract the ZIP from `desktop/dist/` and run `WeWork.exe` with all
extracted files alongside it. This is unsigned; managed-device policy may block
execution. Credentials are encrypted with Windows DPAPI for the current user;
copying the credential files to another account or device will not make them
decryptable there.

The optional collaboration server keeps its Python environment isolated:

```bash
python3 -m venv server/.venv
server/.venv/bin/pip install -r server/requirements.txt
npm run server:test
npm run server:dev
```

Browser-only UI work remains available with `npm run dev:web`. Desktop-native
workspace selection, credentials and Runtime execution require `npm run dev`.

## Team capability modules

Every team runs with the lightweight WeWork core: roster, group chat, targeted
or broadcast delivery, Harness execution, and replies. Project Management is an
explicit team installation and can independently expose Issues, Board, Gantt,
Timeline, Calendar, Database/Table, and DAG capabilities.

Issues, Board, and Gantt are projections of one versioned Collaboration
Database stored in the team's Workspace. Disabling the module unloads its views
and Agent tools but retains all records. Re-enabling restores them; permanent
data deletion is a separate confirmed operation in Team Settings. Agent tools
are derived from the current team's enabled capabilities for every new run.

## Local Pi adapter smoke test

Pi must already be installed and authenticated on the current device. WeWork does not copy or store Pi credentials.

```bash
npm --workspace wework-app-runtime run smoke:pi
```

To test an explicit installation:

```bash
PI_EXECUTABLE=/absolute/path/to/pi npm --workspace wework-app-runtime run smoke:pi
```

The smoke test creates an isolated temporary workspace, starts a Pi RPC session, calls one read-only WeWork tool, prints a redacted result, and removes the temporary workspace.
