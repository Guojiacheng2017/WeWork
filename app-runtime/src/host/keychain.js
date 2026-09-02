import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { execProcess } from "./process.js";
export class MacKeychainVault {
  constructor(ports = {}) { this.exec = ports.exec ?? execProcess; this.metadata = new Map(); this.service = ports.service ?? "app.wework"; this.metadataPath = ports.metadataPath; }
  async load() { if (!this.metadataPath || this.metadata.size) return; try { for (const item of JSON.parse(await readFile(this.metadataPath, "utf8"))) this.metadata.set(item.ref, item); } catch (error) { if (error.code !== "ENOENT") throw error; } }
  async save() { if (!this.metadataPath) return; await mkdir(dirname(this.metadataPath), { recursive: true }); await writeFile(this.metadataPath, JSON.stringify([...this.metadata.values()]), { mode: 0o600 }); }
  async createCredential({ label, kind, secret }) {
    const ref = `keychain:${randomUUID()}`, account = ref.slice("keychain:".length);
    await this.exec("security", ["add-generic-password", "-U", "-s", this.service, "-a", account, "-l", label, "-w"], { input: secret });
    await this.load(); this.metadata.set(ref, { ref, label, kind }); await this.save(); return { ref };
  }
  async listCredentials() { await this.load(); return [...this.metadata.values()]; }
  async resolveCredential(ref) {
    const account = ref.replace(/^keychain:/, "");
    const { stdout } = await this.exec("security", ["find-generic-password", "-s", this.service, "-a", account, "-w"]);
    return stdout.trim();
  }
}
