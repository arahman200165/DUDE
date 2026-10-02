// Derive explicit dependencies from imports, preserving the root's existing version pins.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { files, source, imports } from './phase31a-inventory.mjs';
const root=JSON.parse(readFileSync('package.json','utf8'));const versions={...root.dependencies,...root.devDependencies};
for(const family of ['apps','packages'])for(const dir of readdirSync(family)){
 const manifestFile=`${family}/${dir}/package.json`;if(!existsSync(manifestFile))continue;const manifest=JSON.parse(readFileSync(manifestFile,'utf8'));const deps={},dev={};
 for(const file of files(`${family}/${dir}`).filter(f=>f.endsWith('.ts')&&!/[\\/](dist|node_modules)[\\/]/.test(f))){
  const test=/\.spec\.ts$|[\\/]testing[\\/]/.test(file);for(const imp of imports(source(file))){
   const s=imp.text;if(s.startsWith('.')||s.startsWith('node:'))continue;const name=s.startsWith('@')?s.split('/').slice(0,2).join('/'):s.split('/')[0];if(name===manifest.name)continue;
   const version=name.startsWith('@dude/')?'*':versions[name];if(!version)throw Error('Unpinned dependency '+name+' in '+file);(test?dev:deps)[name]=version;
  }
 }
 for(const name of manifest.dude?.assetDependencies??[])deps[name]=versions[name];
 for(const name of Object.keys(deps)){delete dev[name];const types='@types/'+name.replace(/^@/,'').replace('/','__');if(versions[types])dev[types]=versions[types];}
 manifest.dependencies=Object.fromEntries(Object.entries(deps).sort());manifest.devDependencies=Object.fromEntries(Object.entries(dev).sort());writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
}
