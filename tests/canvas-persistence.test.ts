import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CanvasPersistence } from '../src/canvas-persistence';

const doc = (text: string) => ({ schemaVersion: 1, nodes: [{ data: { text } }], edges: [] });
test('lost acknowledgement is reconciled before saving newer local edits', async () => {
  let remote = { ...doc('original'), revision: 1 }, loseReply = true, writes = 0;
  const acknowledgements: number[] = [];
  const writer = new CanvasPersistence({
    read: async () => structuredClone(remote),
    write: async (document, revision) => {
      assert.equal(revision, remote.revision);
      writes++; remote = { ...document, revision: revision + 1 } as typeof remote;
      if (loseReply) { loseReply = false; throw new Error('response lost'); }
      return remote;
    },
    acknowledge: (_, revision) => acknowledgements.push(revision),
  });
  await assert.rejects(writer.save(doc('first edit'), 1), /response lost/);
  await writer.save(doc('newer edit'), 1);
  assert.equal(remote.nodes[0].data.text, 'newer edit');
  assert.equal(writes, 2); assert.deepEqual(acknowledgements, [2, 3]);
});

test('a repeated unchanged save does not write again after a lost acknowledgement', async () => {
  const document = doc('accepted'); let writes = 0, revision = 0;
  const writer = new CanvasPersistence({
    read: async () => ({ ...document, revision: 2 }),
    write: async () => { writes++; throw new Error('offline'); },
    acknowledge: (_, value) => { revision = value; },
  });
  await assert.rejects(writer.save(document, 1));
  await writer.save(document, 1);
  assert.equal(writes, 1); assert.equal(revision, 2);
});

test('another window edit remains a conflict and is never overwritten', async () => {
  let writes = 0;
  const writer = new CanvasPersistence({
    read: async () => ({ ...doc('another window'), revision: 3 }),
    write: async () => { writes++; throw new Error('offline'); },
    acknowledge: () => assert.fail('must not acknowledge foreign content'),
  });
  await assert.rejects(writer.save(doc('my edit'), 1));
  await assert.rejects(writer.save(doc('my newer edit'), 1), { code: 'revision_conflict' });
  assert.equal(writes, 1);
});

test('a write never accepted by Server can be retried after reconnection', async () => {
  let offline = true, remote = { ...doc('old'), revision: 4 };
  const writer = new CanvasPersistence({
    read: async () => remote,
    write: async (document, base) => {
      if (offline) throw new Error('offline');
      assert.equal(base, 4); return remote = { ...document, revision: 5 } as typeof remote;
    },
    acknowledge: () => {},
  });
  await assert.rejects(writer.save(doc('first'), 4));
  offline = false; await writer.save(doc('latest'), 4);
  assert.equal(remote.nodes[0].data.text, 'latest');
});
