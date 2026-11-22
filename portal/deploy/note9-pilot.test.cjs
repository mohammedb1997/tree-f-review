'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const {once} = require('node:events');
const {test} = require('node:test');
const {DatabaseSync} = require('node:sqlite');
const {restoreBackup} = require('../backup.cjs');
const {startPilot,backupPilot} = require('./note9-pilot.cjs');

async function freePort() {
  const listener = net.createServer().listen(0,'127.0.0.1');
  await once(listener,'listening');
  const {port} = listener.address();
  await new Promise(resolve => listener.close(resolve));
  return port;
}

test('Note 9 pilot saves a synthetic entry, reopens its database and backs it up', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'treef-note9-test-'));
  let pilot;
  async function stop() {
    if (pilot?.server.listening) await new Promise(resolve => pilot.server.close(resolve));
  }
  async function request(route,data,cookie) {
    const headers = {connection:'close',...(cookie ? {cookie} : {})};
    if (data) Object.assign(headers,{origin:pilot.origin,'content-type':'application/json'});
    return fetch(pilot.origin+route,{headers,method:data?'POST':'GET',body:data&&JSON.stringify(data)});
  }
  async function login() {
    const response = await request('/api/login',{identifier:'admin@example.test',password:'Note9-Demo-Only-2026'});
    assert.equal(response.status,200);
    await response.json();
    return response.headers.get('set-cookie').split(';')[0];
  }
  try {
    const port = await freePort();
    pilot = await startPilot(directory,port);
    assert.equal(pilot.server.address().address,'127.0.0.1');
    const guest = await request('/api/tree');
    assert.equal(guest.status,401);
    await guest.json();
    const name = 'إضافة وهمية لاختبار التخزين';
    const addition = await request('/api/people',{parentId:'test-0',name,gender:'m'},await login());
    assert.equal(addition.status,200);
    const {id} = await addition.json();
    await stop();
    pilot = await startPilot(directory,port);
    const {people} = await (await request('/api/tree',undefined,await login())).json();
    assert.equal(people.find(person=>person.id===id).name,name);

    const hardLink=t.mock.method(fs,'linkSync',()=>{throw Object.assign(new Error('Hard links denied'),{code:'EACCES'});});
    const filename = await backupPilot(directory);
    assert.equal(hardLink.mock.callCount(),1);
    assert.equal(fs.existsSync(filename+'.incomplete'),false);
    const restored = path.join(directory,'restored.sqlite');
    fs.writeFileSync(filename+'.incomplete','');
    await assert.rejects(restoreBackup(filename,restored),/incomplete/);
    assert.equal(fs.existsSync(restored),false);
    fs.unlinkSync(filename+'.incomplete');
    await restoreBackup(filename,restored);
    assert.equal(hardLink.mock.callCount(),2);
    await assert.rejects(restoreBackup(filename,restored),/Destination already exists/);
    const db = new DatabaseSync(restored,{readOnly:true});
    try {
      const row = db.prepare('SELECT document FROM tree WHERE id=1').get();
      assert.equal(JSON.parse(row.document).persons.find(person=>person.personId===id).fullName,name);
      assert.equal(db.prepare('SELECT count(*) AS total FROM sessions').get().total,0);
    } finally {db.close();}

    const foreign = path.join(directory,'foreign');
    fs.mkdirSync(foreign);
    fs.writeFileSync(path.join(foreign,'sample.sqlite'),'unrelated file');
    await assert.rejects(startPilot(foreign,port),/لا يُطابق قاعدة/);
    assert.equal(fs.readFileSync(path.join(foreign,'sample.sqlite'),'utf8'),'unrelated file');
  } finally {
    await stop();
    assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
