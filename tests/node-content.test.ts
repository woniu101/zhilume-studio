import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNode, emptyDocument } from '../src/canvas';
import { canSwitchKind, receiveResults, replaceContent, snapshot, type NodeResult } from '../src/node-content';

test('first result fills its node; regeneration preserves versions without adding nodes or edges', () => {
  const node = createNode('image'), doc = {...emptyDocument(), nodes:[node]};
  const result:NodeResult = {version:1,id:'one',jobId:'one',nodeId:node.id,base:snapshot(node.data),createdAt:new Date().toISOString(),operation:'image.generate.v1',output:{id:'image-1',kind:'image'}};
  const first = receiveResults(doc,[result]);
  assert.equal(first.nodes.length,1); assert.equal(first.edges.length,0);
  assert.equal(first.nodes[0].data.assetId,'image-1');
  assert.equal(first.nodes[0].data.versions?.length,1);
  assert.equal(receiveResults(first,[result]),first);
  const second = receiveResults(first,[result,{...result,id:'two',jobId:'two',base:snapshot(first.nodes[0].data),output:{id:'image-2',kind:'image'}}]);
  assert.equal(second.nodes[0].data.assetId,'image-2');
  assert.deepEqual(second.nodes[0].data.versions?.map(v=>v.assetId),['image-1','image-2']);
  const restored = {...second,nodes:[{...node,data:replaceContent(second.nodes[0].data,{assetId:'image-1'})}]};
  assert.equal(receiveResults(restored,[result]),restored);
  assert.equal(restored.nodes[0].data.versions?.length,2);
});

test('late results retain manual edits, deletion and an undo revision; draft edits do not block adoption', () => {
  const node=createNode('text'),doc={...emptyDocument(),nodes:[node]};
  const r:NodeResult={version:1,id:'job',jobId:'job',nodeId:node.id,base:snapshot(node.data),createdAt:new Date().toISOString(),operation:'text.generate.v1',output:{id:'asset',kind:'text',text:'result'}};
  const changed={...doc,nodes:[{...node,data:replaceContent(node.data,{text:'manual'})}]};
  const late=receiveResults(changed,[r]);
  assert.equal(late.nodes[0].data.text,'manual');assert.equal(late.nodes[0].data.versions?.at(-1)?.text,'result');
  assert.equal(receiveResults(emptyDocument(),[r]).nodes.length,0);
  const undone={...doc,nodes:[{...node,data:{...node.data,contentRevision:2}}]};
  assert.equal(receiveResults(undone,[r]).nodes[0].data.text,undefined);
  const drafted={...doc,nodes:[{...node,data:{...node.data,textDraft:'new prompt'}}]};
  const completed=receiveResults(drafted,[r]);
  assert.equal(completed.nodes[0].data.text,'result');assert.equal(completed.nodes[0].data.textDraft,'new prompt');
});

test('type switching is limited to empty, unconnected nodes with no successful or active jobs', () => {
  const n=createNode('image');
  assert.ok(canSwitchKind(n,[],[]));
  for(const status of ['queued','running','waiting_upstream','cancel_requested','succeeded']) assert.equal(canSwitchKind(n,[{nodeId:n.id,status}],[]),false);
  assert.ok(canSwitchKind(n,[{nodeId:n.id,status:'cancelled'}],[]));
  assert.equal(canSwitchKind(n,[],[{id:'e',source:n.id,target:'other'}]),false);
  assert.equal(canSwitchKind({...n,data:{...n.data,assetId:'original'}},[],[]),false);
});
