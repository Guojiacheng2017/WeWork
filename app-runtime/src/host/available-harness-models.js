import { discoverPiModels } from './pi-model-discovery.js';

export const mapSdhModel = ({ baseUrl: _internalModelUrl, ...model }) => ({
  ...model,
  harness: 'smalldashharness',
  api: 'openai-completions',
  source: 'harness-discovered',
});

export async function listAvailableHarnessModels({ detector, sdh, discoverPi = discoverPiModels }) {
  const models = [];
  const defaults = {};
  const installations = await detector.detect();
  const pi = installations.find((item) => item.harness === 'pi' && item.executionReady && item.executablePath);

  if (pi) {
    try {
      const catalog = await discoverPi(pi.executablePath);
      models.push(...(catalog.models ?? []));
      Object.assign(defaults, catalog.defaults ?? {});
    } catch {
      // Installation remains visible even when Pi has no authenticated model catalog.
    }
  }

  try {
    const catalog = await sdh.models();
    models.push(...(catalog.models ?? []).map(mapSdhModel));
    if (catalog.defaultId) defaults.smalldashharness = catalog.defaultId;
  } catch {
    // Remote SDH is optional and must not hide local Harness models.
  }

  return { models, defaults };
}
