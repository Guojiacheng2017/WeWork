import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';

const validId=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const metadata=(id,content)=>{
  const frontmatter=content.match(/^---\s*\n([\s\S]*?)\n---/i)?.[1] ?? '';
  const field=(name)=>frontmatter.match(new RegExp(`^${name}:\\s*["']?(.+?)["']?\\s*$`,'mi'))?.[1]?.trim();
  const title=content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return {name:field('name') ?? title ?? id,description:field('description') ?? ''};
};

const approvedSkillRoots=({skillRoots=[],workspaceRoot,bundledRoot})=>{
  const roots=[...skillRoots.map(root=>[root,'workspace']),workspaceRoot&&[join(workspaceRoot,'skills'),'workspace'],bundledRoot&&[bundledRoot,'wework']].filter(Boolean);
  return roots.filter(([root],index)=>roots.findIndex(([candidate])=>candidate===root)===index);
};

export async function discoverAvailableSkills({workspaceRoot,bundledRoot,skillRoots=[]}) {
  const discovered=[];
  for(const [root,source] of approvedSkillRoots({skillRoots,workspaceRoot,bundledRoot})) {
    try {
      const canonicalRoot=await realpath(root);
      for(const entry of await readdir(canonicalRoot,{withFileTypes:true})) {
        if(!entry.isDirectory() || !validId.test(entry.name))continue;
        try {
          const file=await realpath(join(canonicalRoot,entry.name,'SKILL.md'));
          const rel=relative(canonicalRoot,file); if(rel.startsWith('..') || isAbsolute(rel))continue;
          const info=await stat(file); if(!info.isFile() || info.size>65536)continue;
          const content=await readFile(file,'utf8');
          discovered.push({id:entry.name,...metadata(entry.name,content),source});
        } catch(error) {if(error.code!=='ENOENT' && error.code!=='ENOTDIR')throw error;}
      }
    } catch(error) {if(error.code!=='ENOENT' && error.code!=='ENOTDIR')throw error;}
  }
  return discovered.filter((skill,index,all)=>all.findIndex(item=>item.id===skill.id)===index);
}

export async function loadEmployeeSkills(skills = [], { workspaceRoot, bundledRoot, skillRoots = [] }) {
  const loaded=[],unloaded=[];
  let bytes=0;
  for(const skill of skills) {
    if(!validId.test(skill.id)) {unloaded.push({...skill,reason:'Invalid skill ID'});continue;}
    let content;
    for(const [root] of approvedSkillRoots({skillRoots,workspaceRoot,bundledRoot})) {
      try {
        const canonicalRoot=await realpath(root);
        const file=await realpath(join(root,skill.id,'SKILL.md'));
        const rel=relative(canonicalRoot,file);
        if(rel.startsWith('..') || isAbsolute(rel)) continue;
        const info=await stat(file);
        if(!info.isFile() || info.size>65536 || bytes+info.size>262144)continue;
        content=await readFile(file,'utf8'); bytes+=Buffer.byteLength(content);break;
      } catch(error) {if(error.code!=='ENOENT' && error.code!=='ENOTDIR')throw error;}
    }
    if(content!==undefined)loaded.push({...skill,content});
    else unloaded.push({...skill,reason:'No readable SKILL.md within approved roots and size budget'});
  }
  return {loaded,unloaded};
}
