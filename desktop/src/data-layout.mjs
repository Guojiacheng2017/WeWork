import { join } from 'node:path';

export function weworkDataLayout(documentsPath) {
  const rootPath = join(documentsPath, 'WeWork');
  const configPath = join(documentsPath, '.wework');
  return {
    rootPath,
    configPath,
    teamsPath: join(rootPath, 'teams'),
    runtimePath: join(configPath, 'runtime'),
  };
}
