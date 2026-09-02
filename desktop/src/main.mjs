import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SidecarSupervisor } from "./sidecar-supervisor.js";
import { weworkDataLayout } from './data-layout.mjs';
import { singleFlight } from './single-flight.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const packagedRuntime = join(process.resourcesPath, "wework-app-runtime", "host-main.cjs");
const devRuntime = join(here, "..", "..", "desktop", "runtime-dist", "host-main.cjs");
const dataLayout = weworkDataLayout(app.getPath('documents'));
const supervisor = new SidecarSupervisor({ command: process.execPath, args: [app.isPackaged ? packagedRuntime : devRuntime], env: { ELECTRON_RUN_AS_NODE: "1", WEWORK_APP_DATA_DIR: dataLayout.rootPath, WEWORK_CONFIG_DIR: dataLayout.configPath } });
const chooseDirectory = singleFlight(async (owner) => {
  const result = await dialog.showOpenDialog(owner, {
    title: "选择 Workspace 目录",
    defaultPath: dataLayout.rootPath,
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled || !result.filePaths[0] ? null : { kind: "local", rootPath: result.filePaths[0] };
});
supervisor.on("restart-error", (error) => console.error("WeWork Host restart failed:", error.message));
supervisor.on("stderr", (message) => console.error("WeWork Host:", message.trimEnd()));

const routes = {
  weworkCall: ["POST", "/v1/wework/call", (p) => p],
  dataInfo: ["GET", "/v1/data/info"],
  harnesses: ["GET", "/v1/harnesses", null, (value) => value.installations],
  harnessPolicy: ["GET", "/v1/harnesses/policy"], setHarnessPolicy: ["POST", "/v1/harnesses/policy", (p) => p],
  harnessModels: ["GET", "/v1/harnesses/models"], saveHarnessModel: ["POST", "/v1/harnesses/models", (p) => p],
  probeHarnessModel: ["POST", "/v1/harnesses/models/probe", (p) => p],
  setDefaultHarnessModel: ["POST", "/v1/harnesses/models/default", (p) => p],
  skills: ["POST", "/v1/skills/discover", (p) => p],
  currentWorkspace: ["GET", "/v1/workspaces/current"], chooseLocalWorkspace: ["POST", "/v1/workspaces/local/choose"],
  credentials: ["GET", "/v1/credentials", null, (value) => value.credentials], createCredential: ["POST", "/v1/credentials", (p) => p, (value) => value.ref],
  testSshWorkspace: ["POST", "/v1/workspaces/ssh/probe", (p) => p], startRun: ["POST", "/v1/runs", (p) => p],
  cancelRun: ["POST", (p) => `/v1/runs/${encodeURIComponent(p.runId)}/cancel`], run: ["GET", (p) => `/v1/runs/${encodeURIComponent(p.runId)}`],
  events: ["GET", "/v1/events", null, null, (p) => ({ "last-event-id": String(p.after ?? 0) })],
};

ipcMain.handle("wework-host:invoke", async (_event, { method, payload }) => {
  if (method === "chooseLocalWorkspace") {
    return chooseDirectory(BrowserWindow.fromWebContents(_event.sender));
  }
  const route = routes[method]; if (!route) throw new Error("Unsupported WeWork Host method");
  if (!supervisor.endpoint) throw Object.assign(new Error("WeWork Host unavailable"), { code: "HOST_UNAVAILABLE" });
  const [httpMethod, pathValue, bodyFn, mapFn, headersFn] = route;
  const path = typeof pathValue === "function" ? pathValue(payload) : pathValue;
  const response = await fetch(`${supervisor.endpoint.url}${path}`, { method: httpMethod, headers: { authorization: supervisor.authorization(), "content-type": "application/json", ...(headersFn?.(payload) ?? {}) }, body: bodyFn ? JSON.stringify(bodyFn(payload)) : undefined });
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error(value.error?.message ?? "WeWork Host request failed"), { code: value.error?.code ?? "HOST_INTERNAL", status: response.status });
  return mapFn ? mapFn(value) : value;
});

app.whenReady().then(async () => {
  if (!app.isPackaged) {
    const { buildRuntime } = await import('./build-runtime.mjs');
    await buildRuntime();
  }
  await supervisor.start();
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    backgroundColor: '#f8fafc',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 18 } } : {}),
    webPreferences: { preload: join(here, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  if (process.env.WEWORK_UI_DEV_URL) await window.loadURL(process.env.WEWORK_UI_DEV_URL);
  else await window.loadFile(app.isPackaged ? join(process.resourcesPath, "wework-ui", "index.html") : join(here, "..", "..", "dist", "index.html"));
});
app.on("before-quit", () => { void supervisor.stop(); });
app.on("window-all-closed", () => app.quit());
