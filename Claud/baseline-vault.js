/* Content-addressed local baseline retention. No pruning, inference, or application. */
(function(scope){'use strict';
 const MAX_ENTRIES=10,MAX_BYTES=48*1024*1024,MAX_SNAPSHOT_BYTES=20*1024*1024,hex=/^[a-f0-9]{64}$/;
 const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x),exact=(x,keys)=>object(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.prototype.hasOwnProperty.call(x,k));
 const bytes=x=>new TextEncoder().encode(x).length;
 function create({store,core:C,hash,scopeId}){
  const fail=code=>Object.assign(Error(code),{code}),check=(ok,code='BASELINE_VAULT_INVALID')=>{if(!ok)throw fail(code);};
  check(typeof store?.read==='function'&&typeof store?.compareAndSwap==='function'&&typeof C?.validate==='function'&&typeof hash==='function'&&typeof scopeId==='string'&&scopeId.length>0);
  let tail=Promise.resolve();
  function snapshot(text){check(typeof text==='string'&&bytes(text)<=MAX_SNAPSHOT_BYTES,'BASELINE_VAULT_SNAPSHOT_LIMIT');let d;try{d=JSON.parse(text);}catch{throw fail('BASELINE_VAULT_SNAPSHOT_INVALID');}check(object(d)&&d.schemaVersion===2&&JSON.stringify(d)===text,'BASELINE_VAULT_SNAPSHOT_INVALID');try{C.validate(d);}catch{throw fail('BASELINE_VAULT_SNAPSHOT_INVALID');}return text;}
  function verify(raw){
   if(raw===null)return null;check(exact(raw,['token','state'])&&raw.token===hash(JSON.stringify(raw.state)),'BASELINE_VAULT_STORAGE_INVALID');const s=raw.state;
   check(exact(s,['kind','version','scopeId','entries'])&&s.kind==='family-baseline-vault'&&s.version===1&&s.scopeId===scopeId,'BASELINE_VAULT_SCOPE_INVALID');
   check(Array.isArray(s.entries)&&s.entries.length<=MAX_ENTRIES&&bytes(JSON.stringify(s))<=MAX_BYTES,'BASELINE_VAULT_CAPACITY');const seen=new Set();
   for(const e of s.entries){check(exact(e,['hash','snapshotText'])&&typeof e.hash==='string'&&hex.test(e.hash)&&!seen.has(e.hash),'BASELINE_VAULT_STORAGE_INVALID');snapshot(e.snapshotText);check(e.hash===hash(e.snapshotText),'BASELINE_VAULT_STORAGE_INVALID');seen.add(e.hash);}return JSON.parse(JSON.stringify(raw));
  }
  const read=async()=>verify(await store.read());
  function enqueue(fn){const p=tail.then(fn);tail=p.then(()=>undefined,()=>undefined);return p;}
  function save(snapshotText){try{snapshot(snapshotText);}catch(e){return Promise.reject(e);}const contentHash=hash(snapshotText);return enqueue(async()=>{
   for(let attempt=0;attempt<6;attempt++){
    const r=await read(),existing=r?.state.entries.find(e=>e.hash===contentHash);if(existing){check(existing.snapshotText===snapshotText,'BASELINE_VAULT_COLLISION');return{saved:true,hash:contentHash,deduplicated:true};}
    const state=r?r.state:{kind:'family-baseline-vault',version:1,scopeId,entries:[]};check(state.entries.length<MAX_ENTRIES,'BASELINE_VAULT_CAPACITY');state.entries.push({hash:contentHash,snapshotText});check(bytes(JSON.stringify(state))<=MAX_BYTES,'BASELINE_VAULT_CAPACITY');
    let problem=null;try{const ack=await store.compareAndSwap(r?.token??null,state);check(ack?.token===hash(JSON.stringify(state)),'BASELINE_VAULT_ACK_UNCERTAIN');}catch(e){problem=e;}
    let actual;try{actual=await read();}catch{throw fail('BASELINE_VAULT_RECHECK_REQUIRED');}
    const saved=actual?.state.entries.find(e=>e.hash===contentHash);if(saved){check(saved.snapshotText===snapshotText,'BASELINE_VAULT_COLLISION');return{saved:true,hash:contentHash,recoveredAcknowledgement:!!problem};}
    if(problem?.code==='HISTORY_CONFLICT')continue;
    throw problem||fail('BASELINE_VAULT_ACK_UNCERTAIN');
   }throw fail('BASELINE_VAULT_CONFLICT');
  });}
  function find(contentHash){return enqueue(async()=>{check(typeof contentHash==='string'&&hex.test(contentHash),'BASELINE_VAULT_HASH_INVALID');const r=await read();return r?.state.entries.find(e=>e.hash===contentHash)?.snapshotText??null;});}
  function exportText(){return enqueue(async()=>{const r=await read();return JSON.stringify(r?r.state:{kind:'family-baseline-vault',version:1,scopeId,entries:[]});});}
  return Object.freeze({save,find,exportText});
 }
 const api={create,MAX_ENTRIES,MAX_BYTES,MAX_SNAPSHOT_BYTES};if(typeof module!=='undefined')module.exports=api;else scope.FamilyBaselineVault=api;
})(globalThis);
