import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentAssetIds } from '../src/document-assets';
test('asset resolution includes hidden draft and history references but not arbitrary strings',()=>{
  assert.deepEqual(documentAssetIds([{data:{assetId:'main',title:'not-an-asset',generationDraft:{refs:['a','main']},videoDraft:{firstFrameId:'b',lastFrameId:'c',references:[{assetId:'d'}]},speechDraft:{speaker:{assetId:'e'}},versions:[{assetId:'old'}]}}]),['main','a','b','c','d','e','old']);
});
