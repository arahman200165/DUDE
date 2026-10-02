import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { files, source, imports, resolveImport, hostReasons } from './phase31a-inventory.mjs';
const failures=[];
// Node-only packages: exempt from the portable (no Node built-ins / host globals) rules; never consumed by web or portable packages.
const nodeOnly=new Set(['collab-protocol','sqlite-store','agent-pipe']);
for(const app of ['web','desktop','collab-relay','device-agent','hub']){
 const manifest=JSON.parse(readFileSync(`apps/${app}/package.json`,'utf8'));
 const declared={...manifest.dependencies,...manifest.devDependencies};
 for(const file of files(`apps/${app}`).filter(f=>f.endsWith('.ts')&&!/[\\/](dist|node_modules)[\\/]/.test(f))){
  for(const imp of imports(source(file))){
   if(app==='web'&&(imp.text==='node:sqlite'||imp.text==='sqlite'))failures.push(`${file}: web must not import ${imp.text}`);
   if(app==='hub'&&imp.text.startsWith('.')&&path.relative('apps/hub',path.resolve(path.dirname(file),imp.text)).startsWith('..'))failures.push(`${file}: hub must not import outside apps/hub (${imp.text})`);
   if(imp.text.startsWith('.')||imp.text.startsWith('node:'))continue;
   const name=imp.text.startsWith('@')?imp.text.split('/').slice(0,2).join('/'):imp.text.split('/')[0];
   if(name!==manifest.name&&!declared[name])failures.push(`${file}: undeclared application dependency ${name}`);
   if(app==='device-agent'&&(name==='electron'||name.startsWith('@angular/')))failures.push(`${file}: device-agent must not import ${imp.text}`);
   if(app==='device-agent'&&!['@dude/persistence','@dude/sync','@dude/contracts','@dude/domain','@dude/shared-types','@dude/sqlite-store','@dude/agent-pipe','@dude/api-client','@dude/device-agent'].includes(name)&&name.startsWith('@dude/'))failures.push(`${file}: device-agent may only depend on persistence, sync, contracts, domain, shared-types, sqlite-store, agent-pipe, api-client (${imp.text})`);
   if(app==='hub'&&(name==='electron'||name.startsWith('@angular/')||['@dude/web','@dude/desktop','@dude/device-agent'].includes(name)))failures.push(`${file}: hub must not import ${imp.text}`);
   if((app==='web'||app==='device-agent'||app==='desktop')&&name==='@dude/hub')failures.push(`${file}: ${app} must not import @dude/hub`);
   if(app==='web'&&(imp.text.startsWith('@dude/sqlite-store')||imp.text.startsWith('@dude/agent-pipe')))failures.push(`${file}: web must not import ${imp.text}`);
   if(app==='web'&&(imp.text.startsWith('@dude/device-agent')))failures.push(`${file}: web must not import ${imp.text}`);
  }
 }
}
for(const pkg of readdirSync('packages',{withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>entry.name)){
 const manifest=JSON.parse(readFileSync(`packages/${pkg}/package.json`,'utf8'));const declared={...manifest.dependencies,...manifest.devDependencies};
 for(const file of files(`packages/${pkg}/src`).filter(f=>f.endsWith('.ts'))){
  const isTest=file.endsWith('.spec.ts');
  const sf=source(file);
  for(const imp of imports(sf)){
   const s=imp.text;
   if(/^(@angular\/|electron$)/.test(s))failures.push(`${file}: framework import ${s}`);
   if(!isTest&&!nodeOnly.has(pkg)&&(s.startsWith('node:')||['fs','path','os','stream','crypto','buffer','util','events','http','https','net','tls','worker_threads','child_process','module','zlib'].includes(s)))failures.push(`${file}: Node-only import ${s}`);
   if(s.startsWith('.')){const dep=resolveImport(path.resolve(file),s.replace(/\.js$/,'.ts'));if(dep&&dep.includes(path.sep+'apps'+path.sep))failures.push(`${file}: application import ${s}`);}
   else if(!s.startsWith('node:')){const name=s.startsWith('@')?s.split('/').slice(0,2).join('/'):s.split('/')[0];if(name!==manifest.name&&!declared[name])failures.push(`${file}: undeclared dependency ${name}`);}
   if(s.startsWith('@dude/hub'))failures.push(`${file}: portable package imports @dude/hub`);
   if(pkg!=='sqlite-store'&&s.startsWith('@dude/sqlite-store'))failures.push(`${file}: portable package imports Node-only ${s}`);
   if(pkg!=='agent-pipe'&&s.startsWith('@dude/agent-pipe'))failures.push(`${file}: portable package imports Node-only ${s}`);
   if(pkg==='tool-registry'&&/^@dude\/(tool-engine|collab-protocol|sqlite-store|agent-pipe|web|desktop)/.test(s))failures.push(`${file}: registry imports implementation ${s}`);
  }
  if(!isTest&&!nodeOnly.has(pkg))for(const reason of hostReasons(sf))failures.push(`${file}: ${reason}`);
  if(!isTest&&!nodeOnly.has(pkg)){
   const declared=new Set();
   function collect(n){if((ts.isVariableDeclaration(n)||ts.isParameter(n))&&ts.isIdentifier(n.name))declared.add(n.name.text);ts.forEachChild(n,collect);}collect(sf);
   function visit(n){
    if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='fetch')failures.push(`${file}: direct request host; use EngineHostPorts`);
    if(ts.isPropertyAccessExpression(n)&&ts.isIdentifier(n.expression)&&['crypto','globalThis','window','self'].includes(n.expression.text)&&!declared.has(n.expression.text))failures.push(`${file}: direct host global ${n.getText(sf)}`);
    if(ts.isNewExpression(n)&&ts.isIdentifier(n.expression)&&['CompressionStream','DecompressionStream','Worker','Blob','DOMParser','OffscreenCanvas'].includes(n.expression.text))failures.push(`${file}: direct host constructor ${n.expression.text}`);
    if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword&&!ts.isStringLiteral(n.arguments[0]))failures.push(`${file}: nonliteral dynamic import`);
    ts.forEachChild(n,visit);
   }visit(sf);
  }
 }
 for(const file of files(`packages/${pkg}/dist`).filter(f=>f.endsWith('.d.ts')||f.endsWith('.js'))){
  for(const imp of imports(source(file)))if(/@angular\/|electron$|(^|\/)apps\//.test(imp.text))failures.push(`${file}: forbidden emitted import ${imp.text}`);
 }
 for(const entry of Object.values(manifest.exports??{}))if(typeof entry==='object'&&entry.types&&!entry.types.includes('*')&&!existsSync(path.join('packages',pkg,entry.types)))failures.push(`@dude/${pkg}: missing declaration export ${entry.types}`);
}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log('Portable package imports, declarations and dependency boundaries pass.');
