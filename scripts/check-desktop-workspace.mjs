// Windows acceptance against the compiled production main, preload and renderer.
// Uses an isolated profile and fixture pickers; never installs protocol/login settings.
import { _electron, expect } from '@playwright/test';
import electron from 'electron';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';

if(process.platform!=='win32')throw Error('Desktop workspace acceptance requires Windows.');
const root=path.resolve(import.meta.dirname,'..');
const profile=mkdtempSync(path.join(root,'tmp/desktop-workspace-'));
const fixture=path.join(profile,'fixtures');mkdirSync(fixture);
const input=path.join(fixture,'acceptance.json');writeFileSync(input,'{"phase":31,"portable":true}');
writeFileSync(path.join(profile,'desktop-preferences.json'),JSON.stringify({closeToTray:false,updateMode:'manual',startupDestination:'deck'}));
// Keep the fixture origin stable across cold/warm launches so renderer persistence
// is tested independently of the production server's OS-assigned port policy.
const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const bootstrap=path.join(profile,'bootstrap.cjs');
writeFileSync(bootstrap,`
 const {app,BrowserWindow,dialog}=require('electron');
 app.setPath('userData',${JSON.stringify(profile)});
 app.setAsDefaultProtocolClient=()=>true;
 app.setLoginItemSettings=()=>{};
 BrowserWindow.prototype.show=function(){};
 BrowserWindow.prototype.focus=function(){};
 dialog.showOpenDialog=async(_window,options)=>({canceled:false,filePaths:[options.properties.includes('openDirectory')?${JSON.stringify(fixture)}:${JSON.stringify(input)}]});
 const {Server}=require('node:net'),listen=Server.prototype.listen;
 Server.prototype.listen=function(...args){if(args[0]===0&&args[1]==='127.0.0.1')args[0]=${port};return listen.apply(this,args);};
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
let active;
try{
 active=await launch(['dude://open/tool/base64']);
 const {app,page,marks}=active;
 await page.getByRole('button',{name:'Skip for now',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Base64 Encoder / Decoder',exact:true})).toBeVisible();
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
 await page.evaluate(()=>{localStorage.setItem('dude:v1:desktop:onboarding-completed','true');localStorage.setItem('dude:v1:json:indent','4');});
 await page.reload();
 assert.equal(await page.evaluate(()=>localStorage.getItem('dude:v1:json:indent')),'4');
 launches.push({kind:'cold',marks:marks.join('')});
 await app.close();active=null;
 active=await launch(['--open-with-dude',input]);
 await expect(active.page.getByRole('heading',{name:'JSON Formatter',exact:true})).toBeVisible();
 await expect(active.page.locator('textarea').first()).toHaveValue('{"phase":31,"portable":true}');
 assert.equal(await active.page.evaluate(()=>localStorage.getItem('dude:v1:json:indent')),'4');
 assert.equal((await active.page.evaluate(()=>window.dude.preferences.get())).startupDestination,'workspace');
 launches.push({kind:'warm',marks:active.marks.join('')});
 await active.app.close();active=null;
 writeFileSync(path.join(root,'tmp/phase31a-desktop-evidence.json'),JSON.stringify({profile,fixtureOrigin:`http://127.0.0.1:${port}`,checks:['production preload isolation','native helper read','mutation read-allowlist rejection','picker grant and walk','deep-link navigation','picker file handoff','command-line file handoff','renderer reload and warm persistence','native preference persistence'],launches},null,2)+'\n');
 console.log('Cold/warm production desktop, preload, deep-link, file-open, native helper and isolated saved-state acceptance pass.');
}finally{if(active)await active.app.close();}
