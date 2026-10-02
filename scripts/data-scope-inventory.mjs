// Source-backed inventory only. It never changes retention or authorizes synchronization.
import ts from 'typescript';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { files } from './phase31a-inventory.mjs';
const path='docs/architecture/data-scope-inventory.json';
const entries=[];
const storageMethods=new Set(['setItem','writeFile','writeFileSync','put','add','set','open','openDatabase']);
for(const file of [...files('apps/web/src/app'),...files('apps/desktop')].filter(f=>f.endsWith('.ts')&&!f.endsWith('.spec.ts')&&!/[\\/]testing[\\/]/.test(f))){
 const text=readFileSync(file,'utf8');const sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
 const constants=new Map();
 function collect(n){if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer&&ts.isStringLiteral(n.initializer))constants.set(n.name.text,n.initializer.text);ts.forEachChild(n,collect);}collect(sf);
 const importedSettings=Object.fromEntries([...readFileSync('packages/tool-engine/src/core/persistence/app-settings.ts','utf8').matchAll(/export const (\w+) = '([^']+)'/g)].map(m=>[m[1],m[2]]));
 function visit(n){
  if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)){
   const method=n.expression.name.text;const args=n.arguments;
   const string=i=>args[i]&&ts.isStringLiteral(args[i])?args[i].text:args[i]&&ts.isIdentifier(args[i])?constants.get(args[i].text)??importedSettings[args[i].text]:undefined;
   const policy=string(2);const signal=method==='signal'&&['none','session','local','user-choice','secure-local'].includes(policy);
   const receiver=n.expression.expression.getText(sf);
   const storage=storageMethods.has(method)&&(/Storage|indexedDB|\bfs\b|\bfsp\b|store|journal|database|\bdb\b|secrets|\.local$|\.session$|Backend/i.test(receiver))&&(method!=='open'||/indexedDB/.test(receiver));
   if(signal||storage){
    const namespace=signal?string(0):undefined;const key=signal?string(1):string(0);const local=namespace&&/__(usage|recents|history|scratch|recovery|native)/.test(namespace);
    const workbench=namespace&&/__(projects|pipelines|workspace|templates)/.test(namespace);
    const secret=/secret|credential|password|privateKey|apiKey|llmKey/i.test(key??'')||/secrets|secure-local/.test(file)||/secrets/.test(receiver);
    const input=policy==='none'||policy==='session'||/input|source|payload|body|token|headers|content|notes|customCss|script/i.test(key??'');
    const device=/rootPath|terminal|executable|socket|windowBounds|directory|folder|repositoryRoot/i.test(key??'');
    const safePreference=/^(mode|indent|algorithm|unit|flags|format|theme|appearance|density|accent|palette|font|wrap|sort|encoding|delimiter|precision|language|tabSize)$/i.test(key??'');
    const favorites=namespace==='__favorites__';const mixed=workbench||namespace==='__home-layout__'||namespace==='__home__';
    const scope=secret||input||local?'local-only':device?'device':favorites||safePreference?'environment':workbench?'workspace':'local-only';
    const storageLocation=signal?policy==='none'?'memory only':`${policy==='session'?'sessionStorage':policy==='user-choice'?'sessionStorage; localStorage only after existing retention consent':'localStorage'}: dude:v1:${namespace??'<dynamic namespace>'}:${key??'<dynamic key>'}`:n.getText(sf);
    entries.push({source:file.replaceAll('\\','/'),line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1,operation:n.getText(sf),namespace:namespace??null,key:key??null,storage:signal?'PersistenceService':receiver,storageLocation,retention:signal?policy:'owned by the referenced backend; no policy change',scope,sensitivity:secret?'secret':safePreference||favorites?'non-sensitive':'sensitive',classificationBasis:secret||input||local?'private content/security/activity':device?'machine binding':favorites||safePreference?'workbench preference':workbench?'workbench definition':'checked conservative local classification; promotion requires a separate field/schema review',...(mixed?{fieldScopes:{definition:'workspace',userContent:'local-only',credentials:'local-only',absolutePaths:'device'},identityAndSchema:'Audit stable IDs/schema per existing model in 31B; nested scope is never promoted.'}:{}),syncConsent:'not granted'});
   }
  }
  ts.forEachChild(n,visit);
 }
 visit(sf);
}
entries.sort((a,b)=>a.source.localeCompare(b.source)||a.operation.localeCompare(b.operation));
const entityFile='docs/architecture/data-scope-entities.json';
const entities=JSON.parse(readFileSync(entityFile,'utf8'));
for(const entity of entities){if(!existsSync(entity.source))throw Error('Missing scope evidence '+entity.source);for(const scope of Object.values(entity.fieldScopes??{record:entity.scope}))if(!['environment','workspace','device','local-only'].includes(scope))throw Error('Invalid entity scope '+entity.id);}
const output=JSON.stringify({schemaVersion:2,purpose:'Checked Phase 31A declarations; existing stored records are unchanged. Unknown/dynamic values have a conservative local-only classification. Scope grants no synchronization consent.',entityInventory:entityFile,identityAndSchemaGaps:['No environment/workspace/device identity on legacy records','Stable entity IDs do not establish distributed ownership or revision conflict semantics','Existing schemaVersion values require explicit 31B migration; do not rewrite records in 31A','Mixed records need field selection/redaction before any future sync opt-in','Retention consent is independent of future synchronization consent'],entries},null,2)+'\n';
if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==output)throw Error('Data scope inventory is stale: run node scripts/data-scope-inventory.mjs');}
else writeFileSync(path,output);
console.log(`${entries.length} storage declarations/sites classified; no synchronization consent is implied.`);
