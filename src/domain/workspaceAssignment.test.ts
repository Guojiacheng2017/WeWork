import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeWorkspaceAssignment } from './wework';

const vectors = JSON.parse(readFileSync(resolve('test-fixtures/workspace-assignment-conformance.json'), 'utf8')) as Array<{ name: string; input: unknown; valid: boolean; normalized?: unknown }>;

describe('Workspace assignment conformance', () => {
  for (const vector of vectors) it(vector.name, () => {
    if (vector.valid) expect(normalizeWorkspaceAssignment(vector.input)).toEqual(vector.normalized ?? undefined);
    else expect(() => normalizeWorkspaceAssignment(vector.input)).toThrow();
  });
});
