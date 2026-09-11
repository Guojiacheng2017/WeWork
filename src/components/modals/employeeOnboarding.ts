import type { HarnessId } from '../../runtime/weworkHost';

type HarnessItem = { harness: HarnessId };
type ModelItem = { id: string; harness: HarnessId };

export function initialHarnessForOnboarding(ready: HarnessItem[], models: ModelItem[]) {
  const eligible = ready.filter((item) => item.harness === 'smalldashharness' || models.some((model) => model.harness === item.harness));
  return eligible.find((item) => item.harness === 'smalldashharness')?.harness ?? eligible[0]?.harness;
}

export function initialModelRefForOnboarding(harness: HarnessId, models: ModelItem[], defaults: Partial<Record<HarnessId, string>>) {
  if (harness === 'smalldashharness') return '';
  const harnessModels = models.filter((model) => model.harness === harness);
  return harnessModels.find((model) => model.id === defaults[harness])?.id ?? harnessModels[0]?.id ?? '';
}

export function canSubmitEmployeeOnboarding(input: {
  saving: boolean;
  loading: boolean;
  displayName: string;
  roleName: string;
  harness: HarnessId;
  modelRef: string;
  harnessReady: boolean;
}) {
  return !input.saving
    && !input.loading
    && input.harnessReady
    && Boolean(input.displayName.trim())
    && Boolean(input.roleName.trim())
    && (input.harness === 'smalldashharness' || Boolean(input.modelRef));
}
