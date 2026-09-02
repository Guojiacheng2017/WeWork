import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {discoverAvailableSkills,loadEmployeeSkills} from '../src/skill-loader.js';

test('discovers real workspace and bundled Skill packages with stable IDs',async()=>{
  const workspace=await mkdtemp(join(tmpdir(),'wework-workspace-skills-'));
  const bundled=await mkdtemp(join(tmpdir(),'wework-bundled-skills-'));
  await mkdir(join(workspace,'skills','quality-review'),{recursive:true});
  await writeFile(join(workspace,'skills','quality-review','SKILL.md'),'---\nname: Quality Review\ndescription: Review evidence safely\n---\n# Instructions');
  await mkdir(join(bundled,'task-routing'),{recursive:true});
  await writeFile(join(bundled,'task-routing','SKILL.md'),'# Task Routing\nRoute work.');
  const skills=await discoverAvailableSkills({workspaceRoot:workspace,bundledRoot:bundled});
  assert.deepEqual(skills.map(({id,name,source})=>({id,name,source})),[
    {id:'quality-review',name:'Quality Review',source:'workspace'},
    {id:'task-routing',name:'Task Routing',source:'wework'},
  ]);
});

test('loads only assigned skill IDs inside the team workspace',async()=>{
  const root=await mkdtemp(join(tmpdir(),'wework-skills-'));
  await mkdir(join(root,'skills','inspect'),{recursive:true});
  await writeFile(join(root,'skills','inspect','SKILL.md'),'# Inspect\nCheck every input.');
  const result=await loadEmployeeSkills([{id:'inspect',name:'Inspect'},{id:'missing',name:'Legacy label'}],{workspaceRoot:root});
  assert.equal(result.loaded[0].content,'# Inspect\nCheck every input.');
  assert.deepEqual(result.unloaded.map(item=>item.id),['missing']);
});

test('exact canonical Skill roots use employee then team precedence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wework-canonical-skills-'));
  const employeeRoot = join(root, 'employees', 'employee', 'skills');
  const teamRoot = join(root, 'team', 'skills');
  await mkdir(join(employeeRoot, 'review'), { recursive: true });
  await mkdir(join(teamRoot, 'review'), { recursive: true });
  await mkdir(join(teamRoot, 'planning'), { recursive: true });
  await writeFile(join(employeeRoot, 'review', 'SKILL.md'), '# Employee Review\nEmployee-specific instructions.');
  await writeFile(join(teamRoot, 'review', 'SKILL.md'), '# Team Review\nTeam instructions.');
  await writeFile(join(teamRoot, 'planning', 'SKILL.md'), '# Planning\nPlan work.');

  const discovered = await discoverAvailableSkills({ skillRoots: [employeeRoot, teamRoot] });
  assert.deepEqual(discovered.map(({ id, name }) => ({ id, name })), [{ id: 'review', name: 'Employee Review' }, { id: 'planning', name: 'Planning' }]);
  const loaded = await loadEmployeeSkills([{ id: 'review', name: 'Review' }], { skillRoots: [employeeRoot, teamRoot] });
  assert.match(loaded.loaded[0].content, /Employee-specific/);
});

test('rejects traversal and symlink escapes from configured skill roots',async()=>{
  const root=await mkdtemp(join(tmpdir(),'wework-skills-'));
  const outside=await mkdtemp(join(tmpdir(),'outside-skill-'));
  await writeFile(join(outside,'SKILL.md'),'outside secret');
  await mkdir(join(root,'skills'));
  await symlink(outside,join(root,'skills','escape'),'dir');
  const result=await loadEmployeeSkills([{id:'../escape',name:'Bad'},{id:'escape',name:'Bad'}],{workspaceRoot:root});
  assert.equal(result.loaded.length,0);
  assert.equal(result.unloaded.length,2);
});
