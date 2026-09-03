import {build} from 'esbuild';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {copyFile,cp,mkdir,rm} from 'node:fs/promises';

const desktop=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function buildRuntime() {
  const nodePaths=[resolve(desktop,'node_modules'),resolve(desktop,'../node_modules')];
  await build({entryPoints:[resolve(desktop,'../app-runtime/src/host-main.js')],bundle:true,platform:'node',format:'cjs',outfile:resolve(desktop,'runtime-dist/host-main.cjs'),nodePaths});
  await build({entryPoints:[resolve(desktop,'../../smalldashharness/harness/wework-runner.js')],bundle:true,platform:'node',format:'esm',outfile:resolve(desktop,'runtime-dist/sdh-runner.mjs'),nodePaths});
  await copyFile(resolve(desktop,'../app-runtime/src/pi-wework-extension.mjs'),resolve(desktop,'runtime-dist/pi-wework-extension.mjs'));
  const skillsTarget=resolve(desktop,'runtime-dist/skills');
  await rm(skillsTarget,{recursive:true,force:true});
  await mkdir(skillsTarget,{recursive:true});
  await cp(resolve(desktop,'../../smalldashharness/harness/skills'),skillsTarget,{recursive:true});
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await buildRuntime();
