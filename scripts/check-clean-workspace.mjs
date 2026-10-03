// Verify the current working tree, not HEAD, in a fresh installation.
import {mkdtempSync,readFileSync,writeFileSync,copyFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),isolated=mkdtempSync(path.join(tmpdir(),'dude31a-clean-'));
const tracked=spawnSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'});
if(tracked.status!==0)throw Error('Cannot enumerate working tree');
for(const file of new Set(tracked.stdout.split('\0').filter(Boolean))){
 const source=path.resolve(root,file),destination=path.resolve(isolated,file);
 if(!source.startsWith(root+path.sep)||!destination.startsWith(isolated+path.sep))throw Error('Copy outside workspace');
 if(!existsSync(source))continue;
 mkdirSync(path.dirname(destination),{recursive:true});copyFileSync(source,destination);
}
function run(bin,args){const result=spawnSync(process.execPath,[bin,...args],{cwd:isolated,stdio:'inherit'});if(result.status!==0)throw Error(`Clean check failed (${result.status}): ${isolated}`);}
const npmCli=process.env.npm_execpath;if(!npmCli)throw Error('Run via npm run check:clean');
console.log('Clean workspace: '+isolated);
run(npmCli,['ci','--offline','--no-audit','--no-fund']);
run(npmCli,['run','build']);
run(npmCli,['run','check:boundaries']);
run(npmCli,['run','check:inventory']);
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
// Angular's service-worker generator deliberately records Date.now() in ngsw.json.
// Compare its complete content with that one build timestamp normalized; all asset hashes remain checked.
function hashes(dir){return Object.fromEntries(files(dir).sort().map(f=>{
 const name=path.relative(dir,f).replaceAll('\\','/');let content=readFileSync(f);
 if(name==='ngsw.json'){const manifest=JSON.parse(content);manifest.timestamp=0;content=JSON.stringify(manifest);}
 return [name,createHash('sha256').update(content).digest('hex')];
}));}
const first=hashes(path.join(isolated,'dist/dude/browser'));
run(npmCli,['run','build']);
const second=hashes(path.join(isolated,'dist/dude/browser'));
const changed=[...new Set([...Object.keys(first),...Object.keys(second)])].filter(name=>first[name]!==second[name]);
if(changed.length)throw Error(`Clean installation builds differ: ${changed.join(', ')}`);
mkdirSync(path.join(root,'tmp'),{recursive:true});
writeFileSync(path.join(root,'tmp/phase31a-clean-evidence.json'),JSON.stringify({workspace:isolated,files:Object.keys(first).length,repeatable:true,normalizedFields:['ngsw.json:timestamp'],hashes:first},null,2)+'\n');
console.log(`Clean installation and two identical production builds pass (${Object.keys(first).length} files).`);
