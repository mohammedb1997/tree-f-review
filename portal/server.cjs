'use strict';

const {createServer} = require('node:http');
const {DatabaseSync} = require('node:sqlite');
const {createHash, randomBytes, randomUUID, scrypt, timingSafeEqual} = require('node:crypto');
const {promisify} = require('node:util');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const core = require('../Claud/botanical-core.js');

const derive = promisify(scrypt);
const digest = value => createHash('sha256').update(value).digest('hex');
const randomToken = () => randomBytes(32).toString('base64url');
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
  ['/portal/style.css',['style.css','text/css;charset=utf-8']]
]);

function identifier(value) {
  if(typeof value!=='string'||value.length>254)throw bad(400,error.invalid);
  const clean=value.trim().toLowerCase().replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean))return clean;
  const phone=clean.replace(/[\s()-]/g,'');
  if(/^05\d{8}$/.test(phone))return '+966'+phone.slice(1);
  if(/^\+[1-9]\d{7,14}$/.test(phone))return phone;
  throw bad(400,'أدخل بريدًا إلكترونيًا أو رقم جوال مع رمز الدولة.');
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
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, identifier TEXT UNIQUE NOT NULL, person_id TEXT UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('admin','member')), password TEXT,
      invitation TEXT UNIQUE, invite_until INTEGER
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL
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

  function projection(doc,account){
    const {nodes}=core.visible(doc);
    const writable=new Set();
    const rows=[];
    for(const person of nodes){
      const {personId:id,parentId}=person;
      if(account.role==='admin'||id===account.person_id||writable.has(parentId))writable.add(id);
      rows.push({id,parentId,name:person.fullName,writable:writable.has(id)});
    }
    return {rows,writable};
  }

  async function input(req) {
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw bad(415,error.invalid);
    const chunks=[];
    let size=0;
    for await(const chunk of req){
      size+=chunk.length;
      if(size>8192)throw bad(413,error.invalid);
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

  function updatePerson(account,personId,data,method){
    return transaction(()=>{
      const doc=tree();
      const {writable}=projection(doc,account);
      const name=personName(data.name);
      if(!writable.has(personId))throw bad(403,error.forbidden);
      let id=personId;
      if(method==='POST'){
        id=randomUUID();
        const siblingOrder=doc.relationships
          .filter(relation=>relation.parentId===personId&&relation.type==='father')
          .reduce((max,relation)=>Math.max(max,Number(relation.siblingOrder)||0),-1)+1;
        doc.persons.push({personId:id,fullName:name,gender:'m',lifeStatus:'unknown'});
        doc.relationships.push({relationshipId:'father:'+id,type:'father',parentId:personId,childId:id,siblingOrder});
      }else{doc.persons.find(person=>person.personId===id).fullName=name;}
      try{core.validate(doc);}catch{throw bad(400,'تعذر حفظ التعديل ضمن حدود الشجرة الحالية.');}
      db.prepare('UPDATE tree SET document=? WHERE id=1').run(JSON.stringify(doc));
      return {id};
    });
  }

  async function handle(req,res){
    if(req.headers.host!==url.host)throw bad(403,error.forbidden);
    const method=req.method;
    const pathname=new URL(req.url,origin).pathname;
    if(method==='GET'&&assets.has(pathname)){
      const [file,type]=assets.get(pathname);
      res.setHeader('Content-Type',type);
      res.end(readFileSync(path.join(__dirname,file)));
      return;
    }
    if(['POST','PATCH'].includes(method)&&req.headers.origin!==origin)throw bad(403,error.forbidden);
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
      const data=await input(req);fields(data,['code','password']);
      const password=credential(data.password);
      if(typeof data.code!=='string'||!/^[-\w]{43}$/.test(data.code))throw bad(400,error.invite);
      const invitation=digest(data.code);
      const record=db.prepare('SELECT id FROM accounts WHERE invitation=? AND invite_until>?').get(invitation,Date.now());
      if(!record)throw bad(400,error.invite);
      const hashed=await limited(req,'activation',()=>passwordHash(password));
      const result=db.prepare(`UPDATE accounts SET password=?,invitation=NULL,invite_until=NULL
        WHERE id=? AND invitation=? AND invite_until>?`).run(hashed,record.id,invitation,Date.now());
      if(result.changes!==1)throw bad(400,error.invite);
      startSession(res,record.id);payload={ok:true};
    }else{
      if(!account)throw bad(401,error.auth);
      if(method==='GET'&&pathname==='/api/me')payload={role:account.role,personId:account.person_id,identifier:account.identifier};
      else if(method==='GET'&&pathname==='/api/tree'){
        const doc=tree();
        payload={title:doc.title,people:projection(doc,account).rows};
      }
      else if(method==='POST'&&pathname==='/api/logout'){
        const token=(req.headers.cookie||'').match(/(?:^|;\s*)treef_session=([\w-]{43})/)?.[1];
        if(token)db.prepare('DELETE FROM sessions WHERE token=? AND account_id=?').run(digest(token),account.id);
        setCookie(res,'',0);payload={ok:true};
      }else if(method==='POST'&&pathname==='/api/people'){
        const data=await input(req);fields(data,['parentId','name']);
        payload=updatePerson(requireCurrent(req),data.parentId,data,method);
      }else if(method==='PATCH'&&/^\/api\/people\/[^/]+$/.test(pathname)){
        const data=await input(req);fields(data,['name']);
        payload=updatePerson(requireCurrent(req),decodeURIComponent(pathname.split('/').at(-1)),data,method);
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

  async function admin(req,pathname,method){
    if(method==='PATCH'&&pathname==='/api/tree'){
      const data=await input(req);fields(data,['title']);
      requireCurrent(req);
      return transaction(()=>{
        const doc=tree();
        doc.title=personName(data.title,200);
        db.prepare('UPDATE tree SET document=? WHERE id=1').run(JSON.stringify(doc));
        return {ok:true};
      });
    }
    if(method==='GET'&&pathname==='/api/accounts'){
      const rows=db.prepare('SELECT id,identifier,person_id,role,password IS NOT NULL AS active FROM accounts ORDER BY identifier').all();
      return {accounts:rows.map(row=>({id:row.id,identifier:row.identifier,personId:row.person_id,role:row.role,active:!!row.active}))};
    }
    if(method==='POST'&&pathname==='/api/invites'){
      const data=await input(req);fields(data,['identifier','personId']);
      const login=identifier(data.identifier);
      if(typeof data.personId!=='string')throw bad(400,error.invalid);
      const code=randomToken();
      return transaction(()=>{
        if(!projection(tree(),requireCurrent(req)).writable.has(data.personId))throw bad(400,error.invalid);
        const existing=db.prepare('SELECT * FROM accounts WHERE identifier=? OR person_id=?').all(login,data.personId);
        if(existing.some(record=>record.role!=='member'||record.password||record.person_id!==data.personId))
          throw bad(409,'البريد أو الرقم أو الشخص مرتبط بحساب آخر.');
        if(existing.length)db.prepare('UPDATE accounts SET identifier=?,invitation=?,invite_until=? WHERE id=?')
          .run(login,digest(code),Date.now()+86400000,existing[0].id);
        else db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?,?,?)')
          .run(randomUUID(),login,data.personId,'member',null,digest(code),Date.now()+86400000);
        return {code};
      });
    }
    if(method==='POST'&&/^\/api\/accounts\/[\w-]+\/revoke$/.test(pathname)){
      const id=pathname.split('/')[3];
      return transaction(()=>{
        const revoked=db.prepare(`UPDATE accounts SET password=NULL,invitation=NULL,invite_until=NULL WHERE id=? AND role='member'`).run(id);
        if(revoked.changes!==1)throw bad(404,'الحساب غير موجود.');
        db.prepare('DELETE FROM sessions WHERE account_id=?').run(id);
        return {ok:true};
      });
    }
    if(method==='GET'&&pathname==='/api/backup')return tree();
    throw bad(404,'المسار غير موجود.');
  }

  const server=createServer((req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    handle(req,res).catch(e=>{
      res.statusCode=e.status||500;
      res.setHeader('Content-Type','application/json;charset=utf-8');
      res.end(JSON.stringify({error:e.status?e.message:'تعذر إتمام العملية.'}));
      if(!e.status)console.error(e.name,e.code||'');
    });
  });
  server.on('close',()=>db.close());
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
  const port=Number(process.env.TREEF_PORT||4178);
  const localOrigin=`http://127.0.0.1:${port}`;
  const listen=portal=>portal.server.listen(port,'127.0.0.1',()=>console.log(localOrigin));
  const filename=process.env.TREEF_DB;
  const mode=process.argv[2];
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
