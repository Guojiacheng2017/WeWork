import { describe, expect, it } from 'vitest';
import { canSubmitEmployeeOnboarding, initialHarnessForOnboarding, initialModelRefForOnboarding } from './employeeOnboarding';

describe('employee onboarding submission', () => {
  const valid = { saving: false, loading: false, displayName: '林知远', roleName: '算法工程师' };

  it('accepts a ready SDH Harness without a catalog model', () => {
    expect(canSubmitEmployeeOnboarding({ ...valid, harness: 'smalldashharness', modelRef: '', harnessReady: true })).toBe(true);
  });

  it('rejects missing or unresolved Harnesses even when SDH remains the form default', () => {
    expect(canSubmitEmployeeOnboarding({ ...valid, harness: 'smalldashharness', modelRef: '', harnessReady: false })).toBe(false);
  });

  it('requires a model for non-SDH Harnesses', () => {
    expect(canSubmitEmployeeOnboarding({ ...valid, harness: 'pi', modelRef: '', harnessReady: true })).toBe(false);
    expect(canSubmitEmployeeOnboarding({ ...valid, harness: 'pi', modelRef: 'pi:model', harnessReady: true })).toBe(true);
  });

  it('rejects incomplete, loading and duplicate submissions', () => {
    expect(canSubmitEmployeeOnboarding({ ...valid, harness: 'smalldashharness', modelRef: '', harnessReady: true, loading: true })).toBe(false);
    expect(canSubmitEmployeeOnboarding({ ...valid, harness: 'smalldashharness', modelRef: '', harnessReady: true, saving: true })).toBe(false);
    expect(canSubmitEmployeeOnboarding({ ...valid, harness: 'smalldashharness', modelRef: '', harnessReady: true, displayName: ' ' })).toBe(false);
  });
});

describe('employee onboarding defaults', () => {
  const models = [
    { id: 'pi:model', harness: 'pi' as const },
    { id: 'sdh:model', harness: 'smalldashharness' as const },
  ];

  it('prefers ready SDH even when another Harness was detected first', () => {
    expect(initialHarnessForOnboarding([
      { harness: 'pi' as const },
      { harness: 'smalldashharness' as const },
    ], models)).toBe('smalldashharness');
  });

  it('follows the SDH-owned default until the user explicitly selects a model', () => {
    expect(initialModelRefForOnboarding('smalldashharness', models, { smalldashharness: 'sdh:model' })).toBe('');
    expect(initialModelRefForOnboarding('pi', models, { pi: 'pi:model' })).toBe('pi:model');
  });
});
