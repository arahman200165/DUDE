// Gate extracted engines AND the existing application confirmation boundaries.
import { readManifests } from './tool-manifests.mjs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const ids=readManifests().map(t=>t.metadata).filter(t=>t.consequenceClass?.length).map(t=>t.id);
if(!ids.length)throw Error('High-consequence inventory is unexpectedly empty');
console.log(`High-consequence gate: portable engines/contracts, then ${ids.length} app confirmation/tool groups.`);
function run(bin,args){const result=spawnSync(process.execPath,[path.join(root,bin),...args],{cwd:root,stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}
run('node_modules/vitest/vitest.mjs',['run','--config','vitest.packages.config.mts']);
run('node_modules/@angular/cli/bin/ng.js',['test',...ids.map(id=>`--include=apps/web/src/app/tools/${id}`),'--watch=false']);
