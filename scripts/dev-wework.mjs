import { spawn } from 'node:child_process';

const children = new Set();
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 250).unref();
}

function launch(command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  children.add(child);
  child.once('exit', (code) => {
    children.delete(child);
    if (!stopping && code) stop(code);
  });
  return child;
}

async function waitForUi(url) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`WeWork UI did not become ready at ${url}`);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

const uiUrl = process.env.WEWORK_UI_DEV_URL ?? 'http://127.0.0.1:5173';
launch('npm', ['run', 'dev:web', '--', '--host', '127.0.0.1']);

try {
  await waitForUi(uiUrl);
  launch('npm', ['--workspace', 'wework-desktop', 'run', 'dev'], {
    env: { ...process.env, WEWORK_UI_DEV_URL: uiUrl },
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  stop(1);
}
