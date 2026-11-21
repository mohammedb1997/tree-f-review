'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {existsSync,mkdtempSync,readdirSync,rmdirSync,unlinkSync,writeFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {once}=require('node:events');
const {DatabaseSync}=require('node:sqlite');
const {createBackup,restoreBackup}=require('./backup.cjs');
const {createPortal}=require('./server.cjs');
const core=require('../Claud/botanical-core.js');

test('backup a running portal and restore accounts without restoring old sessions', {timeout:15000},async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'family-backup-'));
  const source=path.join(dir,'source.sqlite');
  const target=path.join(dir,'restored.sqlite');
  const archive=path.join(dir,'archive');
  const origin='http://127.0.0.1:4187';
  const password='BackupTest-2026';
  let portal=createPortal({filename:source,origin});
  const start=()=>once(portal.server.listen(4187,'127.0.0.1'),'listening');
  const close=()=>new Promise((resolve,reject)=>portal.server.close(error=>error?reject(error):resolve()));

  async function request(route,{cookie,data,status=200}={}){
    const response=await fetch(origin+route,{method:data?'POST':'GET',headers:{
      origin,connection:'close',...(cookie?{cookie}:{}),...(data?{'content-type':'application/json'}:{})
    },body:data&&JSON.stringify(data)});
    const body=await response.json();
    assert.equal(response.status,status,JSON.stringify(body));
    return {cookie:response.headers.get('set-cookie')?.split(';')[0],body};
  }

  try{
    await portal.initialize({login:'admin@example.test',password,document:core.fixture(10)});
    await start();
    const admin=await request('/api/login',{data:{identifier:'admin@example.test',password}});
    const invite=(await request('/api/invites',{cookie:admin.cookie,data:{personId:'test-1'}})).body;
    const father=await request('/api/activate',{data:{...invite,password}});
    const pending=(await request('/api/invites',{cookie:admin.cookie,data:{personId:'test-2'}})).body;
    await request('/api/people',{cookie:father.cookie,data:{parentId:'test-1',name:'ابن اختبار النسخة'}});
    await request('/api/people',{cookie:father.cookie,data:{parentId:'test-1',name:'ابنة اختبار النسخة',gender:'f'}});
    const beforeHistory=(await request('/api/history',{cookie:father.cookie})).body;
    await request('/api/corrections',{cookie:father.cookie,data:{personId:'test-4',parentId:'test-5',note:'طلب اختبار الاسترجاع'}});
    const beforeCorrections=(await request('/api/corrections',{cookie:father.cookie})).body;
    const snapshot=await createBackup(source,archive);
    await restoreBackup(snapshot,target);
    const invalid=path.join(dir,'invalid.sqlite');
    const rejected=path.join(dir,'rejected.sqlite');
    writeFileSync(invalid,'invalid database');
    await assert.rejects(()=>restoreBackup(invalid,rejected));
    assert(!existsSync(rejected));
    await assert.rejects(()=>restoreBackup(snapshot,source),/already exists/);
    await assert.rejects(()=>restoreBackup(snapshot,target),/already exists/);
    const verify=new DatabaseSync(target,{readOnly:true});
    try{
      assert.equal(verify.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
      assert.equal(verify.prepare('SELECT count(*) AS n FROM accounts WHERE invitation IS NOT NULL').get().n,0);
    }finally{verify.close();}
    await close();
    portal=createPortal({filename:target,origin});
    await start();
    await request('/api/me',{cookie:father.cookie,status:401});
    await request('/api/activate',{data:{...pending,password},status:400});
    const restored=await request('/api/login',{data:{identifier:invite.code,password}});
    const tree=(await request('/api/tree',{cookie:restored.cookie})).body;
    assert(tree.people.some(person=>person.name==='ابن اختبار النسخة'&&person.parentId==='test-1'));
    assert(!tree.people.some(person=>person.name==='ابنة اختبار النسخة'));
    const own=(await request('/api/private-daughters',{cookie:restored.cookie})).body;
    assert(own.daughters.some(person=>person.name==='ابنة اختبار النسخة'));
    const restoredHistory=(await request('/api/history',{cookie:restored.cookie})).body;
    assert.deepEqual(restoredHistory.entries.slice(1),beforeHistory.entries);
    assert.deepEqual((await request('/api/corrections',{cookie:restored.cookie})).body,beforeCorrections);
  }finally{
    if(portal.server.listening)await close();
    for(const folder of [archive,dir]){
      if(folder===archive&&!existsSync(folder))continue;
      for(const file of readdirSync(folder))unlinkSync(path.join(folder,file));
      rmdirSync(folder);
    }
  }
});
