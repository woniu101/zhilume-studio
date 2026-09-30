// Isolated EXE fixtures only. All interactive acceptance actions use native UI controls.
import { _electron } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
const folder=resolve('.test-data');await mkdir(folder,{recursive:true});
const root=await mkdtemp(join(folder,'native-node-'));
const provider=createServer(async(req,res)=>{for await(const _ of req){}res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'桌面文本生成验收完成：结果保留在当前节点。'}}]}));});
await new Promise(r=>provider.listen(0,'127.0.0.1',r));
const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
const base='http://127.0.0.1:'+port,token='isolated-node-acceptance';
const server=spawn(resolve('../zhilume-server/release/win-unpacked/Zhilume Server.exe'),[resolve('../zhilume-server/release/win-unpacked/resources/app.asar/dist/main.js')],{windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',ZHILUME_PORT:String(port),ZHILUME_DATA:join(root,'server'),ZHILUME_TOKEN:token},stdio:['ignore','pipe','pipe']});
let log='';server.stderr.on('data',b=>{log=(log+b).slice(-4000);});server.stdout.resume();
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
async function call(path,data,method=data?'POST':'GET'){const r=await fetch(base+'/api/v1'+path,{method,headers,body:data?JSON.stringify(data):undefined});if(!r.ok)throw Error(await r.text());return r.json();}
for(let i=0;;i++){try{await call('/system');break;}catch{if(i>100)throw Error(log);await new Promise(r=>setTimeout(r,200));}}
await call('/language/providers',{name:'本地验收服务',baseUrl:`http://127.0.0.1:${provider.address().port}/v1`,apiKey:'fixture',models:[{model:'acceptance-text',capabilities:['text']}],defaults:{text:'acceptance-text'}});
const project=await call('/projects',{name:'Studio 0.18.0 交互验收'});
const upload=await fetch(base+'/api/v1/assets/uploads?filename=native-video.mp4',{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream'},body:await readFile('e2e/fixtures/audio-video.mp4')});const asset=await upload.json();
await call(`/projects/${project.id}/canvas`,{schemaVersion:1,baseRevision:0,viewport:{x:0,y:0,zoom:1},nodes:[
 {id:'text',type:'media',position:{x:80,y:100},style:{width:280},data:{kind:'text',title:'文本1',titleSource:'automatic',contentSchemaVersion:1,contentRevision:0,textDraft:'写一段测试文本'}},
 {id:'image',type:'media',position:{x:850,y:100},style:{width:280},data:{kind:'image',title:'图片1',contentSchemaVersion:1,contentRevision:0}},
 {id:'video',type:'media',position:{x:500,y:100},style:{width:320},data:{kind:'video',title:'视频1',contentSchemaVersion:1,contentRevision:0,assetId:asset.id,videoDraft:{modelId:'minimax-h3-ref2va',profileId:'',mode:'reference',prompt:'描述画面、动作与声音',firstFrameId:'',lastFrameId:'',references:[{role:'video',assetId:asset.id,start:0,frames:56}],width:512,height:288,frames:124,steps:20,seed:0,includeAudio:true}}},
],edges:[]},'PUT');
const userData=join(root,'studio');await mkdir(userData,{recursive:true});
const desktop=await _electron.launch({executablePath:resolve('release/win-unpacked/Zhilume Studio.exe'),env:{...process.env,ZHILUME_USER_DATA:userData},timeout:30000});
const page=await desktop.firstWindow();await page.waitForFunction(()=>!!window.zhilumeDesktop);
await page.evaluate(session=>window.zhilumeDesktop.writeSession(session),{base,token});await page.reload();
await writeFile(join(root,'acceptance.json'),JSON.stringify({base,root,projectId:project.id,sourceId:asset.id,userData},null,2));
console.log(JSON.stringify({base,root,projectId:project.id}));
const stop=async()=>{await desktop.close().catch(()=>{});server.kill();provider.closeAllConnections();provider.close();process.exit();};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
setInterval(()=>{},1000);
