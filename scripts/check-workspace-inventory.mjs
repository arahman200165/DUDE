// Resolve every captured source to its final owner and validate registry/binding structure.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {files,source,imports,resolveImport,hostReasons,classify} from './phase31a-inventory.mjs';
import {readManifests} from './tool-manifests.mjs';
const posix=p=>p.replaceAll('\\','/');
const inventoryPath='docs/architecture/phase31a-extraction-inventory.json';
const moves=new Map();
for(const file of files('tests/extraction').filter(f=>f.endsWith('.json')&&!posix(f).includes('/components/'))){
 for(const pair of JSON.parse(readFileSync(file,'utf8'))){if(!Array.isArray(pair)||pair.length!==2)throw Error('Invalid move inventory '+file);moves.set(pair[0],pair[1]);}
}
function destination(file){const seen=new Set();while(moves.has(file)&&!existsSync(file)){if(seen.has(file))throw Error('Unresolved move cycle '+file);seen.add(file);file=moves.get(file);}return file;}
const components=JSON.parse(readFileSync('tests/extraction/components/engines.json','utf8'));
const prior=JSON.parse(readFileSync(inventoryPath,'utf8'));
const originals=Array.isArray(prior)?prior.map(e=>e.source):prior.modules.map(e=>e.source);
const modules=[];
for(const original of new Set([...originals,...moves.keys()].filter(f=>!f.startsWith('packages/')))){
 let current=destination(original);
 if(current.endsWith('.manifest.ts')&&current.startsWith('apps/web/src/app/tools/'))current=current.replace('apps/web/src/app/tools/','packages/tool-registry/src/tools/');
 if(!existsSync(current))throw Error('Unresolved extraction source '+original+' -> '+current);
 const sf=source(current),reasons=hostReasons(sf);
 modules.push({source:original,destination:current,classification:current.startsWith('packages/')?'portable':current.startsWith('tests/')||/[\\/]testing[\\/]|\.d\.ts$|\.spec\.ts$/.test(current)?'application-test-or-declaration':'host-adapter',hostDependencies:reasons,tests:current.endsWith('.spec.ts')?[current]:files(path.dirname(current)).filter(f=>f.endsWith('.spec.ts')&&path.basename(f).startsWith(path.basename(current).replace(/\.ts$/,''))).map(posix),remainingAdapterCode:current.startsWith('apps/')?current:null});
}
const baseline=JSON.parse(readFileSync('docs/architecture/phase31a-registry-baseline.json','utf8'));
const metadata=readManifests();
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));return value;}
if(process.argv.includes('--baseline')&&JSON.stringify(canonical(baseline))!==JSON.stringify(canonical(metadata.map(t=>t.metadata))))throw Error('Registry metadata differs from the immutable baseline');
const allPackageFiles=files('packages').filter(f=>f.endsWith('.ts')&&!/[\\/](dist|node_modules)[\\/]/.test(f));
const registeredIds=new Set(metadata.map(t=>t.metadata.id));
for(const file of allPackageFiles){const match=posix(file).match(/^packages\/tool-engine\/src\/tools\/([^/]+)\//);if(match&&!registeredIds.has(match[1]))throw Error('Engine has no manifest/binding registration: '+match[1]);}
const dependencyCache=new Map();
function packageDependencies(file){
 if(dependencyCache.has(file))return dependencyCache.get(file);
 const deps=[];
 for(const imp of imports(source(file))){
  let target;
  if(imp.text.startsWith('.'))target=resolveImport(path.resolve(file),imp.text.replace(/\.js$/,'.ts'));
  else if(imp.text.startsWith('@dude/')){const [name,...segments]=imp.text.slice(6).split('/');target=`packages/${name}/src/${segments.length?segments.join('/'):'index'}.ts`;}
  if(target&&existsSync(target)&&posix(target).includes('packages/'))deps.push(posix(path.relative(process.cwd(),path.resolve(target))));
 }
 dependencyCache.set(file,deps);return deps;
}
function engineClosure(roots){const found=new Set(),pending=[...roots];while(pending.length){const file=pending.pop();if(found.has(file))continue;found.add(file);pending.push(...packageDependencies(file));}return found;}
const tools=[];
for(const {metadata:m,file} of metadata){
 const appDir=`apps/web/src/app/tools/${m.id}`,binding=`${appDir}/${m.id}.bindings.ts`;
 if(!existsSync(binding))throw Error('Missing binding '+m.id);
 const sf=source(binding);let id;const loaders=[];
 function visit(n){
  if(ts.isVariableDeclaration(n)&&n.name.getText(sf)==='bindingId'&&n.initializer&&ts.isStringLiteral(n.initializer))id=n.initializer.text;
  if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword){if(!ts.isStringLiteral(n.arguments[0]))throw Error('Nonliteral lazy binding '+m.id);const target=resolveImport(path.resolve(binding),n.arguments[0].text);if(!target)throw Error('Unresolved lazy binding '+binding);loaders.push(posix(path.relative(process.cwd(),target)));}
  ts.forEachChild(n,visit);
 }visit(sf);
 if(id!==m.id||!loaders.length)throw Error('Mismatched or empty UI binding '+m.id);
 if(m.settingsSection&&loaders.length<2)throw Error('Missing settings loader '+m.id);
 const engineModules=allPackageFiles.filter(f=>posix(f).includes(`/tools/${m.id}/`)&&!f.endsWith('.spec.ts')&&!f.endsWith('.manifest.ts')).map(posix);
 const adapters=files(appDir).filter(f=>f.endsWith('.ts')&&!f.endsWith('.spec.ts')&&!f.endsWith('.bindings.ts')).map(posix);
 const tests=[...allPackageFiles.filter(f=>posix(f).includes(`/tools/${m.id}/`)&&f.endsWith('.spec.ts')).map(posix),...files(appDir).filter(f=>f.endsWith('.spec.ts')).map(posix)];
 const requirements=new Set();
 for(const engine of engineClosure(engineModules)){const text=readFileSync(engine,'utf8');for(const [name,label] of [['hostCrypto','WebCrypto'],['hostFetch','request host/network'],['hostCompression','compression streams'],['hostSanitizeHtml','DOM sanitizer adapter'],['hostHtmlEntities','DOM entity parser adapter'],['hostDecodeImage','image decoder adapter'],['hostXxhash','xxhash WASM adapter']])if(text.includes(name))requirements.add(label);}
 for(const adapter of adapters){for(const reason of hostReasons(source(adapter)))if(reason.startsWith('host API:'))requirements.add(reason.replace('host API:','application'));}
 for(const capability of m.capabilities??[])requirements.add(`${capability.kind}: ${capability.id}; web ${capability.web}`);
 if(m.execution?.worker)requirements.add(`browser worker ${m.execution.worker}`);
 tools.push({id:m.id,route:m.route,manifest:posix(path.relative(process.cwd(),file)),binding,engineModules,adapters,tests,runtimeRequirements:[...requirements].sort(),unsupportedHosts:['Mobile execution is not verified; host facilities must be supplied explicitly'],registration:engineModules.length?'portable engines plus application bindings':'shared engines or application capability adapter',mobileVerified:false});
}
const portableRemainders=[...classify().values()].filter(item=>!item.reasons.length&&!/[\\/]testing[\\/]|\.d\.ts$|tool-definition\.model\.ts$|markdown-body\.styles\.ts$/.test(item.file));
if(portableRemainders.length)throw Error('Unresolved portable application modules: '+portableRemainders.map(item=>item.file).join(', '));
modules.sort((a,b)=>a.source.localeCompare(b.source));
const output=JSON.stringify({schemaVersion:2,baseline:'phase31a-registry-baseline.json',modules,embeddedComponentEngines:components.map(c=>({source:c.source,destination:c.destination,functions:c.functions.map(f=>f.name),methods:c.methods.map(f=>f.name),remainingAdapterCode:c.source})),tools},null,2)+'\n';
if(process.argv.includes('--check')){if(readFileSync(inventoryPath,'utf8')!==output)throw Error('Extraction inventory is stale');}else writeFileSync(inventoryPath,output);
console.log(`${modules.length} resolved sources, ${components.length} component extractions and ${tools.length} matching registry/binding registrations checked.`);
