'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {mkdtempSync, readdirSync, unlinkSync, rmdirSync} = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {once} = require('node:events');
const {request:send} = require('node:http');
const {createPortal} = require('./server.cjs');
const core = require('../Claud/botanical-core.js');

test('صلاحيات الفروع والبث الحي ولقطة ما قبل التعديل',{timeout:15000},async()=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'treef-portal-'));
  const filename=path.join(directory,'family.sqlite');
  const origin='http://127.0.0.1:4178';
  const password='sample-secret-for-test';
  const adminIdentifier='admin@example.test';
  let portal=createPortal({filename,origin});
  const document=core.fixture(10);
  document.persons[1].notes='private-test-note';
  document.persons[1].customField={value:'retained'};
  let localAddress;
  let liveResponse;
  async function start(){
    await once(portal.server.listen(0,'127.0.0.1'),'listening');
    localAddress='http://127.0.0.1:'+portal.server.address().port;
  }
  const stop=()=>new Promise((resolve,reject)=>portal.server.close(e=>e?reject(e):resolve()));
  async function request(route,{method='GET',data,cookie,status=200,requestOrigin=origin}={}){
    const headers={host:new URL(origin).host};
    if(method!=='GET')headers.origin=requestOrigin;
    if(cookie)headers.cookie=cookie;
    if(data)headers['Content-Type']='application/json';
    const response=await new Promise((resolve,reject)=>{
      const req=send(localAddress+route,{method,headers},resolve);
      req.once('error',reject);
      req.end(data?JSON.stringify(data):undefined);
    });
    const chunks=[];
    for await(const chunk of response)chunks.push(chunk);
    const json=JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(response.statusCode,status,JSON.stringify(json));
    const header=response.headers['set-cookie']?.[0];
    return {json,cookie:header?.split(';')[0],header};
  }
  async function* events(response){
    response.setEncoding('utf8');
    let buffer='';
    for await(const chunk of response){
      buffer+=chunk;
      let boundary;
      while((boundary=buffer.indexOf('\n\n'))!==-1){
        const message=buffer.slice(0,boundary);
        buffer=buffer.slice(boundary+2);
        if(!message.startsWith('event: '))continue;
        const [label,data]=message.split('\n');
        yield {name:label.slice(7),data:JSON.parse(data.slice(6))};
      }
    }
  }
  try{
    await portal.initialize({login:adminIdentifier,password,document});
    await assert.rejects(()=>portal.initialize({login:adminIdentifier,password,document}),/already initialized/);
    await start();
    await request('/api/tree',{status:401});
    const login=(identifier,opts)=>request('/api/login',{method:'POST',data:{identifier,password},...opts});
    const admin=await login(adminIdentifier);
    assert.match(admin.header,/HttpOnly; SameSite=Strict/);
    await login('unknown@example.test',{status:401});
    const invite=(identifier,personId,cookie=admin.cookie,status=200)=>request('/api/invites',{method:'POST',data:{identifier,personId},cookie,status});
    const code=(await invite('0501234567','test-1')).json.code;
    await invite('0501234567','test-2',admin.cookie,409);
    const newInvite=()=>request('/api/invites',{method:'POST',data:{personId:'test-2'},cookie:admin.cookie});
    const firstInvite=(await newInvite()).json;
    const nextInvite=(await newInvite()).json;
    assert.equal(nextInvite.code,firstInvite.code);
    assert.notEqual(nextInvite.initialPassword,firstInvite.initialPassword);
    const activate=(data,status=200)=>request('/api/activate',{method:'POST',data:{...data,password},status});
    await activate(firstInvite,400);
    await activate({code:nextInvite.code},400);
    await request('/api/login',{method:'POST',data:{identifier:nextInvite.code,password:nextInvite.initialPassword},status:401});
    const codeMember=await activate(nextInvite);
    assert.equal((await request('/api/me',{cookie:codeMember.cookie})).json.personId,'test-2');
    await activate(nextInvite,400);
    await login(nextInvite.code.toLowerCase());
    const member=(await request('/api/activate',{method:'POST',data:{code,password}})).cookie;
    const grandchildFather=(await request('/api/invites',{method:'POST',data:{personId:'test-4'},cookie:admin.cookie})).json;
    const father=(await activate(grandchildFather)).cookie;
    const daughter='حفيدة خاصة للاختبار';
    const addDaughter=(parentId,cookie,status=200)=>request('/api/people',{
      method:'POST',data:{parentId,name:daughter,gender:'f'},cookie,status
    });
    await addDaughter('test-4',member,403);
    await addDaughter('test-4',admin.cookie,403);
    await addDaughter('test-4',codeMember.cookie,403);
    const privateRecord=(await addDaughter('test-4',father)).json;
    assert.equal(privateRecord.private,true);
    await request('/api/private-daughters',{status:401});
    await request('/api/private-daughters',{cookie:admin.cookie,status:403});
    assert.deepEqual((await request('/api/private-daughters',{cookie:member})).json.daughters,[]);
    assert.deepEqual((await request('/api/private-daughters',{cookie:codeMember.cookie})).json.daughters,[]);
    assert.equal((await request('/api/private-daughters',{cookie:father})).json.daughters[0].name,daughter);
    const ownTree=(await request('/api/tree',{cookie:father})).json;
    assert(ownTree.privatePeople.some(person=>person.name===daughter && !person.writable));
    assert(!JSON.stringify(ownTree.people).includes(daughter));
    const defaultOther=(await request('/api/tree',{cookie:codeMember.cookie})).json;
    assert(!JSON.stringify(defaultOther).includes(daughter));
    await request('/api/tree?scope=all',{status:401});
    const allTree=(await request('/api/tree?scope=all',{cookie:codeMember.cookie})).json;
    assert(allTree.privatePeople.some(person=>person.name===daughter && !person.writable));
    const daughterInvite=(cookie,status=200)=>request('/api/private-daughters/'+privateRecord.id+'/invite',
      {method:'POST',data:{},cookie,status});
    await daughterInvite(codeMember.cookie,403);
    const daughterLogin=(await daughterInvite(father)).json;
    const daughterCookie=(await activate(daughterLogin)).cookie;
    const daughterAccount=(await request('/api/me',{cookie:daughterCookie})).json;
    assert.equal(daughterAccount.personId,privateRecord.id);
    assert.equal(daughterAccount.canAddDaughter,false);
    assert((await request('/api/tree',{cookie:daughterCookie})).json.privatePeople.some(person=>person.id===privateRecord.id));
    await addDaughter(privateRecord.id,daughterCookie,403);
    const endpoint='/api/private-daughters/'+privateRecord.id;
    const renamed='حفيدة بعد تصحيح الاسم';
    await request(endpoint,{method:'PATCH',data:{name:renamed},cookie:member,status:403});
    await request(endpoint,{method:'PATCH',data:{name:renamed},cookie:father});
    assert((await request('/api/tree',{cookie:daughterCookie})).json.privatePeople.some(person=>person.name===renamed));
    await request(endpoint+'/recover',{method:'POST',data:{},cookie:codeMember.cookie,status:403});
    const reissued=(await request(endpoint+'/recover',{method:'POST',data:{},cookie:father})).json;
    assert.equal(reissued.code,daughterLogin.code);
    assert.notEqual(reissued.initialPassword,daughterLogin.initialPassword);
    await request('/api/me',{cookie:daughterCookie,status:401});
    await login(reissued.code,{status:401});
    await activate(daughterLogin,400);
    const recovered=(await activate(reissued)).cookie;
    assert.equal((await request('/api/me',{cookie:recovered})).json.personId,privateRecord.id);
    assert(!JSON.stringify((await request('/api/backup',{cookie:admin.cookie})).json).includes(daughter));
    await request('/api/activate',{method:'POST',data:{code,password},status:400});
    await login('+966501234567');
    const tree=(await request('/api/tree',{cookie:member})).json;
    assert.equal(tree.revision,0);
    await request('/api/live',{status:401});
    liveResponse=await new Promise((resolve,reject)=>{
      const req=send(localAddress+'/api/live',{headers:{host:new URL(origin).host,cookie:member}},resolve);
      req.once('error',reject);req.end();
    });
    assert.match(liveResponse.headers['content-type'],/^text\/event-stream/);
    const live=events(liveResponse);
    const initial=(await live.next()).value;
    assert.equal(initial.name,'tree');
    assert.equal(initial.data.revision,0);
    assert(!initial.data.before);
    await request('/api/people',{method:'POST',cookie:father,
      data:{parentId:'test-4',name:'اسم خاص لا يظهر في رسالة التحديث',gender:'f'}});
    assert.deepEqual((await live.next()).value,{name:'private-people',data:{}});
    assert.equal(tree.people.length,10);
    assert.equal(tree.people.find(p=>p.id==='test-1').writable,true);
    assert.equal(tree.people.find(p=>p.id==='test-2').writable,false);
    assert(!JSON.stringify(tree).includes('private-test-note'));
    await invite('member@example.test','test-3',member,403);
    await request('/api/backup',{cookie:member,status:403});
    await request('/api/accounts',{cookie:member,status:403});
    const add=(parentId,name,cookie=member,status=200,requestOrigin=origin)=>request('/api/people',
      {method:'POST',data:{parentId,name},cookie,status,requestOrigin});
    await add('test-2','خارج الفرع',member,403);
    await add('test-1','طلب من أصل آخر',member,403,'https://example.test');
    const son=(await add('test-1','ابن تجريبي')).json.id;
    const added=(await live.next()).value.data;
    assert.equal(added.revision,1);
    assert.equal(added.before.revision,0);
    assert(added.before.people.every(p=>p.writable===false));
    assert(!added.before.people.some(p=>p.id===son));
    assert(added.people.some(p=>p.id===son&&p.writable));
    assert(!JSON.stringify(added).includes('private-test-note'));
    const [first,second]=await Promise.all([add(son,'حفيد أول'),add(son,'حفيد ثان')]);
    assert.notEqual(first.json.id,second.json.id);
    const edit=(id,name,cookie=member,status=200)=>request('/api/people/'+id,
      {method:'PATCH',data:{name},cookie,status});
    await edit('test-1','اسم معدّل');
    await edit(first.json.id,'حفيد معدّل');
    await edit('test-0','جد خارج الفرع',member,403);
    await edit('test-0','اسم الجد',admin.cookie);
    await request('/api/tree',{method:'PATCH',data:{title:'عنوان المدير'},cookie:member,status:403});
    await request('/api/tree',{method:'PATCH',data:{title:'عنوان المدير'},cookie:admin.cookie});
    const backup=(await request('/api/backup',{cookie:admin.cookie})).json;
    assert.equal(backup.title,'عنوان المدير');
    assert.equal(backup.relationships.length,document.relationships.length+3);
    assert.equal(backup.persons[1].notes,'private-test-note');
    assert.deepEqual(backup.persons[1].customField,{value:'retained'});
    core.validate(backup);
    const account=(await request('/api/accounts',{cookie:admin.cookie})).json.accounts.find(a=>a.role==='member');
    await request('/api/accounts/'+account.id+'/revoke',{method:'POST',cookie:admin.cookie});
    let notification;
    do {notification=await live.next();} while(!notification.done&&notification.value.name!=='session-expired');
    assert.equal(notification.value?.name,'session-expired');
    liveResponse.destroy();
    await request('/api/me',{cookie:member,status:401});
    await login('0501234567',{status:401});
    const replacement=(await invite('member@example.test','test-1')).json.code;
    await request('/api/activate',{method:'POST',data:{code:replacement,password}});
    await stop();
    portal=createPortal({filename,origin});
    await start();
    const restoredFather=(await login(grandchildFather.code)).cookie;
    assert.equal((await request('/api/private-daughters',{cookie:restoredFather})).json.daughters[0].name,renamed);
    const restored=await login('member@example.test');
    const saved=(await request('/api/tree',{cookie:restored.cookie})).json;
    assert(saved.people.some(p=>p.id===first.json.id&&p.parentId===son&&p.name==='حفيد معدّل'&&p.writable));
    assert.equal(saved.before.revision,saved.revision-1);
    assert.notEqual(saved.before.title,saved.title);
    await request('/api/logout',{method:'POST',cookie:restored.cookie});
    await request('/api/me',{cookie:restored.cookie,status:401});
  }finally{
    liveResponse?.destroy();
    if(portal.server.listening)await stop();
    for(const file of readdirSync(directory))unlinkSync(path.join(directory,file));
    rmdirSync(directory);
  }
});
