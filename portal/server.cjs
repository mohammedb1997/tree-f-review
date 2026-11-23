'use strict';

const {createServer} = require('node:http');
const {DatabaseSync} = require('node:sqlite');
const {createHash, randomBytes, randomUUID, scrypt, timingSafeEqual} = require('node:crypto');
const {promisify} = require('node:util');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const core = require('../Claud/botanical-core.js');
const {duplicateCandidate,mergeDuplicate}=require('./duplicate-review.cjs');

const derive = promisify(scrypt);
const digest = value => createHash('sha256').update(value).digest('hex');
const randomToken = () => randomBytes(32).toString('base64url');
const familyCodePattern = /^fam-[0-9a-f]{16}$/;
const duration = 12 * 60 * 60 * 1000;
const cookieName = 'treef_session';
const bad = (status,message) => Object.assign(new Error(message),{status});
const error = {
  auth: 'سجّل الدخول أولًا.',
  forbidden: 'لا تملك صلاحية إجراء هذا التعديل.',
  invalid: 'راجع البيانات المدخلة.',
  credentials: 'تعذر تسجيل الدخول. تأكد من بيانات الحساب.',
  invite: 'الدعوة غير صالحة أو انتهت صلاحيتها.'
};
const assets = new Map([
  ['/', ['index.html','text/html;charset=utf-8']],
  ['/portal/',['index.html','text/html;charset=utf-8']],
  ['/portal/app.js',['app.js','text/javascript;charset=utf-8']],
  ['/portal/style.css',['style.css','text/css;charset=utf-8']],
  ['/Claud/botanical-core.js',['../Claud/botanical-core.js','text/javascript;charset=utf-8']],
  ['/portal/world/',['world/index.html','text/html;charset=utf-8']],
  ['/portal/world/world.css',['world/world.css','text/css;charset=utf-8']],
  ...['world.js','vendor/three.core.min.js','vendor/three.module.min.js','vendor/OrbitControls.js']
    .map(file=>['/portal/world/'+file,['world/'+file,'text/javascript;charset=utf-8']])
]);

function identifier(value) {
  if(typeof value!=='string'||value.length>254)throw bad(400,error.invalid);
  const clean=value.trim().toLowerCase().replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  if(familyCodePattern.test(clean))return clean;
  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean))return clean;
  const phone=clean.replace(/[\s()-]/g,'');
  if(/^05\d{8}$/.test(phone))return '+966'+phone.slice(1);
  if(/^\+[1-9]\d{7,14}$/.test(phone))return phone;
  throw bad(400,'أدخل رمز الحساب أو معرّف حسابك السابق.');
}

async function passwordHash(password,salt=randomBytes(16).toString('hex')) {
  const hash=await derive(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  return salt+':'+hash.toString('hex');
}

function credential(value) {
  if(typeof value!=='string'||[...value].length<12||Buffer.byteLength(value)>256)
    throw bad(400,'اختر كلمة مرور من ١٢ حرفًا على الأقل.');
  return value;
}

function personName(value,limit=300) {
  if(typeof value!=='string'||!value.trim()||value.trim().length>limit)
    throw bad(400,`أدخل نصًا من حرف واحد إلى ${limit} حرفًا.`);
  return value.trim();
}

function createPortal({filename,origin}) {
  const url=new URL(origin);
  if(url.origin!==origin||!['http:','https:'].includes(url.protocol)||
     (url.protocol==='http:'&&url.hostname!=='127.0.0.1'))
    throw Error('Use an exact HTTPS origin or http://127.0.0.1 for local testing');
  const db=new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS tree (id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tree_revision (
      id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, previous TEXT
    );
    INSERT OR IGNORE INTO tree_revision VALUES(1,0,NULL);
    CREATE TABLE IF NOT EXISTS private_daughters (
      id TEXT PRIMARY KEY, father_id TEXT NOT NULL, name TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS private_daughters_father ON private_daughters(father_id);
    CREATE TABLE IF NOT EXISTS person_profiles (person_id TEXT PRIMARY KEY, document TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, identifier TEXT UNIQUE NOT NULL, person_id TEXT UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('admin','member')), password TEXT,
      invitation TEXT UNIQUE, invite_until INTEGER
    );
    CREATE TABLE IF NOT EXISTS account_permissions (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id),
      can_add INTEGER NOT NULL CHECK(can_add IN (0,1)),
      can_edit INTEGER NOT NULL CHECK(can_edit IN (0,1)),
      invited_by TEXT REFERENCES accounts(id), inviter_person TEXT, inviter_name TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit (
      id TEXT PRIMARY KEY, at INTEGER NOT NULL, actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL, action TEXT NOT NULL, summary TEXT NOT NULL,
      person_ids TEXT NOT NULL, private_father TEXT
    );
    CREATE TABLE IF NOT EXISTS corrections (
      id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, person_id TEXT NOT NULL,
      parent_id TEXT NOT NULL, source_parent_id TEXT NOT NULL, note TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
      created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS correction_merges (
      correction_id TEXT PRIMARY KEY REFERENCES corrections(id), snapshot TEXT NOT NULL
    );
  `);
  const tree=()=>JSON.parse(db.prepare('SELECT document FROM tree WHERE id=1').get().document);
  const transaction=operation=>{
    db.exec('BEGIN IMMEDIATE');
    try {const result=operation();db.exec('COMMIT');return result;}
    catch(e){db.exec('ROLLBACK');throw e;}
  };
  const cookieExtra=url.protocol==='https:'?'; Secure':'';
  const setCookie=(res,value,age)=>res.setHeader('Set-Cookie',
    `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${cookieExtra}`);
  const accountFor=req=>{
    const value=(req.headers.cookie||'').match(/(?:^|;\s*)treef_session=([\w-]{43})(?:;|$)/)?.[1];
    return value && db.prepare(`SELECT a.* FROM sessions s JOIN accounts a ON a.id=s.account_id
      WHERE s.token=? AND s.expires>? AND a.password IS NOT NULL`).get(digest(value),Date.now());
  };
  const startSession=(res,id)=>{
    const token=randomToken();
    db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),id,Date.now()+duration);
    setCookie(res,token,duration/1000);
  };
  const attemptWindow=new Map();
  let globalUntil=0, globalAttempts=0, pendingHashes=0;
  async function limited(req,key,verify) {
    const now=Date.now();
    if(now>=globalUntil){globalUntil=now+60000;globalAttempts=0;}
    const address=req.socket.remoteAddress||'local';
    const attemptKey=address+'\0'+key;
    for(const [id,entry] of attemptWindow)if(entry.until<=now)attemptWindow.delete(id);
    const entry=attemptWindow.get(attemptKey)||{count:0,until:now+15*60*1000};
    if(entry.count>=10||globalAttempts>=90||pendingHashes>=4)throw bad(429,'جرت محاولات كثيرة. جرّب لاحقًا.');
    entry.count++;globalAttempts++;pendingHashes++;attemptWindow.set(attemptKey,entry);
    try {return await verify();}finally{pendingHashes--;}
  }

  function publicTree(doc){
    const {nodes}=core.visible(doc);
    return {
      title:doc.title,
      people:nodes.map(({personId,parentId,fullName})=>({id:personId,parentId,name:fullName}))
    };
  }

  function projection(snapshot,account){
    const scope=new Set(),writable=new Set(),addable=new Set();
    const permissions=permissionsFor(account);
    const rows=snapshot.people.map(person=>{
      const {id,parentId}=person;
      if(account.role==='admin'||id===account.person_id||scope.has(parentId))scope.add(id);
      if(scope.has(id)&&permissions.edit)writable.add(id);
      if(scope.has(id)&&permissions.add)addable.add(id);
      return {...person,writable:writable.has(id),addable:addable.has(id)};
    });
    return {rows,writable,addable,scope};
  }

  function permissionsFor(account){
    if(account.role==='admin')return {add:true,edit:true};
    const saved=db.prepare('SELECT can_add,can_edit FROM account_permissions WHERE account_id=?').get(account.id);
    return saved?{add:!!saved.can_add,edit:!!saved.can_edit}:{add:true,edit:true};
  }

  function requirePermission(account,permission){
    if(!permissionsFor(account)[permission])throw bad(403,error.forbidden);
  }

  function accountContext(account){
    const rows=publicTree(tree()).people;
    const daughter=db.prepare('SELECT father_id FROM private_daughters WHERE id=?').get(account.person_id);
    let parentId=daughter?.father_id||rows.find(row=>row.id===account.person_id)?.parentId;
    const lineage=[],seen=new Set([account.person_id]);
    while(parentId&&!seen.has(parentId)){
      const parent=rows.find(row=>row.id===parentId);
      if(!parent)break;
      seen.add(parentId);
      lineage.push({id:parent.id,name:parent.name,
        relationship:lineage.length===0?'father':lineage.length===1?'grandfather':'ancestor'});
      parentId=parent.parentId;
    }
    const invitation=db.prepare(`SELECT p.inviter_person,p.inviter_name,a.role AS inviter_role
      FROM account_permissions p LEFT JOIN accounts a ON a.id=p.invited_by WHERE p.account_id=?`).get(account.id);
    const invitedBy=invitation?.inviter_name?{
      name:invitation.inviter_name,personId:invitation.inviter_person,
      relationship:lineage[0]?.id===invitation.inviter_person?'father':invitation.inviter_role==='admin'?'admin':'family'
    }:null;
    return {permissions:permissionsFor(account),invitedBy,lineage};
  }

  function version(){
    const row=db.prepare(`SELECT document,revision,previous FROM tree
      JOIN tree_revision ON tree.id=tree_revision.id WHERE tree.id=1`).get();
    return {current:publicTree(JSON.parse(row.document)),revision:row.revision,
      previous:row.previous&&JSON.parse(row.previous)};
  }

  function treeView({current,revision,previous},account,showAll=false){
    const records=showAll
      ? db.prepare('SELECT id,father_id,name FROM private_daughters ORDER BY rowid').all()
      : db.prepare('SELECT id,father_id,name FROM private_daughters WHERE father_id=? OR id=? ORDER BY rowid')
        .all(account.person_id,account.person_id);
    const privatePeople=records.map(record=>({
      id:record.id,parentId:record.father_id,name:record.name,writable:false,addable:false,gender:'f'
    }));
    const view={title:current.title,people:projection(current,account).rows,privatePeople,revision};
    if(previous)view.before={title:previous.title,revision:revision-1,
      people:previous.people.map(person=>({...person,writable:false}))};
    return view;
  }

  function saveTree(doc,previous){
    db.prepare('UPDATE tree SET document=? WHERE id=1').run(JSON.stringify(doc));
    db.prepare('UPDATE tree_revision SET revision=revision+1,previous=? WHERE id=1').run(JSON.stringify(previous));
  }

  function auditChange(account,action,summary,personIds=[],privateFather=null){
    const actor=account.person_id
      ? tree().persons.find(person=>person.personId===account.person_id)?.fullName || 'عضو العائلة'
      : 'المدير العام';
    db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?,?)').run(
      randomUUID(),Date.now(),account.id,actor,action,summary,JSON.stringify(personIds),privateFather);
  }

  function history(account){
    const scope=projection(publicTree(tree()),account).writable;
    const entries=db.prepare(`SELECT * FROM audit
      WHERE actor_id=? OR private_father=? OR (private_father IS NULL AND (? OR EXISTS (
        SELECT 1 FROM json_each(audit.person_ids) subjects
        JOIN json_each(?) visible ON subjects.value=visible.value
      ))) ORDER BY at DESC,rowid DESC LIMIT 100`)
      .all(account.id,account.person_id,Number(account.role==='admin'),JSON.stringify([...scope]))
      .map(entry=>({id:entry.id,at:entry.at,actor:entry.actor_name,action:entry.action,summary:entry.summary}));
    return {entries};
  }

  function insertChild(doc,parentId,name){
    const id=randomUUID();
    const siblingOrder=doc.relationships
      .filter(relation=>relation.parentId===parentId&&relation.type==='father')
      .reduce((max,relation)=>Math.max(max,Number(relation.siblingOrder)||0),-1)+1;
    doc.persons.push({personId:id,fullName:name,gender:'m',lifeStatus:'unknown'});
    doc.relationships.push({relationshipId:'father:'+id,type:'father',parentId,childId:id,siblingOrder});
    return id;
  }

  function validateTree(doc){
    try{core.validate(doc);}catch{throw bad(400,'تعذر حفظ التعديل ضمن حدود الشجرة الحالية.');}
  }

  function addBatch(account,data){
    requirePermission(account,'add');
    if(!Array.isArray(data.names)||data.names.length<1||data.names.length>50)
      throw bad(400,'أدخل من اسم واحد إلى ٥٠ اسمًا في الدفعة.');
    const names=data.names.map(name=>personName(name));
    const normalized=names.map(name=>name.normalize('NFC').replace(/\s+/g,' '));
    if(new Set(normalized).size!==names.length)throw bad(400,'توجد أسماء مكررة داخل الدفعة.');
    return transaction(()=>{
      const doc=tree(),before=publicTree(doc);
      if(!projection(before,account).addable.has(data.parentId))throw bad(403,error.forbidden);
      const ids=names.map(name=>insertChild(doc,data.parentId,name));
      validateTree(doc);
      saveTree(doc,before);
      auditChange(account,'batch-add','إضافة '+ids.length+' أبناء دفعة واحدة',[data.parentId,...ids]);
      return {ids};
    });
  }

  function correctionRecords(account){
    const query='SELECT c.*, m.snapshot AS merge_snapshot ' +
      'FROM corrections c LEFT JOIN correction_merges m ON m.correction_id=c.id';
    const rows=account.role==='admin'
      ? db.prepare(query+' ORDER BY c.created DESC,c.rowid DESC LIMIT 100').all()
      : db.prepare(query+' WHERE c.actor_id=? ORDER BY c.created DESC,c.rowid DESC LIMIT 100').all(account.id);
    const names=new Map(publicTree(tree()).people.map(person=>[person.id,person.name]));
    return {requests:rows.map(row=>{
      const saved=row.merge_snapshot?JSON.parse(row.merge_snapshot):null;
      return {id:row.id,personId:row.person_id,parentId:row.parent_id,note:row.note,status:row.status,
        kind:saved?'merge':'reparent',personName:names.get(row.person_id)??saved?.duplicate.fullName,
        parentName:names.get(row.parent_id)??saved?.survivor.fullName};
    })};
  }

  const mergeOptions={hasLinkedRecords(id){
    return Boolean(db.prepare('SELECT 1 FROM accounts WHERE person_id=? UNION ALL SELECT 1 FROM private_daughters WHERE father_id=? LIMIT 1').get(id,id));
  }};

  function inspectDuplicate(doc,personId,keepId,status){
    try{return duplicateCandidate(doc,personId,keepId,mergeOptions);}
    catch(error){throw bad(status,error.message);}
  }

  function proposedParent(doc,personId,parentId){
    const snapshot=publicTree(doc);
    if(personId===doc.rootPersonId||!snapshot.people.some(person=>person.id===personId)||
      !snapshot.people.some(person=>person.id===parentId))throw bad(400,'اختر فردًا وأبًا من الشجرة الرئيسية.');
    const relation=doc.relationships.find(item=>item.type==='father'&&item.childId===personId);
    if(!relation)throw bad(400,error.invalid);
    const original=relation.parentId;
    if(original===parentId)throw bad(400,'الأب المختار هو الأب الحالي.');
    relation.parentId=parentId;
    relation.siblingOrder=doc.relationships.filter(item=>item!==relation&&item.type==='father'&&item.parentId===parentId)
      .reduce((max,item)=>Math.max(max,Number(item.siblingOrder)||0),-1)+1;
    validateTree(doc);
    return original;
  }

  function createCorrection(account,data){
    requirePermission(account,'edit');
    const note=personName(data.note,1000);
    const kind=data.kind??'reparent';
    if(!['reparent','merge'].includes(kind))throw bad(400,error.invalid);
    return transaction(()=>{
      const doc=tree();
      if(!projection(publicTree(doc),account).writable.has(data.personId))throw bad(403,error.forbidden);
      const candidate=kind==='merge'?inspectDuplicate(doc,data.personId,data.parentId,400):null;
      const sourceParent=candidate?candidate.fatherId:proposedParent(doc,data.personId,data.parentId);
      if(db.prepare("SELECT id FROM corrections WHERE person_id=? AND parent_id=? AND status='pending'")
        .get(data.personId,data.parentId))throw bad(409,'يوجد طلب مطابق بانتظار المراجعة.');
      const id=randomUUID();
      db.prepare('INSERT INTO corrections VALUES(?,?,?,?,?,?,?,?)').run(
        id,account.id,data.personId,data.parentId,sourceParent,note,'pending',Date.now());
      if(candidate)db.prepare('INSERT INTO correction_merges VALUES(?,?)').run(id,JSON.stringify(candidate));
      auditChange(account,'correction-request',candidate?'إرسال طلب مراجعة اسم مكرر':'إرسال طلب تصحيح نسب',[data.personId]);
      return {id};
    });
  }

  function decideCorrection(account,id,decision){
    if(account.role!=='admin')throw bad(403,error.forbidden);
    if(!['approve','reject'].includes(decision))throw bad(400,error.invalid);
    return transaction(()=>{
      const request=db.prepare('SELECT * FROM corrections WHERE id=?').get(id);
      if(!request)throw bad(404,'طلب التصحيح غير موجود.');
      if(request.status!=='pending')throw bad(409,'حُسم هذا الطلب سابقًا.');
      const merge=db.prepare('SELECT snapshot FROM correction_merges WHERE correction_id=?').get(id);
      if(decision==='approve'){
        const doc=tree(),before=publicTree(doc);
        const relation=doc.relationships.find(item=>item.type==='father'&&item.childId===request.person_id);
        if(!relation||relation.parentId!==request.source_parent_id)
          throw bad(409,'تغيّر الأب منذ إرسال الطلب. أرسل طلبًا جديدًا.');
        if(merge){
          const candidate=inspectDuplicate(doc,request.person_id,request.parent_id,409);
          if(JSON.stringify(candidate)!==merge.snapshot)throw bad(409,'تغيّرت بيانات السجلين منذ إرسال الطلب. أرسل طلبًا جديدًا.');
          mergeDuplicate(doc,request.person_id,request.parent_id,mergeOptions);
        }else proposedParent(doc,request.person_id,request.parent_id);
        saveTree(doc,before);
      }
      const status=decision==='approve'?'approved':'rejected';
      db.prepare('UPDATE corrections SET status=? WHERE id=?').run(status,id);
      const action=merge?'merge-':'correction-';
      const summary=merge
        ? (decision==='approve'?'اعتماد دمج سجل مكرر':'رفض دمج سجل مكرر')
        : (decision==='approve'?'اعتماد تصحيح النسب':'رفض طلب تصحيح النسب');
      auditChange(account,action+status,summary,
        [request.person_id,request.source_parent_id,request.parent_id]);
      return {id,status,requesterId:request.actor_id};
    });
  }

  const viewers=new Set();
  const event=(res,name,data)=>res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  function endExpired(viewer){
    event(viewer.res,'session-expired',{});
    viewer.res.end();
    viewers.delete(viewer);
  }
  function publishTree(){
    if(!viewers.size)return;
    const snapshot=version();
    for(const viewer of viewers){
      const account=accountFor(viewer.req);
      if(!account){endExpired(viewer);continue;}
      if(snapshot.revision===viewer.revision)continue;
      if(viewer.res.writableLength>2*1024*1024){viewer.res.destroy();continue;}
      viewer.revision=snapshot.revision;
      event(viewer.res,'tree',treeView(snapshot,account));
    }
  }
  function signalPrivateChange(){
    for(const viewer of viewers){
      if(!accountFor(viewer.req)){endExpired(viewer);continue;}
      if(viewer.res.writableLength>2*1024*1024){viewer.res.destroy();continue;}
      event(viewer.res,'private-people',{});
    }
  }

  function signalCorrectionChange(requesterId){
    for(const viewer of viewers){
      const current=accountFor(viewer.req);
      if(!current){endExpired(viewer);continue;}
      if(current.role!=='admin'&&current.id!==requesterId)continue;
      if(viewer.res.writableLength>2*1024*1024){viewer.res.destroy();continue;}
      event(viewer.res,'corrections',{});
    }
  }
  function stream(req,res,account){
    if(viewers.size>=150)throw bad(503,'الاتصال المباشر مشغول. جرّب بعد قليل.');
    const snapshot=version();
    const viewer={req,res,revision:snapshot.revision};
    res.writeHead(200,{'Content-Type':'text/event-stream;charset=utf-8','X-Accel-Buffering':'no'});
    res.on('close',()=>viewers.delete(viewer));
    viewers.add(viewer);
    event(res,'tree',treeView(snapshot,account));
  }
  const heartbeat=setInterval(()=>{
    for(const viewer of viewers){
      if(!accountFor(viewer.req)){endExpired(viewer);continue;}
      viewer.res.write(': heartbeat\n\n');
    }
  },20000);
  heartbeat.unref();

  async function input(req,limit=8192) {
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw bad(415,error.invalid);
    const chunks=[];
    let size=0;
    for await(const chunk of req){
      size+=chunk.length;
      if(size>limit)throw bad(413,error.invalid);
      chunks.push(chunk);
    }
    let result;
    try {result=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw bad(400,error.invalid);}
    if(!result||typeof result!=='object'||Array.isArray(result))throw bad(400,error.invalid);
    return result;
  }

  function fields(data,allowed){
    if(Object.keys(data).some(key=>!allowed.includes(key)))throw bad(400,error.invalid);
  }

  function personTarget(account,id){
    const doc=tree(), before=publicTree(doc);
    if(projection(before,account).scope.has(id)){
      const person=doc.persons.find(item=>item.personId===id);
      return {doc,before,person,name:person.fullName};
    }
    const daughter=db.prepare('SELECT * FROM private_daughters WHERE id=?').get(id);
    if(daughter&&(account.role==='admin'||account.person_id===id||account.person_id===daughter.father_id))
      return {doc,before,daughter,name:daughter.name};
    throw bad(403,error.forbidden);
  }

  function profileDocument(id){
    const row=db.prepare('SELECT document FROM person_profiles WHERE person_id=?').get(id);
    return row?JSON.parse(row.document):{};
  }

  function genderChangeReason(account,id,target){
    if(account.role!=='admin')return 'تصحيح الجنس متاح للمدير العام.';
    const parentId=target.daughter?.father_id||target.before.people.find(row=>row.id===id)?.parentId;
    if(!parentId)return 'أصل الشجرة مرتبط بالأنساب ولا يمكن تغيير جنسه من هذه النافذة.';
    if(db.prepare('SELECT 1 FROM accounts WHERE person_id=?').get(id))return 'هذا السجل مرتبط بحساب أو دعوة.';
    if(target.doc.relationships.some(row=>row.parentId===id||(row.childId===id&&row.type!=='father'))||
      db.prepare('SELECT 1 FROM private_daughters WHERE father_id=?').get(id))return 'هذا السجل مرتبط بأبناء أو علاقات أخرى.';
    if(db.prepare('SELECT 1 FROM corrections WHERE person_id=? OR parent_id=? OR source_parent_id=?').get(id,id,id))
      return 'هذا السجل مرتبط بطلب تصحيح نسب.';
    const saved=profileDocument(id);
    if(target.daughter&&saved.genderArchive?.relationship&&target.doc.relationships.some(row=>
      row.type==='father'&&row.parentId===parentId&&row.siblingOrder===saved.genderArchive.relationship.siblingOrder))
      return 'ترتيب الإخوة السابق مشغول بسجل أحدث ويحتاج مراجعة المدير.';
    return '';
  }

  function profileFor(id,target,account){
    const saved=profileDocument(id);
    const reason=genderChangeReason(account,id,target);
    return {name:target.name,gender:target.daughter?'f':'m',
      lifeStatus:saved.lifeStatus||target.person?.lifeStatus||'unknown',
      phone:saved.phone||'',email:saved.email||'',photo:saved.photo||'',birthDate:saved.birthDate||'',
      canChangeGender:!reason,genderChangeReason:reason};
  }

  function profileValues(data,previous={}){
    const lifeStatus=data.lifeStatus===undefined?previous.lifeStatus||'unknown':data.lifeStatus;
    const phone=data.phone===undefined?previous.phone||'':data.phone;
    const email=data.email===undefined?previous.email||'':data.email;
    const photo=data.photo===undefined?previous.photo||'':data.photo;
    const birthDate=data.birthDate===undefined?previous.birthDate||'':data.birthDate;
    if(!['unknown','living','deceased'].includes(lifeStatus)||typeof phone!=='string'||
      (phone&&!/^[+\d٠-٩۰-۹() -]{7,32}$/u.test(phone))||typeof email!=='string'||
      (email&&(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)))||typeof photo!=='string'||
      (photo&&(photo.length>180000||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(photo))))
      throw bad(400,'راجع الحالة وبيانات التواصل وصيغة الصورة.');
    if(typeof birthDate!=='string'||(birthDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)||
      birthDate<'0001-01-01'||birthDate>new Date().toISOString().slice(0,10)||
      !Number.isFinite(Date.parse(birthDate+'T00:00:00Z'))||
      new Date(birthDate+'T00:00:00Z').toISOString().slice(0,10)!==birthDate)))
      throw bad(400,'أدخل تاريخ ميلاد ميلاديًا صحيحًا لا يتجاوز اليوم.');
    return {...previous,lifeStatus,phone,email,photo,birthDate};
  }

  function storeProfile(id,profile){
    db.prepare('INSERT INTO person_profiles VALUES(?,?) ON CONFLICT(person_id) DO UPDATE SET document=excluded.document')
      .run(id,JSON.stringify(profile));
  }

  function changeGender(account,id,target,gender,profile,name){
    const reason=genderChangeReason(account,id,target);
    if(reason)throw bad(409,reason);
    const {doc,person,daughter}=target;
    if(gender==='f'){
      const relation=doc.relationships.find(row=>row.childId===id&&row.type==='father');
      if(!relation)throw bad(409,'تعذر تحديد علاقة الأبوة لهذا السجل.');
      profile.genderArchive={person,relationship:relation,index:doc.persons.indexOf(person),relationshipIndex:doc.relationships.indexOf(relation)};
      doc.persons=doc.persons.filter(row=>row.personId!==id);
      doc.relationships=doc.relationships.filter(row=>row!==relation);
      db.prepare('INSERT INTO private_daughters VALUES(?,?,?)').run(id,relation.parentId,name);
      db.prepare(`UPDATE audit SET private_father=? WHERE EXISTS (
        SELECT 1 FROM json_each(audit.person_ids) WHERE value=?
      )`).run(relation.parentId,id);
    }else{
      const archived=profile.genderArchive;
      const restored={...(archived?.person||{}),personId:id,fullName:name,gender:'m',lifeStatus:profile.lifeStatus};
      const siblingOrder=doc.relationships.filter(row=>row.parentId===daughter.father_id&&row.type==='father')
        .reduce((max,row)=>Math.max(max,Number(row.siblingOrder)||0),-1)+1;
      const relation={...(archived?.relationship||{}),relationshipId:archived?.relationship?.relationshipId||'father:'+id,
        type:'father',parentId:daughter.father_id,childId:id,
        siblingOrder:archived?.relationship?.siblingOrder??siblingOrder};
      doc.persons.splice(archived?Math.min(archived.index,doc.persons.length):doc.persons.length,0,restored);
      doc.relationships.splice(archived?Math.min(archived.relationshipIndex??doc.relationships.length,doc.relationships.length):doc.relationships.length,0,relation);
      db.prepare('DELETE FROM private_daughters WHERE id=?').run(id);
    }
    validateTree(doc);
    // A former public name must not be returned as the comparison after it becomes private.
    saveTree(doc,publicTree(doc));
  }

  function saveProfile(account,id,data){
    requirePermission(account,'edit');
    return transaction(()=>{
      const target=personTarget(account,id);
      const {doc,before,person,daughter}=target;
      const name=personName(data.name);
      const profile=profileValues(data,{lifeStatus:person?.lifeStatus||'unknown',...profileDocument(id)});
      const gender=data.gender===undefined?daughter?'f':'m':data.gender;
      if(!['m','f'].includes(gender))throw bad(400,error.invalid);
      const genderChanged=gender!==(daughter?'f':'m');
      const {lifeStatus}=profile;
      if(genderChanged)changeGender(account,id,target,gender,profile,name);
      else if(person&&(person.fullName!==name||person.lifeStatus!==lifeStatus)){
        person.fullName=name;
        person.lifeStatus=lifeStatus;
        validateTree(doc);
        saveTree(doc,before);
      }else if(daughter&&daughter.name!==name){
        db.prepare('UPDATE private_daughters SET name=? WHERE id=?').run(name,id);
      }
      storeProfile(id,profile);
      const privateFather=gender==='f'?(daughter?.father_id||before.people.find(row=>row.id===id)?.parentId):null;
      auditChange(account,'person-profile','تعديل بيانات شخص',[id],privateFather);
      return {id,gender,genderChanged};
    });
  }

  function removePerson(account,id,anchor){
    requirePermission(account,'edit');
    return transaction(()=>{
      const {doc,before,person,daughter}=personTarget(account,id);
      const parentId=daughter?.father_id||before.people.find(row=>row.id===id)?.parentId;
      if(id!==anchor&&parentId!==anchor)throw bad(403,error.forbidden);
      if(id!==anchor)personTarget(account,anchor);
      const blocked=removalBlock(doc,id,parentId);
      if(blocked)throw bad(409,blocked);
      if(daughter)db.prepare('DELETE FROM private_daughters WHERE id=?').run(id);
      if(person){
        doc.persons=doc.persons.filter(row=>row.personId!==id);
        doc.relationships=doc.relationships.filter(row=>row.childId!==id);
        validateTree(doc);
        saveTree(doc,before);
      }
      db.prepare('DELETE FROM person_profiles WHERE person_id=?').run(id);
      auditChange(account,'person-remove','حذف سجل شخص',[id],daughter?.father_id);
      return {id,private:!!daughter};
    });
  }

  function removalBlock(doc,id,parentId){
    if(!parentId)return 'لا يمكن حذف أصل الشجرة.';
    if(db.prepare('SELECT 1 FROM accounts WHERE person_id=?').get(id))return 'هذا الشخص مرتبط بحساب أو دعوة.';
    if(doc.relationships.some(row=>row.parentId===id||(row.childId===id&&row.type!=='father'))||
      db.prepare('SELECT 1 FROM private_daughters WHERE father_id=?').get(id))return 'لا يمكن حذف شخص له أبناء أو علاقات مرتبطة.';
    if(db.prepare("SELECT 1 FROM corrections WHERE status='pending' AND (person_id=? OR parent_id=? OR source_parent_id=?)").get(id,id,id))
      return 'يوجد طلب تصحيح قيد المراجعة لهذا الشخص.';
    return null;
  }

  function removalOptions(account,id){
    requirePermission(account,'edit');
    const {before,doc,daughter,name}=personTarget(account,id);
    const males=projection(before,account).writable;
    const direct=before.people.filter(row=>row.parentId===id&&males.has(row.id));
    if(account.role==='admin'||account.person_id===id){
      const daughters=db.prepare('SELECT id,name FROM private_daughters WHERE father_id=? ORDER BY rowid').all(id);
      direct.push(...daughters.map(row=>({...row,gender:'f'})));
    }
    const parentId=daughter?.father_id||before.people.find(person=>person.id===id)?.parentId;
    return {options:[{id,name,gender:daughter?'f':'m'},...direct].filter(row=>
      !removalBlock(doc,row.id,row.id===id?parentId:id))};
  }

  function updatePerson(account,personId,data,method){
    requirePermission(account,method==='POST'?'add':'edit');
    return transaction(()=>{
      const doc=tree();
      const before=publicTree(doc);
      const allowed=projection(before,account)[method==='POST'?'addable':'writable'];
      const name=personName(data.name);
      if(!allowed.has(personId))throw bad(403,error.forbidden);
      let id=personId;
      if(method==='POST'){
        id=insertChild(doc,personId,name);
        if(data.birthDate!==undefined||data.photo!==undefined)storeProfile(id,profileValues(data));
      }else{
        const person=doc.persons.find(person=>person.personId===id);
        if(person.fullName===name)return {id};
        person.fullName=name;
      }
      validateTree(doc);
      saveTree(doc,before);
      auditChange(account,method==='POST'?'person-add':'person-rename',
        method==='POST'?'إضافة ابن: '+name:'تصحيح اسم: '+name,[id,personId]);
      return {id};
    });
  }

  function privateDaughters(account){
    if(!canAddDaughter(account))throw bad(403,error.forbidden);
    return {daughters:db.prepare(`SELECT d.id,d.name,
      CASE WHEN a.password IS NOT NULL THEN 'active'
           WHEN a.invite_until>? THEN 'invited'
           WHEN a.id IS NOT NULL THEN 'inactive'
           ELSE 'none' END AS accountStatus
      FROM private_daughters d LEFT JOIN accounts a ON a.person_id=d.id
      WHERE d.father_id=? ORDER BY d.rowid`).all(Date.now(),account.person_id)};
  }

  function ownDaughter(account,id){
    const daughter=db.prepare('SELECT id,name FROM private_daughters WHERE id=? AND father_id=?')
      .get(id,account.person_id);
    if(!daughter)throw bad(403,error.forbidden);
    return daughter;
  }

  function expireInvalidStreams(){
    for(const viewer of viewers)if(!accountFor(viewer.req))endExpired(viewer);
  }

  function canAddDaughter(account){
    return !!account.person_id&&!db.prepare('SELECT id FROM private_daughters WHERE id=?').get(account.person_id);
  }

  function addPrivateDaughter(account,data){
    requirePermission(account,'add');
    const fatherId=data.parentId;
    const canAdd=account.role==='admin'
      ? publicTree(tree()).people.some(person=>person.id===fatherId)
      : canAddDaughter(account)&&account.person_id===fatherId;
    if(!canAdd)throw bad(403,'اختر أبًا من الشجرة. يمكن للأب إضافة بناته المباشرات.');
    const id=randomUUID();
    return transaction(()=>{
      db.prepare('INSERT INTO private_daughters VALUES(?,?,?)').run(id,fatherId,personName(data.name));
      if(data.birthDate!==undefined||data.photo!==undefined)storeProfile(id,profileValues(data));
      auditChange(account,'daughter-add','إضافة ابنة',[id],fatherId);
      return {id,private:true};
    });
  }

  async function handle(req,res){
    if(req.headers.host!==url.host)throw bad(403,error.forbidden);
    const method=req.method;
    const requestUrl=new URL(req.url,origin);
    const {pathname}=requestUrl;
    if(method==='GET'&&assets.has(pathname)){
      const [file,type]=assets.get(pathname);
      res.setHeader('Content-Type',type);
      if(file==='world/index.html'){
        const html=readFileSync(path.join(__dirname,file),'utf8');
        const map=html.match(/<script type="importmap">([^<]+)<\/script>/)[1];
        const hash=createHash('sha256').update(map).digest('base64');
        res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self' 'sha256-${hash}'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
        res.end(html.replace('data-source="demo"','data-source="account"')
          .replace('مشهد تجريبي بأسماء وهمية','عرض شجرة الحساب')
          .replace('href="../preview.html"','href="../"')
          .replace(/ *<script src="\.\.\/\.\.\/Claud\/botanical-core\.js" defer><\/script>\r?\n/,''));
        return;
      }
      res.end(readFileSync(path.join(__dirname,file)));
      return;
    }
    if(['POST','PATCH','DELETE'].includes(method)&&req.headers.origin!==origin)throw bad(403,error.forbidden);
    const account=accountFor(req);
    let payload;
    if(method==='POST'&&pathname==='/api/login'){
      const data=await input(req);fields(data,['identifier','password']);
      const id=identifier(data.identifier);
      if(typeof data.password!=='string'||Buffer.byteLength(data.password)>256)throw bad(400,error.credentials);
      const record=db.prepare('SELECT * FROM accounts WHERE identifier=?').get(id);
      const stored=record?.password||'0'.repeat(32)+':'+ '0'.repeat(128);
      const valid=await limited(req,id,async()=>{
        const actual=await passwordHash(data.password,stored.split(':')[0]);
        return timingSafeEqual(Buffer.from(actual),Buffer.from(stored));
      });
      if(!valid||!record?.password||db.prepare('SELECT password FROM accounts WHERE id=?').get(record.id)?.password!==record.password)
        throw bad(401,error.credentials);
      attemptWindow.delete((req.socket.remoteAddress||'local')+'\0'+id);
      startSession(res,record.id);payload={ok:true};
    }else if(method==='POST'&&pathname==='/api/activate'){
      const data=await input(req);fields(data,['code','initialPassword','password']);
      const password=credential(data.password);
      if(typeof data.code!=='string')throw bad(400,error.invite);
      const code=data.code.trim();
      const isFamilyCode=familyCodePattern.test(code.toLowerCase());
      const initial=data.initialPassword;
      if(isFamilyCode){
        if(typeof initial!=='string'||!/^[-\w]{22}$/.test(initial))throw bad(400,error.invite);
        if(initial===password)throw bad(400,'اختر كلمة مرور مختلفة عن كلمة المرور المؤقتة.');
      }else if(!/^[-\w]{43}$/.test(code)||initial){
        throw bad(400,error.invite);
      }
      const invitation=digest(isFamilyCode?initial:code);
      const record=isFamilyCode
        ? db.prepare('SELECT id FROM accounts WHERE identifier=? AND invitation=? AND invite_until>?')
          .get(code.toLowerCase(),invitation,Date.now())
        : db.prepare("SELECT id FROM accounts WHERE identifier NOT LIKE 'fam-%' AND invitation=? AND invite_until>?")
          .get(invitation,Date.now());
      if(!record)throw bad(400,error.invite);
      const hashed=await limited(req,'activation',()=>passwordHash(password));
      const result=db.prepare(`UPDATE accounts SET password=?,invitation=NULL,invite_until=NULL
        WHERE id=? AND invitation=? AND invite_until>?`).run(hashed,record.id,invitation,Date.now());
      if(result.changes!==1)throw bad(400,error.invite);
      startSession(res,record.id);payload={ok:true};
      if(db.prepare(`SELECT d.id FROM private_daughters d JOIN accounts a ON a.person_id=d.id
        WHERE a.id=?`).get(record.id))signalPrivateChange();
    }else{
      if(!account)throw bad(401,error.auth);
      if(method==='GET'&&pathname==='/api/me')payload={role:account.role,personId:account.person_id,
        identifier:account.identifier,canAddDaughter:canAddDaughter(account),...accountContext(account)};
      else if(method==='GET'&&pathname==='/api/tree')payload=treeView(version(),account,requestUrl.searchParams.get('scope')==='all');
      else if(method==='GET'&&pathname==='/api/private-daughters')payload=privateDaughters(account);
      else if(method==='GET'&&pathname==='/api/history')payload=history(account);
      else if(method==='GET'&&pathname==='/api/corrections')payload=correctionRecords(account);
      else if(method==='POST'&&pathname==='/api/corrections'){
        const data=await input(req);fields(data,['personId','parentId','note','kind']);
        const current=requireCurrent(req);
        payload=createCorrection(current,data);
        signalCorrectionChange(current.id);
      }
      else if(method==='POST'&&/^\/api\/corrections\/[\w-]+\/decision$/.test(pathname)){
        const data=await input(req);fields(data,['decision']);
        const {requesterId,...result}=decideCorrection(requireCurrent(req),pathname.split('/')[3],data.decision);
        payload=result;
        if(result.status==='approved')publishTree();
        signalCorrectionChange(requesterId);
      }
      else if(method==='POST'&&pathname==='/api/people/batch'){
        const data=await input(req);fields(data,['parentId','names']);
        payload=addBatch(requireCurrent(req),data);
        publishTree();
      }
      else if(method==='PATCH'&&/^\/api\/private-daughters\/[\w-]+$/.test(pathname)){
        const data=await input(req);fields(data,['name']);
        const id=pathname.split('/')[3];
        const name=personName(data.name);
        const current=requireCurrent(req);
        requirePermission(current,'edit');
        const previous=ownDaughter(current,id);
        if(previous.name!==name){
          transaction(()=>{
            db.prepare('UPDATE private_daughters SET name=? WHERE id=?').run(name,id);
            auditChange(requireCurrent(req),'daughter-rename','تصحيح اسم ابنة',[id],account.person_id);
          });
          signalPrivateChange();
        }
        payload={id};
      }
      else if(method==='POST'&&/^\/api\/private-daughters\/[\w-]+\/(invite|recover)$/.test(pathname)){
        const data=await input(req);fields(data,['permissions']);
        const [, , ,id,action]=pathname.split('/');
        payload=transaction(()=>{
          const acting=requireCurrent(req);
          ownDaughter(acting,id);
          if(action==='recover'){
            requirePermission(acting,'edit');
            const linked=db.prepare("SELECT id FROM accounts WHERE person_id=? AND role='member'").get(id);
            if(!linked)throw bad(409,'أنشئ دعوة أولى لهذا الحساب.');
            db.prepare('UPDATE accounts SET password=NULL WHERE id=?').run(linked.id);
            db.prepare('DELETE FROM sessions WHERE account_id=?').run(linked.id);
          }
          const invitation=issueInvite(id,null,acting,data.permissions,{preserve:action==='recover'});
          auditChange(acting,action==='recover'?'daughter-recover':'daughter-invite',
            action==='recover'?'استعادة دخول حساب ابنة':'إصدار دعوة لحساب ابنة',[id],acting.person_id);
          return invitation;
        });
        if(action==='recover')expireInvalidStreams();
      }
      else if(method==='GET'&&pathname==='/api/live'){stream(req,res,account);return;}
      else if(method==='POST'&&pathname==='/api/logout'){
        const token=(req.headers.cookie||'').match(/(?:^|;\s*)treef_session=([\w-]{43})/)?.[1];
        if(token)db.prepare('DELETE FROM sessions WHERE token=? AND account_id=?').run(digest(token),account.id);
        expireInvalidStreams();
        setCookie(res,'',0);payload={ok:true};
      }else if(method==='POST'&&pathname==='/api/people'){
        const data=await input(req,184000);fields(data,['parentId','name','gender','birthDate','photo']);
        if(data.gender!==undefined&&!['m','f'].includes(data.gender))throw bad(400,error.invalid);
        const acting=requireCurrent(req);
        if(data.gender==='f'){
          payload=addPrivateDaughter(acting,data);
          signalPrivateChange();
        }
        else{
          payload=updatePerson(acting,data.parentId,data,method);
          publishTree();
        }
      }else if(method==='POST'&&/^\/api\/people\/[^/]+\/invite$/.test(pathname)){
        const data=await input(req);fields(data,['permissions']);
        const id=decodeURIComponent(pathname.split('/')[3]);
        payload=transaction(()=>{
          const acting=requireCurrent(req);
          const target=personTarget(acting,id);
          const fatherId=target.daughter?.father_id||target.before.people.find(row=>row.id===id)?.parentId;
          if(acting.role!=='admin'&&(!fatherId||fatherId!==acting.person_id))throw bad(403,error.forbidden);
          const invitation=issueInvite(id,null,acting,data.permissions);
          auditChange(acting,'account-invite','إصدار دعوة لحساب عضو',[id],target.daughter?.father_id);
          return invitation;
        });
      }else if(method==='GET'&&/^\/api\/people\/[^/]+\/remove-options$/.test(pathname)){
        payload=removalOptions(account,decodeURIComponent(pathname.split('/')[3]));
      }else if(/^\/api\/people\/[^/]+\/profile$/.test(pathname)&&['GET','PATCH'].includes(method)){
        const id=decodeURIComponent(pathname.split('/')[3]);
        if(method==='GET')payload=profileFor(id,personTarget(account,id),account);
        else{
          const data=await input(req,184000);fields(data,['name','lifeStatus','phone','email','photo','birthDate','gender']);
          payload=saveProfile(requireCurrent(req),id,data);
          publishTree();
          signalPrivateChange();
        }
      }else if(method==='DELETE'&&/^\/api\/people\/[^/]+$/.test(pathname)){
        const data=await input(req);fields(data,['anchor']);
        payload=removePerson(requireCurrent(req),decodeURIComponent(pathname.split('/').at(-1)),data.anchor);
        if(payload.private)signalPrivateChange();else publishTree();
      }else if(method==='PATCH'&&/^\/api\/people\/[^/]+$/.test(pathname)){
        const data=await input(req);fields(data,['name']);
        payload=updatePerson(requireCurrent(req),decodeURIComponent(pathname.split('/').at(-1)),data,method);
        publishTree();
      }else{
        if(account.role!=='admin')throw bad(403,error.forbidden);
        payload=await admin(req,pathname,method);
      }
    }
    res.setHeader('Content-Type','application/json;charset=utf-8');
    res.end(JSON.stringify(payload));
  }

  function requireCurrent(req){
    const account=accountFor(req);
    if(!account)throw bad(401,error.auth);
    return account;
  }

  function issueInvite(personId,legacyLogin,acting,requested,{preserve=false}={}){
    const available=permissionsFor(acting);
    if(!available.add&&!available.edit)throw bad(403,error.forbidden);
    if(requested!==undefined&&(!requested||typeof requested!=='object'||Array.isArray(requested)||
      Object.keys(requested).some(key=>!['add','edit'].includes(key))||
      typeof requested.add!=='boolean'||typeof requested.edit!=='boolean'))throw bad(400,error.invalid);
    const target=db.prepare('SELECT * FROM accounts WHERE person_id=?').get(personId);
    const previous=target&&permissionsFor(target);
    let granted=requested||available;
    if(requested===undefined&&preserve&&previous)
      granted={add:available.add&&previous.add,edit:available.edit&&previous.edit};
    if(granted.add&&!available.add||granted.edit&&!available.edit)throw bad(403,error.forbidden);
    const initialPassword=legacyLogin?null:randomBytes(16).toString('base64url');
    const secret=initialPassword||randomToken();
    const previousLogin=target?.identifier;
    const login=legacyLogin||(familyCodePattern.test(previousLogin||'')?previousLogin:'fam-'+randomBytes(8).toString('hex'));
    const existing=db.prepare('SELECT * FROM accounts WHERE identifier=? OR person_id=?').all(login,personId);
    if(existing.some(record=>record.role!=='member'||record.password||record.person_id!==personId))
      throw bad(409,'يوجد حساب مفعّل أو معرّف مستخدم بالفعل.');
    if(existing.length)db.prepare('UPDATE accounts SET identifier=?,invitation=?,invite_until=? WHERE id=?')
      .run(login,digest(secret),Date.now()+86400000,existing[0].id);
    else db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?,?,?)')
      .run(randomUUID(),login,personId,'member',null,digest(secret),Date.now()+86400000);
    const recipient=db.prepare('SELECT id FROM accounts WHERE identifier=?').get(login);
    const inviterName=acting.person_id
      ? tree().persons.find(person=>person.personId===acting.person_id)?.fullName||
        db.prepare('SELECT name FROM private_daughters WHERE id=?').get(acting.person_id)?.name||'عضو العائلة'
      : 'المدير العام';
    db.prepare(`INSERT INTO account_permissions VALUES(?,?,?,?,?,?)
      ON CONFLICT(account_id) DO UPDATE SET can_add=excluded.can_add,can_edit=excluded.can_edit,
      invited_by=excluded.invited_by,inviter_person=excluded.inviter_person,inviter_name=excluded.inviter_name`)
      .run(recipient.id,Number(granted.add),Number(granted.edit),acting.id,acting.person_id,inviterName);
    return initialPassword?{code:login.toUpperCase(),initialPassword}:{code:secret};
  }

  async function admin(req,pathname,method){
    if(method==='PATCH'&&pathname==='/api/tree'){
      const data=await input(req);fields(data,['title']);
      requireCurrent(req);
      const result=transaction(()=>{
        const doc=tree();
        const title=personName(data.title,200);
        if(title===doc.title)return {ok:true};
        const before=publicTree(doc);
        doc.title=title;
        saveTree(doc,before);
        auditChange(requireCurrent(req),'title-change','تعديل عنوان الشجرة');
        return {ok:true};
      });
      publishTree();
      return result;
    }
    if(method==='GET'&&pathname==='/api/accounts'){
      const rows=db.prepare('SELECT id,identifier,person_id,role,password IS NOT NULL AS active FROM accounts ORDER BY identifier').all();
      return {accounts:rows.map(row=>({id:row.id,identifier:row.identifier,personId:row.person_id,role:row.role,active:!!row.active}))};
    }
    if(method==='POST'&&pathname==='/api/invites'){
      const data=await input(req);fields(data,['identifier','personId','permissions']);
      if(typeof data.personId!=='string')throw bad(400,error.invalid);
      const legacyLogin=data.identifier===undefined?null:identifier(data.identifier);
      if(legacyLogin&&familyCodePattern.test(legacyLogin))throw bad(400,error.invalid);
      return transaction(()=>{
        const acting=requireCurrent(req);
        if(acting.role!=='admin'||!projection(publicTree(tree()),acting).writable.has(data.personId))
          throw bad(400,error.invalid);
        const invitation=issueInvite(data.personId,legacyLogin,acting,data.permissions);
        auditChange(acting,'account-invite','إصدار دعوة لحساب عضو',[data.personId]);
        return invitation;
      });
    }
    if(method==='POST'&&/^\/api\/accounts\/[\w-]+\/revoke$/.test(pathname)){
      const id=pathname.split('/')[3];
      const result=transaction(()=>{
        const acting=requireCurrent(req);
        const linked=db.prepare('SELECT a.person_id,d.father_id FROM accounts a LEFT JOIN private_daughters d ON d.id=a.person_id WHERE a.id=?').get(id);
        const revoked=db.prepare(`UPDATE accounts SET password=NULL,invitation=NULL,invite_until=NULL WHERE id=? AND role='member'`).run(id);
        if(revoked.changes!==1)throw bad(404,'الحساب غير موجود.');
        db.prepare('DELETE FROM sessions WHERE account_id=?').run(id);
        auditChange(acting,'account-revoke','إيقاف حساب عضو',[linked.person_id],linked.father_id);
        return {ok:true};
      });
      expireInvalidStreams();
      return result;
    }
    if(method==='GET'&&pathname==='/api/backup')return tree();
    throw bad(404,'المسار غير موجود.');
  }

  const server=createServer((req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    handle(req,res).catch(e=>{
      res.statusCode=e.status||500;
      res.setHeader('Content-Type','application/json;charset=utf-8');
      res.end(JSON.stringify({error:e.status?e.message:'تعذر إتمام العملية.'}));
      if(!e.status)console.error(e.name,e.code||'');
    });
  });
  server.on('close',()=>{clearInterval(heartbeat);db.close();});
  async function initialize({login,password,document}){
    const id=identifier(login),hash=await passwordHash(credential(password));
    const doc=core.normalize(document);
    transaction(()=>{
      if(db.prepare('SELECT id FROM tree WHERE id=1').get())throw Error('Database already initialized');
      db.prepare('INSERT INTO tree VALUES(1,?)').run(JSON.stringify(doc));
      db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?,?,?)').run(randomUUID(),id,null,'admin',hash,null,null);
    });
  }
  return {server,initialize};
}

if(require.main===module){
  const mode=process.argv[2];
  const port=Number((mode==='demo'&&process.argv[3])||process.env.TREEF_PORT||4178);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
  const localOrigin=`http://127.0.0.1:${port}`;
  const listen=portal=>portal.server.listen(port,'127.0.0.1',()=>console.log(localOrigin));
  const filename=process.env.TREEF_DB;
  const fail=e=>{console.error(e.message);process.exitCode=1;};
  if(mode==='demo'){
    const portal=createPortal({filename:':memory:',origin:localOrigin});
    portal.initialize({login:'admin@example.test',password:'FamilyDemo-2026',document:core.fixture(10)})
      .then(()=>listen(portal)).catch(fail);
  }else{
    if(!filename||!path.isAbsolute(filename))throw Error('Set TREEF_DB to an absolute private database path');
    const portal=createPortal({filename,origin:process.env.TREEF_ORIGIN||localOrigin});
    if(mode==='init'){
      const document=JSON.parse(readFileSync(process.argv[3],'utf8').replace(/^\uFEFF/,''));
      portal.initialize({login:process.env.TREEF_ADMIN,password:process.env.TREEF_ADMIN_PASSWORD,document})
        .then(()=>console.log('Family portal initialized.')).catch(fail);
    }else{
      listen(portal);
    }
  }
}

module.exports={createPortal};
