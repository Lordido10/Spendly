import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTransactions, saveTransactions, validTransactions, TRANSACTIONS_KEY } from '../src/data/transactionStorage.js';
import { sampleDashboard } from '../src/data/dashboardData.js';
const sample = sampleDashboard.recentTransactions;
function storage(raw = null) {
  const data = new Map(raw === null ? [] : [[TRANSACTIONS_KEY, raw]]);
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
test('missing key loads samples without writing during initialization', () => {
  const local = storage();
  assert.deepEqual(loadTransactions(local), sample);
  assert.equal(local.data.size, 0);
});
test('saved transactions and an intentionally empty list load correctly', () => {
  for (const list of [sample, []]) assert.deepEqual(loadTransactions(storage(JSON.stringify(list))), list);
});
test('malformed JSON and invalid shapes safely fall back', () => {
  for (const raw of ['', '{broken', 'null', '{}', '[null]', JSON.stringify([{...sample[0], name:''}]),
    JSON.stringify([{...sample[0], amount:-1}]), JSON.stringify([{...sample[0], type:'other'}]),
    JSON.stringify([{...sample[0], date:null}]), JSON.stringify([{...sample[0], category:null}]),
    JSON.stringify([{...sample[0], id:null}]), JSON.stringify([sample[0], sample[0]])]) {
    const local=storage(raw);
    assert.deepEqual(loadTransactions(local),sample);
    assert.equal(local.getItem(TRANSACTIONS_KEY),raw);
  }
  assert.equal(validTransactions([{...sample[0],amount:Infinity}]),false);
});
test('save round trip supports create, edit, delete, clear and reset without touching Vanilla key', () => {
  const local=storage();local.setItem('spendly:data','untouched');
  const added=[{...sample[0],id:'new',name:'Added'},...sample];
  const edited=added.map(item=>item.id==='new'?{...item,amount:42}:item);
  const deleted=edited.filter(item=>item.id!=='new');
  for (const list of [added,edited,deleted,[],sample]) {
    assert.equal(saveTransactions(list,local),true);
    assert.deepEqual(loadTransactions(local),list);
    assert.equal(local.getItem('spendly:data'),'untouched');
  }
});
test('read and write exceptions are handled; failed writes keep previous saved data', () => {
  assert.deepEqual(loadTransactions({getItem(){throw Error('Blocked');}}),sample);
  const local=storage(JSON.stringify(sample));
  local.setItem=()=>{throw Error('Quota');};
  assert.equal(saveTransactions([],local),false);
  assert.deepEqual(loadTransactions(local),sample);
});
