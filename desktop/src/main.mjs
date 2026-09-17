import { importAttachment } from './attachments.mjs';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SidecarSupervisor } from "./sidecar-supervisor.js";
import { weworkDataLayout } from './data-layout.mjs';
import { singleFlight } from './single-flight.mjs';
import { DiagnosticLog } from './diagnostic-log.js';
import { editingMenu } from './editing-menu.mjs';
import { desktopWindowChrome } from './window-options.mjs';
import { applicationMenuTemplate } from './application-menu.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const packagedRuntime = join(process.resourcesPath, "wework-app-runtime", "host-main.cjs");
const devRuntime = join(here, "..", "..", "desktop", "runtime-dist", "host-main.cjs");
const dataLayout = weworkDataLayout(app.getPath('documents'));
const diagnostics = new DiagnosticLog();
const supervisor = new SidecarSupervisor({ command: process.execPath, args: [app.isPackaged ? packagedRuntime : devRuntime], env: { ELECTRON_RUN_AS_NODE: "1", WEWORK_APP_DATA_DIR: dataLayout.rootPath, WEWORK_CONFIG_DIR: dataLayout.configPath } });
const chooseDirectory = singleFlight(async (owner) => {
  const result = await dialog.showOpenDialog(owner, {
    title: "选择 Workspace 目录",
    defaultPath: dataLayout.rootPath,
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled || !result.filePaths[0] ? null : { kind: "local", rootPath: result.filePaths[0] };
});
supervisor.on("ready", () => diagnostics.add('info', 'host', 'Runtime Host 已就绪'));
supervisor.on("restart-error", (error) => { diagnostics.add('error', 'host', 'Runtime Host 重启失败', { code: error.code, error: error.message }); console.error("WeWork Host restart failed:", error.message); });
supervisor.on("stderr", (message) => { diagnostics.add('error', 'runtime', message.trimEnd()); console.error("WeWork Host:", message.trimEnd()); });

const routes = {
  weworkCall: ["POST", "/v1/wework/call", (p) => p],
  dataInfo: ["GET", "/v1/data/info"],
  exportWorkspace: ["POST", "/v1/data/export", (p) => p], importWorkspace: ["POST", "/v1/data/import", (p) => p],
  harnesses: ["GET", "/v1/harnesses", null, (value) => value.installations],
  harnessPolicy: ["GET", "/v1/harnesses/policy"], setHarnessPolicy: ["POST", "/v1/harnesses/policy", (p) => p],
  harnessModels: ["GET", "/v1/harnesses/models"], saveHarnessModel: ["POST", "/v1/harnesses/models", (p) => p],
  sdhConnection: ["GET", "/v1/harnesses/smalldash/connection"], setSdhConnection: ["POST", "/v1/harnesses/smalldash/connection", (p) => p],
  probeHarnessModel: ["POST", "/v1/harnesses/models/probe", (p) => p],
  setDefaultHarnessModel: ["POST", "/v1/harnesses/models/default", (p) => p],
  skills: ["POST", "/v1/skills/discover", (p) => p],
  currentWorkspace: ["GET", "/v1/workspaces/current"], chooseLocalWorkspace: ["POST", "/v1/workspaces/local/choose"],
  credentials: ["GET", "/v1/credentials", null, (value) => value.credentials], createCredential: ["POST", "/v1/credentials", (p) => p, (value) => value.ref],
  plugins: ["GET", "/v1/plugins", null, (value) => value.plugins],
  setPluginEnabled: ["POST", "/v1/plugins/policy", (p) => p, (value) => value.plugins],
  installPluginFromPath: ["POST", "/v1/plugins/install", (p) => p, (value) => value.plugins],
  invokePlugin: ["POST", "/v1/plugins/invoke", (p) => p],
  testSshWorkspace: ["POST", "/v1/workspaces/ssh/probe", (p) => p], startRun: ["POST", "/v1/runs", (p) => p],
  steerEmployee: ["POST", (p) => `/v1/employees/${encodeURIComponent(p.employeeId)}/steer`, (p) => ({ message: p.message })],
  cancelRun: ["POST", (p) => `/v1/runs/${encodeURIComponent(p.runId)}/cancel`], run: ["GET", (p) => `/v1/runs/${encodeURIComponent(p.runId)}`],
  events: ["GET", "/v1/events", null, null, (p) => ({ "last-event-id": String(p.after ?? 0) })],
};

ipcMain.handle("wework-host:invoke", async (_event, { method, payload }) => {
  if (method === 'openExternal') {
    const url = String(payload?.url ?? '');
    if (!/^https?:\/\//i.test(url)) throw new Error('Only http and https links can be opened');
    await shell.openExternal(url);
    return true;
  }
  if (method === 'importAttachment') return importAttachment(app.getPath('userData'), payload);
  if (method === 'diagnostics') return diagnostics.snapshot({ host: supervisor.endpoint ? 'ready' : 'unavailable', pid: supervisor.child?.pid ?? null });
  if (method === 'clearDiagnostics') { diagnostics.clear(); return diagnostics.snapshot({ host: supervisor.endpoint ? 'ready' : 'unavailable', pid: supervisor.child?.pid ?? null }); }
  if (method === 'exportWorkspace') {
    const teamId = typeof payload?.teamId === 'string' ? payload.teamId : undefined;
    const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(_event.sender), { title: teamId ? '导出团队' : '导出全部 WeWork 团队', defaultPath: join(app.getPath('downloads'), `WeWork-${teamId ?? 'all'}-${new Date().toISOString().slice(0, 10)}.zip`), filters: [{ name: 'WeWork ZIP', extensions: ['zip'] }] });
    if (result.canceled || !result.filePath) return null;
    payload = { archivePath: result.filePath.endsWith('.zip') ? result.filePath : `${result.filePath}.zip`, teamId };
  }
  if (method === 'importWorkspace') {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(_event.sender), { title: '导入 WeWork 工作区', properties: ['openFile'], filters: [{ name: 'WeWork ZIP', extensions: ['zip'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    payload = { archivePath: result.filePaths[0] };
  }
  if (method === "chooseLocalWorkspace") {
    return chooseDirectory(BrowserWindow.fromWebContents(_event.sender));
  }
  if (method === "installPlugin") {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(_event.sender), { title: "选择 WeWork Plugin 目录", properties: ["openDirectory"] });
    if (result.canceled || !result.filePaths[0]) return null;
    const route = routes.installPluginFromPath;
    if (!supervisor.endpoint) throw Object.assign(new Error("WeWork Host unavailable"), { code: "HOST_UNAVAILABLE" });
    const response = await fetch(`${supervisor.endpoint.url}${route[1]}`, { method: route[0], headers: { authorization: supervisor.authorization(), "content-type": "application/json" }, body: JSON.stringify({ path: result.filePaths[0] }) });
    const value = await response.json();
    if (!response.ok) throw Object.assign(new Error(value.error?.message ?? "Plugin install failed"), { code: value.error?.code ?? "HOST_INTERNAL", status: response.status });
    return route[3](value);
  }
  const route = routes[method]; if (!route) throw new Error("Unsupported WeWork Host method");
  if (!supervisor.endpoint) throw Object.assign(new Error("WeWork Host unavailable"), { code: "HOST_UNAVAILABLE" });
  const [httpMethod, pathValue, bodyFn, mapFn, headersFn] = route;
  const path = typeof pathValue === "function" ? pathValue(payload) : pathValue;
  const started = Date.now();
  diagnostics.add('info', 'bridge', `${method} 开始`);
  try {
    const response = await fetch(`${supervisor.endpoint.url}${path}`, { method: httpMethod, headers: { authorization: supervisor.authorization(), "content-type": "application/json", ...(headersFn?.(payload) ?? {}) }, body: bodyFn ? JSON.stringify(bodyFn(payload)) : undefined });
    const value = await response.json();
    if (!response.ok) throw Object.assign(new Error(value.error?.message ?? "WeWork Host request failed"), { code: value.error?.code ?? "HOST_INTERNAL", status: response.status });
    if (method === 'events') for (const event of value.events ?? []) {
      if (event.type === 'run.started') diagnostics.add('info', 'session', `Run ${event.runId} 已启动`);
      else if (event.type === 'run.succeeded') diagnostics.add('info', 'session', `Run ${event.runId} 已完成`);
      else if (event.type === 'run.failed' || event.type === 'run.cancelled') diagnostics.add('error', 'session', `Run ${event.runId} ${event.type === 'run.failed' ? '失败' : '已取消'}`, { error: event.error });
      else if (event.type === 'assistant.activity') diagnostics.add('info', 'harness', event.text, { activity: event.activity, runId: event.runId });
    }
    diagnostics.add('info', 'bridge', `${method} 完成`, { durationMs: Date.now() - started });
    return mapFn ? mapFn(value) : value;
  } catch (error) {
    diagnostics.add('error', 'bridge', `${method} 失败`, { durationMs: Date.now() - started, code: error.code, error: error.message });
    throw error;
  }
});

let mainWindow = null;
let quitting = false;

const createMainWindow = async () => {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    backgroundColor: '#f8fafc',
    ...desktopWindowChrome(process.platform),
    webPreferences: { preload: join(here, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  mainWindow = window;
  window.on('closed', () => { if (mainWindow === window) mainWindow = null; });
  window.webContents.on('context-menu', (_event, params) => {
    const template = editingMenu(params);
    if (template.length) Menu.buildFromTemplate(template).popup({ window });
  });
  if (process.env.WEWORK_UI_DEV_URL) await window.loadURL(process.env.WEWORK_UI_DEV_URL);
  else await window.loadFile(app.isPackaged ? join(process.resourcesPath, "wework-ui", "index.html") : join(here, "..", "..", "dist", "index.html"));
  return window;
};

app.whenReady().then(async () => {
  if (!app.isPackaged) {
    const { buildRuntime } = await import('./build-runtime.mjs');
    await buildRuntime();
  }
  await supervisor.start();
  Menu.setApplicationMenu(Menu.buildFromTemplate(applicationMenuTemplate({
    appName: app.name,
    platform: process.platform,
    closeCurrentLayer: () => {
      const window = BrowserWindow.getFocusedWindow() ?? mainWindow;
      if (window && !window.isDestroyed()) window.webContents.send('wework-shell:close-layer');
    },
  })));
  await createMainWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createMainWindow(); });
});
app.on("before-quit", () => { quitting = true; void supervisor.stop(); });
app.on("window-all-closed", () => { if (process.platform !== 'darwin' && !quitting) app.quit(); });
