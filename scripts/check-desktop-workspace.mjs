// Windows acceptance against the compiled production main, preload and renderer.
// Uses an isolated profile and fixture pickers; never installs protocol/login settings.
import { _electron, expect } from '@playwright/test';
import electron from 'electron';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import assert from 'node:assert/strict';

if(process.platform!=='win32')throw Error('Desktop workspace acceptance requires Windows.');
const root=path.resolve(import.meta.dirname,'..');
const indexHtml=readFileSync(path.join(root,'dist/dude/browser/index.html'),'utf8');
if(!indexHtml.includes('<base href="/">'))throw Error('dist/dude/browser was not built for desktop; run: ng build --configuration production,electron (the plain production build uses the /DUDE/ Pages base href).');
const profile=mkdtempSync(path.join(root,'tmp/desktop-workspace-'));
const fixture=path.join(profile,'fixtures');mkdirSync(fixture);
const input=path.join(fixture,'acceptance.json');writeFileSync(input,'{"phase":31,"portable":true}');
writeFileSync(path.join(profile,'desktop-preferences.json'),JSON.stringify({closeToTray:false,updateMode:'manual',startupDestination:'deck'}));
const bootstrap=path.join(profile,'bootstrap.cjs');
writeFileSync(bootstrap,`
 const {app,BrowserWindow,dialog}=require('electron');
 app.setPath('userData',${JSON.stringify(profile)});
 app.setAsDefaultProtocolClient=()=>true;
 app.setLoginItemSettings=()=>{};
 BrowserWindow.prototype.show=function(){};
 BrowserWindow.prototype.focus=function(){};
 dialog.showOpenDialog=async(_window,options)=>({canceled:false,filePaths:[options.properties.includes('openDirectory')?${JSON.stringify(fixture)}:${JSON.stringify(input)}]});
 require(${JSON.stringify(path.join(root,'dist/electron/main.js'))});
`);
const launches=[];
async function launch(args){
 const env={...process.env,DUDE_PERF_LOG:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electron,args:[bootstrap,...args],cwd:root,env,timeout:60000});
 const marks=[];app.process().stdout.on('data',chunk=>marks.push(chunk.toString()));
 const page=await app.firstWindow();page.setDefaultTimeout(30000);
 page.on('pageerror',error=>console.error('Renderer error:',error));
 page.on('console',message=>{if(message.type()==='error')console.error('Renderer console:',message.text());});
 await expect(page.locator('app-sidebar')).toBeVisible();
 return {app,page,marks};
}
const kvValue=(page,namespace,key)=>page.evaluate(async([n,k])=>{
 const boot=await window.dude.store.hydrate();
 return boot.kv.find(e=>e.namespace===n&&e.key===k)?.value;
},[namespace,key]);
// The value must be present in the hydrated store, and the one-shot import must have consumed the legacy key
// (only the appearance mirror may remain in localStorage).
async function expectIndent(page){
 assert.equal(await kvValue(page,'json','indent'),4,'json indent hydrated from the device store');
 assert.equal(await kvValue(page,'__onboarding__','completed'),true,'onboarding completion hydrated from the device store');
 assert.equal(await page.evaluate(()=>localStorage.getItem('dude:v1:json:indent')),null,'legacy localStorage key was consumed by the import');
 const leftovers=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('dude:v1:')));
 assert.ok(leftovers.every(k=>k.includes(':settings:')||k.includes('__device__')||k.includes('appearance')),`unexpected localStorage keys: ${leftovers}`);
 await expect(page.getByText('Device Store unavailable')).toHaveCount(0);
}
let active;
try{
 active=await launch(['dude://open/tool/base64']);
 const {app,page,marks}=active;
 await page.getByRole('button',{name:'Skip for now',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Base64 Encoder / Decoder',exact:true})).toBeVisible();
 assert(page.url().startsWith('dude-app://app/'),`Unexpected renderer URL ${page.url()}`);
 const isolation=await page.evaluate(()=>({desktop:window.dude?.platform.isDesktop,node:typeof window.require}));
 assert.deepEqual(isolation,{desktop:true,node:'undefined'});
 const preferences=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
 assert.equal(preferences.contextIsolation,true);assert.equal(preferences.nodeIntegration,false);assert.equal(preferences.sandbox,true);
 const native=await page.evaluate(async()=>{
  const picked=await window.dude.fs.pickDirectory();if(picked.canceled)throw Error('Fixture picker canceled');
  return {walk:await window.dude.fs.walk(picked.rootPath),helper:await window.dude.sys.call('helper.info',{}),blocked:await window.dude.sys.call('reg.setValue',{}),saved:await window.dude.preferences.set({startupDestination:'workspace'})};
 });
 assert.equal(native.walk.ok,true);assert(native.walk.entries.some(e=>e.path==='acceptance.json'));
 assert.equal(native.helper.ok,true);assert.equal(native.blocked.ok,false);assert.equal(native.saved.ok,true);
 // Exercise the real bounded open-file IPC and renderer handoff.
 await page.evaluate(()=>{window.dude.open.ready();return window.dude.open.pickFile();});
 await expect(page.getByRole('heading',{name:'JSON Formatter',exact:true})).toBeVisible();
 await expect(page.locator('textarea').first()).toHaveValue('{"phase":31,"portable":true}');
 // Seed through the Device Store (the renderer's only durable path), then prove the one-shot legacy
 // localStorage import: clear its marker, plant a legacy key, and reload so the import runs again.
 const seeded=await page.evaluate(async()=>{
  const seed=await window.dude.store.commitKv([
   {namespace:'__onboarding__',key:'completed',value:true,policy:'local'},
   {namespace:'__renderer-import__',key:'done',remove:true,policy:'local'},
  ]);
  localStorage.setItem('dude:v1:json:indent','4');
  return seed;
 });
 assert.equal(seeded.ok,true);
 await page.reload();
 await expect(page.locator('app-sidebar')).toBeVisible();
 await expect(page.getByRole('button',{name:'Skip for now',exact:true})).toHaveCount(0);
 await expectIndent(page);
 launches.push({kind:'cold',marks:marks.join('')});
 await app.close();active=null;
 active=await launch(['--open-with-dude',input]);
 await expect(active.page.getByRole('heading',{name:'JSON Formatter',exact:true})).toBeVisible();
 await expect(active.page.locator('textarea').first()).toHaveValue('{"phase":31,"portable":true}');
 await expectIndent(active.page);
 launches.push({kind:'warm',marks:active.marks.join('')});
 await active.app.close();active=null;
 // Legacy userData import: the seeded JSON was moved to legacy-import/<ts>/ and its values are in the device store.
 const legacyRuns=readdirSync(path.join(profile,'legacy-import'));
 assert.ok(legacyRuns.length>0,'legacy-import/<timestamp> folder exists');
 assert.ok(legacyRuns.some(run=>existsSync(path.join(profile,'legacy-import',run,'desktop-preferences.json'))),'legacy desktop-preferences.json was moved');
 assert.equal(existsSync(path.join(profile,'desktop-preferences.json')),false,'original desktop-preferences.json is gone');
 const db=new DatabaseSync(path.join(profile,'device-store','dude-device.db'),{readOnly:true});
 try{
  const row=db.prepare('SELECT * FROM device_docs WHERE name = ?').get('desktop-preferences');
  assert.ok(row,'device_docs has a desktop-preferences row');
  const stored=JSON.parse(row.value_json);
  assert.equal(stored.closeToTray,false);assert.equal(stored.updateMode,'manual');
  const kv=(namespace,key)=>db.prepare('SELECT * FROM kv WHERE namespace = ? AND key = ?').get(namespace,key);
  const indent=kv('json','indent');
  assert.ok(indent,'kv has the legacy-imported json indent row');
  assert.equal(JSON.parse(indent.value_json),4);assert.equal(indent.policy,'local');assert.equal(indent.scope,'environment','a local tool preference is environment-scoped');
  assert.equal(JSON.parse(kv('__onboarding__','completed').value_json),true,'kv has the commitKv-seeded onboarding row');
  assert.ok(kv('__renderer-import__','done'),'kv has the renderer legacy-import marker');
  assert.ok(db.prepare("SELECT value FROM meta WHERE key = 'device_id'").get(),'meta has a device_id');
 }finally{db.close();}
 writeFileSync(path.join(root,'tmp/phase31a-desktop-evidence.json'),JSON.stringify({profile,fixtureOrigin:'dude-app://app',checks:['production preload isolation','native helper read','mutation read-allowlist rejection','picker grant and walk','deep-link navigation','picker file handoff','command-line file handoff','stable-origin renderer reload and warm persistence','native preference persistence'],launches},null,2)+'\n');
 console.log('Cold/warm production desktop, preload, deep-link, file-open, native helper and isolated saved-state acceptance pass.');
}finally{if(active)await active.app.close();}
