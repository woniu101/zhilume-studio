// Prepares isolated fixtures and packaged processes; native UI actions are manual/Sky.
import { _electron } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
const folder = resolve('.test-data'); await mkdir(folder, { recursive: true });
const root = await mkdtemp(join(folder, 'native-media-'));
const reserve = createServer(); await new Promise(r => reserve.listen(0, '127.0.0.1', r)); const port = reserve.address().port; await new Promise(r => reserve.close(r));
const base = 'http://127.0.0.1:' + port, token = 'isolated-native-media-fixture';
const server = spawn(resolve('../zhilume-server/release/win-unpacked/Zhilume Server.exe'), [resolve('../zhilume-server/release/win-unpacked/resources/app.asar/dist/main.js')], { windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ZHILUME_PORT: String(port), ZHILUME_DATA: join(root, 'server'), ZHILUME_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'] });
let log=''; server.stderr.on('data', b => { log=(log+b).slice(-4000); });
const headers = { Authorization: 'Bearer '+token };
async function call(path, data) { const r=await fetch(base+'/api/v1'+path, { method:data?'POST':'GET', headers:{...headers,'Content-Type':'application/json'}, body:data?JSON.stringify(data):undefined }); if(!r.ok)throw Error(await r.text());return r.json(); }
for(let i=0;;i++){try{await call('/system');break;}catch{if(i>100)throw Error(log);await new Promise(r=>setTimeout(r,200));}}
const speechMode = process.argv.includes('--speech');
const project = await call('/projects',{name:speechMode?'语音界面验收':'媒体架构验收'});
const imageMode = process.argv.includes('--image');
const input = resolve(speechMode ? 'e2e/fixtures/interaction-test.wav' : imageMode ? 'e2e/fixtures/portrait.png' : 'e2e/fixtures/audio-video.mp4');
const upload=await fetch(base+'/api/v1/assets/uploads?filename='+(speechMode?'remote-test.wav':imageMode?'remote-test.png':'remote-test.mp4'),{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream'},body:await readFile(input)}); const asset=await upload.json();
await fetch(base+'/api/v1/projects/'+project.id+'/canvas',{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({schemaVersion:1,baseRevision:0,viewport:{x:0,y:0,zoom:1},nodes:[{id:'remote',type:'media',style:{width:320},position:{x:300,y:60},data:{title:speechMode?'语音验收':imageMode?'远程图片验收':'远程视频验收',kind:speechMode?'audio':imageMode?'image':'video',assetId:speechMode?undefined:asset.id}}],edges:[]})});
const userData=join(root,'studio');await mkdir(userData,{recursive:true});
const desktop=await _electron.launch({executablePath:resolve('release/win-unpacked/Zhilume Studio.exe'),env:{...process.env,ZHILUME_USER_DATA:userData},timeout:30000});
const page=await desktop.firstWindow();await page.waitForFunction(()=>!!window.zhilumeDesktop);
await page.evaluate(session=>window.zhilumeDesktop.writeSession(session),{base,token});await page.reload();
await writeFile(join(root,'acceptance.json'),JSON.stringify({base,root,projectId:project.id,sourceId:asset.id,input,userData},null,2));
console.log(JSON.stringify({base,root,projectId:project.id,input}));
// Keep only these isolated processes until this script is stopped.
const stop=async()=>{await desktop.close().catch(()=>{});server.kill();process.exit();};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
setInterval(()=>{},1000);
