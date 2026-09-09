import http from "node:http";
import { HostError, hostError } from "./errors.js";

export class EventJournal {
  constructor(limit = 1000) { this.limit = limit; this.events = []; this.cursor = 0; }
  publish(event) { const row = { id: ++this.cursor, at: new Date().toISOString(), ...event }; this.events.push(row); if (this.events.length > this.limit) this.events.shift(); return row; }
  after(cursor = 0) { return this.events.filter((event) => event.id > cursor); }
}

const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "http://127.0.0.1:5173" }); res.end(JSON.stringify(body ?? null)); };
const body = async (req) => { const chunks = []; for await (const chunk of req) chunks.push(chunk); return chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}; };

export function createHostServer({ token, services, journal = new EventJournal() }) {
  let url;
  const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "http://127.0.0.1:5173", "access-control-allow-headers": "authorization,content-type,last-event-id", "access-control-allow-methods": "GET,POST,OPTIONS" }); return res.end(); }
    if (req.headers.authorization !== `Bearer ${token}`) return json(res, 401, { error: { code: "HOST_UNAUTHORIZED", message: "invalid desktop host token" } });
    try {
      if (req.url === "/v1/wework/call" && req.method === "POST") { const input = await body(req); return json(res, 200, await services.weworkCall(input.method, input.args)); }
      if (req.url === "/v1/health") return json(res, 200, { ok: true, service: "wework-app-runtime" });
      if (req.url === "/v1/data/info" && req.method === "GET") return json(res, 200, await services.dataInfo());
      if (req.url === "/v1/harnesses" && req.method === "GET") return json(res, 200, { installations: await services.listHarnesses() });
      if (req.url === "/v1/harnesses/smalldash/connection" && req.method === "GET") return json(res, 200, await services.getSdhConnection());
      if (req.url === "/v1/harnesses/smalldash/connection" && req.method === "POST") return json(res, 200, await services.setSdhConnection(await body(req)));
      if (req.url === "/v1/harnesses/policy" && req.method === "GET") return json(res, 200, await services.getHarnessPolicy());
      if (req.url === "/v1/harnesses/policy" && req.method === "POST") return json(res, 200, await services.setHarnessPolicy(await body(req)));
      if (req.url === "/v1/harnesses/models" && req.method === "GET") return json(res, 200, await services.listHarnessModels());
      if (req.url === "/v1/harnesses/models" && req.method === "POST") return json(res, 201, await services.saveHarnessModel(await body(req)));
      if (req.url === "/v1/harnesses/models/probe" && req.method === "POST") return json(res, 200, await services.probeHarnessModel(await body(req)));
      if (req.url === "/v1/harnesses/models/default" && req.method === "POST") { const input = await body(req); return json(res, 200, await services.setDefaultHarnessModel(input.harness, input.modelId)); }
      if (req.url === "/v1/skills/discover" && req.method === "POST") return json(res, 200, await services.listSkills(await body(req)));
      if (req.url === "/v1/workspaces/current") return json(res, 200, await services.currentDirectory());
      if (req.url === "/v1/workspaces/local/choose" && req.method === "POST") return json(res, 200, await services.chooseDirectory());
      if (req.url === "/v1/credentials" && req.method === "GET") return json(res, 200, { credentials: await services.listCredentials() });
      if (req.url === "/v1/credentials" && req.method === "POST") return json(res, 201, await services.createCredential(await body(req)));
      if (req.url === "/v1/plugins" && req.method === "GET") return json(res, 200, { plugins: await services.listPlugins() });
      if (req.url === "/v1/plugins/policy" && req.method === "POST") return json(res, 200, { plugins: await services.setPluginEnabled(await body(req)) });
      if (req.url === "/v1/plugins/install" && req.method === "POST") return json(res, 201, { plugins: await services.installPlugin(await body(req)) });
      if (req.url === "/v1/plugins/invoke" && req.method === "POST") return json(res, 200, await services.invokePlugin(await body(req)));
      if (req.url === "/v1/workspaces/ssh/probe" && req.method === "POST") return json(res, 200, await services.probeSshWorkspace(await body(req)));
      if (req.url === "/v1/runs" && req.method === "POST") return json(res, 202, await services.runtime.start(await body(req)));
      const steerMatch = req.url?.match(/^\/v1\/employees\/([^/]+)\/steer$/);
      if (steerMatch && req.method === 'POST') return json(res, 200, await services.runtime.steerEmployee(decodeURIComponent(steerMatch[1]), (await body(req)).message));
      const runMatch = req.url?.match(/^\/v1\/runs\/([^/]+)$/);
      const cancelMatch = req.url?.match(/^\/v1\/runs\/([^/]+)\/cancel$/);
      if (runMatch && req.method === "GET") { const run = await services.runtime.get(decodeURIComponent(runMatch[1])); if (!run) throw new HostError("RUN_NOT_FOUND", "run not found", 404); return json(res, 200, run); }
      if (cancelMatch && req.method === "POST") { await services.runtime.cancel(decodeURIComponent(cancelMatch[1])); return json(res, 202, { accepted: true }); }
      if (req.url === "/v1/events" && req.method === "GET") return json(res, 200, { events: journal.after(Number(req.headers["last-event-id"] ?? 0)), cursor: journal.cursor });
      throw new HostError("HOST_NOT_FOUND", "endpoint not found", 404);
    } catch (raw) { const error = hostError(raw); json(res, error.status, { error: { code: error.code, message: error.message } }); }
  });
  return {
    journal, get url() { return url; },
    listen(port = 0) { return new Promise((resolve) => server.listen(port, "127.0.0.1", () => { const address = server.address(); url = `http://127.0.0.1:${address.port}`; resolve(); })); },
    close() { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); },
  };
}
