const { contextBridge, ipcRenderer } = require("electron");

const invoke = (method, payload) => ipcRenderer.invoke("wework-host:invoke", { method, payload });
let directorySelection;
const chooseLocalWorkspace = () => {
  if (!directorySelection) {
    directorySelection = invoke("chooseLocalWorkspace").finally(() => { directorySelection = undefined; });
  }
  return directorySelection;
};
contextBridge.exposeInMainWorld("weworkHost", {
  diagnostics: () => invoke('diagnostics'),
  clearDiagnostics: () => invoke('clearDiagnostics'),
  weworkCall: (method, args) => invoke("weworkCall", { method, args }),
  dataInfo: () => invoke("dataInfo"),
  harnesses: () => invoke("harnesses"),
  harnessPolicy: () => invoke("harnessPolicy"),
  setHarnessPolicy: (allowedHarnesses) => invoke("setHarnessPolicy", { allowedHarnesses }),
  harnessModels: () => invoke('harnessModels'),
  sdhConnection: () => invoke('sdhConnection'),
  setSdhConnection: (baseUrl) => invoke('setSdhConnection', { baseUrl }),
  saveHarnessModel: (input) => invoke('saveHarnessModel', input),
  probeHarnessModel: (input) => invoke('probeHarnessModel', input),
  setDefaultHarnessModel: (harness, modelId) => invoke('setDefaultHarnessModel', { harness, modelId }),
  skills: (assignment) => invoke('skills', assignment ?? {}),
  currentWorkspace: () => invoke("currentWorkspace"),
  chooseLocalWorkspace,
  credentials: () => invoke("credentials"),
  createCredential: (input) => invoke("createCredential", input),
  plugins: () => invoke("plugins"),
  setPluginEnabled: (name, enabled) => invoke("setPluginEnabled", { name, enabled }),
  installPlugin: () => invoke("installPlugin"),
  invokePlugin: (input) => invoke("invokePlugin", input),
  testSshWorkspace: (input) => invoke("testSshWorkspace", input),
  startRun: (spec) => invoke("startRun", spec),
  steerEmployee: (employeeId, message) => invoke("steerEmployee", { employeeId, message }),
  cancelRun: (runId) => invoke("cancelRun", { runId }),
  run: (runId) => invoke("run", { runId }),
  events: (after = 0) => invoke("events", { after }),
});
