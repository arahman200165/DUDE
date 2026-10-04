// Build and consume the eleven portable workspaces in a separate installation with no apps/hosts.
import {cpSync,mkdtempSync,readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readManifests} from './tool-manifests.mjs';
const repo=path.resolve(import.meta.dirname,'..'), isolated=mkdtempSync(path.join(tmpdir(),'dude31a-core-'));
const root=JSON.parse(readFileSync(path.join(repo,'package.json'),'utf8'));
const packageNames=['shared-types','domain','contracts','validation','crypto','tool-engine','tool-registry','sync','api-client','persistence','hub-backup'];
for(const name of packageNames){const destination=path.join(isolated,'packages',name);cpSync(path.join(repo,'packages',name),destination,{recursive:true,filter:f=>!/[\\/](dist|node_modules)([\\/]|$)/.test(f)});}
cpSync(path.join(repo,'tsconfig.packages.json'),path.join(isolated,'tsconfig.packages.json'));
writeFileSync(path.join(isolated,'package.json'),JSON.stringify({name:'dude-portable-consumption',private:true,type:'module',workspaces:['packages/*'],engines:root.engines,packageManager:root.packageManager,devDependencies:{typescript:JSON.parse(readFileSync(path.join(repo,'node_modules/typescript/package.json'),'utf8')).version}},null,2));
// Pin the offline install to the root lockfile: without it npm re-resolves ranges from cached
// metadata and can pick versions whose tarballs `npm ci` never cached. npm prunes the app/host
// entries this smaller workspace set doesn't reach (the forbidden-host check below still applies).
cpSync(path.join(repo,'package-lock.json'),path.join(isolated,'package-lock.json'));
const npmCli=process.env.npm_execpath;if(!npmCli)throw Error('Run through npm run check:portable');
function run(bin,args){const result=spawnSync(process.execPath,[bin,...args],{cwd:isolated,stdio:'inherit'});if(result.status!==0)throw Error(`Portable check failed (${result.status}) in ${isolated}`);}
run(npmCli,['install','--offline','--ignore-scripts','--no-audit','--no-fund']);
for(const forbidden of ['@angular','electron','@dude/web','@dude/desktop','@dude/collab-protocol','@dude/sqlite-store','@dude/agent-pipe','@dude/device-agent','@dude/hub','node:sqlite'])if(existsSync(path.join(isolated,'node_modules',forbidden)))throw Error('Forbidden host installed: '+forbidden);
const manifests=new Map(packageNames.map(name=>{const m=JSON.parse(readFileSync(path.join(isolated,'packages',name,'package.json'),'utf8'));return[m.name,{name,m}];}));
const seen=new Set(),visiting=new Set();
function build(id){if(seen.has(id))return;if(visiting.has(id))throw Error('Portable dependency cycle');visiting.add(id);const{name,m}=manifests.get(id);for(const dep of Object.keys(m.dependencies??{}))if(manifests.has(dep))build(dep);run(path.join(isolated,'node_modules/typescript/bin/tsc'),['-p',`packages/${name}/tsconfig.json`]);visiting.delete(id);seen.add(id);}
for(const id of manifests.keys())build(id);
writeFileSync(path.join(isolated,'consumer.ts'),`import { TOOL_METADATA } from '@dude/tool-registry';
import { encodeBase64 } from '@dude/crypto';
import { isDataScope, type DataScope } from '@dude/domain';
import type { EngineHostPorts, PlatformBridgePort } from '@dude/contracts';
import { pipelineStep } from '@dude/tool-engine/tools/base64/base64.pipeline-step';
import '@dude/validation'; import '@dude/api-client'; import '@dude/hub-backup';
import { uuidv7, resolveToolKeyScope } from '@dude/persistence';
import { coalesceOutbox } from '@dude/sync';
if (typeof uuidv7 !== 'function' || typeof coalesceOutbox !== 'function' || resolveToolKeyScope('local') !== 'environment') throw Error('Persistence consumer mismatch');
const scope: DataScope = 'workspace';
const encoded = encodeBase64('DUDE');
if (!isDataScope(scope) || !encoded.ok || encoded.value !== 'RFVERQ==' || TOOL_METADATA.length !== ${readManifests().length}) throw Error('Portable consumer mismatch');
// @ts-expect-error Registry metadata must expose no UI loader.
type NoUiLoader = typeof TOOL_METADATA[number]['load'];
await pipelineStep.run({type:'text',value:'DUDE'});
type Ports = [EngineHostPorts, PlatformBridgePort];
export type { Ports };
`);
writeFileSync(path.join(isolated,'tsconfig.consumer.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',strict:true,skipLibCheck:true,outDir:'consumer-dist',lib:['ES2022','DOM']},files:['consumer.ts']}));
run(path.join(isolated,'node_modules/typescript/bin/tsc'),['-p','tsconfig.consumer.json']);
run(path.join(isolated,'consumer-dist/consumer.js'),[]);
writeFileSync(path.join(isolated,'runtime-exports.mjs'),`import {readdirSync} from 'node:fs';
import path from 'node:path';
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
let count=0;const failures=[];
for(const name of ${JSON.stringify(packageNames)})for(const file of files('packages/'+name+'/dist').filter(f=>f.endsWith('.js'))){
const relative=path.relative('packages/'+name+'/dist',file).replaceAll('\\\\','/').replace(/\\.js$/,'');
try { await import('@dude/'+name+(relative==='index'?'':'/'+relative));count++; }
catch(error){failures.push(file+': '+error.message);}}
if(failures.length)throw Error(failures.join('\\n'));
console.log(count+' ESM export modules import without application hosts.');
`);
run(path.join(isolated,'runtime-exports.mjs'),[]);
console.log(`Independent builds, exported declarations and ESM consumption pass without Angular/Electron: ${isolated}`);
