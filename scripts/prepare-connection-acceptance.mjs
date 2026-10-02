// Isolated packaged-app fixtures. Interactive verification uses native UI controls.
import {_electron} from '@playwright/test';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
await mkdir('.test-data',{recursive:true});
const root=await mkdtemp(resolve('.test-data/native-connection-'));
const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
const base='http://127.0.0.1:'+port,token='isolated-connection-fixture';
const server=spawn(resolve('../zhilume-server/release/win-unpacked/Zhilume Server.exe'),[resolve('../zhilume-server/release/win-unpacked/resources/app.asar/dist/main.js')],{windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',ZHILUME_PORT:String(port),ZHILUME_DATA:join(root,'server'),ZHILUME_TOKEN:token},stdio:['ignore','pipe','pipe']});
let log='';server.stderr.on('data',b=>{log=(log+b).slice(-4000);});server.stdout.resume();
async function call(path,data,method=data?'POST':'GET'){const r=await fetch(base+'/api/v1'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});if(!r.ok)throw Error(await r.text());return r.json();}
for(let i=0;;i++){try{await call('/system');break;}catch{if(i>100)throw Error(log);await new Promise(r=>setTimeout(r,200));}}
const project=await call('/projects',{name:'Studio 0.19.0 连接与空节点验收'});
await call(`/projects/${project.id}/canvas`,{schemaVersion:1,baseRevision:0,viewport:{x:0,y:0,zoom:1},nodes:['text','image','video','audio'].map((kind,i)=>({id:kind,type:'media',position:{x:90+i%2*340,y:120+Math.floor(i/2)*240},style:{width:280,height:176},data:{kind,title:['文本1','图片1','视频1','音频1'][i],titleSource:'automatic'}})),edges:[]},'PUT');
const session=await call('/session',{token});const profile={base,...session,name:'本机验收服务'};
const userData=join(root,'studio');await mkdir(userData,{recursive:true});
const desktop=await _electron.launch({executablePath:resolve('release/win-unpacked/Zhilume Studio.exe'),env:{...process.env,ZHILUME_USER_DATA:userData},timeout:30000});
const page=await desktop.firstWindow();await page.waitForFunction(()=>!!window.zhilumeDesktop);
await page.evaluate(value=>window.zhilumeDesktop.writeSession(value),{...profile,profiles:[profile]});await page.reload();
await writeFile(join(root,'acceptance.json'),JSON.stringify({root,base,projectId:project.id,userData},null,2));console.log(JSON.stringify({root,base,projectId:project.id}));
const stop=async()=>{await desktop.close().catch(()=>{});server.kill();process.exit();};process.on('SIGINT',stop);process.on('SIGTERM',stop);setInterval(()=>{},1000);
