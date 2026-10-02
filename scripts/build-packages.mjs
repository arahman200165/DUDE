import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const packages=new Map(readdirSync(path.join(root,'packages'),{withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>{const dir=entry.name;const manifest=JSON.parse(readFileSync(path.join(root,'packages',dir,'package.json'),'utf8'));return[manifest.name,{dir,manifest}];}));
const ordered=[];const visiting=new Set();const seen=new Set();
function visit(name){if(seen.has(name))return;if(visiting.has(name))throw Error('Workspace dependency cycle: '+name);visiting.add(name);const item=packages.get(name);for(const dep of Object.keys(item.manifest.dependencies??{}))if(packages.has(dep))visit(dep);visiting.delete(name);seen.add(name);ordered.push(item);}
for(const name of packages.keys())visit(name);
for(const {dir}of ordered){const r=spawnSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(root,'packages',dir,'tsconfig.json')],{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);console.log('Built @dude/'+dir);}
if(process.argv.includes('--watch')){
 const children=ordered.map(({dir})=>spawn(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(root,'packages',dir,'tsconfig.json'),'--watch','--preserveWatchOutput'],{stdio:'inherit'}));
 const stop=()=>{for(const child of children)child.kill();};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
