import { homedir } from 'node:os';
import { join } from 'node:path';
import { TeamPartitionedWeWorkStorage, safeTeamDirectory } from '../src/host/team-partitioned-wework-storage.js';
import { archiveBusinessState } from '../src/host/archive-business-state.js';

const weworkRoot = process.env.WEWORK_APP_DATA_DIR ?? join(homedir(), 'Documents', 'WeWork');
const configRoot = process.env.WEWORK_CONFIG_DIR ?? join(homedir(), 'Documents', '.wework');
const storage = new TeamPartitionedWeWorkStorage(weworkRoot, {
  indexPath: join(configRoot, 'wework-index.json'),
  teamPath: (teamId, file) => join(weworkRoot, teamId, '.wework-state', file),
  legacyPath: join(homedir(), '.wework', 'wework.json'),
  legacySources: [
    { indexPath: join(weworkRoot, 'wework-index.json'), legacyPath: join(weworkRoot, 'wework.json'), teamPath: (teamId, file) => join(weworkRoot, 'teams', safeTeamDirectory(teamId), file) },
    { indexPath: join(homedir(), '.wework', 'wework-index.json'), legacyPath: join(homedir(), '.wework', 'wework.json'), teamPath: (teamId, file) => join(homedir(), '.wework', 'teams', safeTeamDirectory(teamId), file) },
  ],
});

console.log(JSON.stringify(archiveBusinessState({ storage, weworkRoot, archiveRoot: join(configRoot, 'legacy-demo') })));
