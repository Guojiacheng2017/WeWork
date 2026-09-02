import { spawn } from "node:child_process";
export function scrubHostChildEnvironment(environment = process.env) {
  const result = { ...environment };
  for (const key of Object.keys(result)) if (key.startsWith('WEWORK_HOST_')) delete result[key];
  return result;
}
export function execProcess(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { env: scrubHostChildEnvironment(options.env ?? process.env), stdio: ["pipe", "pipe", "pipe"] });
    const out = [], err = [];
    child.stdout.on("data", (chunk) => out.push(chunk)); child.stderr.on("data", (chunk) => err.push(chunk));
    child.on("error", reject); child.on("close", (code) => code === 0 ? resolve({ stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString() }) : reject(Object.assign(new Error(Buffer.concat(err).toString().trim() || `${file} exited ${code}`), { code: "HOST_PROCESS_FAILED" })));
    if (options.input) child.stdin.end(options.input); else child.stdin.end();
  });
}
