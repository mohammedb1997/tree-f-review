/* Generated local storage dependencies; rebuild with tests/build-family-save-runtime.cjs. */
(function(){const factories={},cache={};
factories["hash"]=function(module,exports,require,Buffer){
/* Small synchronous SHA-256 bridge for the isolated lab's Node modules. */
(function(root){
  'use strict';
  const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const ro=(x,n)=>(x>>>n)|(x<<(32-n));
  function sha(text){
    const input=new TextEncoder().encode(text),length=Math.ceil((input.length+9)/64)*64,data=new Uint8Array(length),view=new DataView(data.buffer);
    data.set(input);data[input.length]=128;view.setUint32(length-8,Math.floor(input.length/0x20000000));view.setUint32(length-4,(input.length*8)>>>0);
    const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],w=new Uint32Array(64);
    for(let offset=0;offset<length;offset+=64){
      for(let i=0;i<16;i++)w[i]=view.getUint32(offset+i*4);
      for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=(w[i-16]+(ro(a,7)^ro(a,18)^(a>>>3))+w[i-7]+(ro(b,17)^ro(b,19)^(b>>>10)))>>>0;}
      let [a,b,c,d,e,f,g,j]=h;
      for(let i=0;i<64;i++){const t1=(j+(ro(e,6)^ro(e,11)^ro(e,25))+((e&f)^(~e&g))+k[i]+w[i])>>>0,t2=((ro(a,2)^ro(a,13)^ro(a,22))+((a&b)^(a&c)^(b&c)))>>>0;j=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
      [a,b,c,d,e,f,g,j].forEach((v,i)=>h[i]=(h[i]+v)>>>0);
    }
    return h.map(v=>v.toString(16).padStart(8,'0')).join('');
  }
  const api={sha,byteLength:text=>new TextEncoder().encode(text).length,createHash(algorithm){if(algorithm!=='sha256')throw Error('Unsupported laboratory hash');let text='';return{update(value,encoding='utf8'){if(typeof value!=='string'||encoding!=='utf8')throw Error('Unsupported laboratory hash input');text+=value;return this;},digest(format){if(format!=='hex')throw Error('Unsupported laboratory digest');return sha(text);}};}};
  if(typeof module!=='undefined')module.exports=api;else root.TreeHistoryLabHash=api;
})(globalThis);

};
factories["model"]=function(module,exports,require,Buffer){
'use strict';
// Design proof only. No browser, storage, network, timers, or application hooks.
const {createHash}=require('node:crypto');
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k),clone=o=>JSON.parse(JSON.stringify(o));
const sha=text=>createHash('sha256').update(text,'utf8').digest('hex');
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const image=/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const digest=/^[a-f0-9]{64}$/;
const actions=['baseline','edit','presentation','add','delete','import','undo','redo','restore'];
function fail(code,message){const error=Error(message);error.code=code;throw error;}
function check(condition,message='Invalid history model'){if(!condition)fail('HISTORY_INVALID',message);}
const record=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
function scopeValid(id){return typeof id==='string'&&/^[A-Za-z0-9._:-]{1,100}$/.test(id);}
function limitsValid(limits){return record(limits)&&Number.isSafeInteger(limits.maxRevisions)&&limits.maxRevisions>=1&&limits.maxRevisions<=100&&Number.isSafeInteger(limits.maxBytes)&&limits.maxBytes>0;}
function metadataValid(m){
  return record(m)&&actions.includes(m.action)&&typeof m.actorLabel==='string'&&m.actorLabel.length<=200&&typeof m.reason==='string'&&m.reason.length<=1000&&
    typeof m.createdAt==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(m.createdAt)&&Number.isFinite(Date.parse(m.createdAt))&&new Date(m.createdAt).toISOString()===m.createdAt&&
    (m.restoredFromSequence===undefined||(m.action==='restore'&&Number.isSafeInteger(m.restoredFromSequence)&&m.restoredFromSequence>0));
}
function parseSnapshot(snapshot,validate){
  check(typeof snapshot==='string'&&typeof validate==='function','A compact snapshot and validator are required');
  let doc;try{doc=JSON.parse(snapshot);}catch(_){fail('HISTORY_INVALID','Snapshot JSON is invalid');}
  check(record(doc)&&JSON.stringify(doc)===snapshot,'Snapshot must match current compact JSON serialization');
  check(validate(doc)!==false,'Snapshot validator declined');
  check(JSON.stringify(doc)===snapshot,'Snapshot validator must not normalize or mutate the candidate');
  return doc;
}
function assertScope(state,expectedScopeId){
  check(record(state)&&state.format===1&&scopeValid(state.scopeId)&&limitsValid(state.limits),'Unsupported history envelope');
  if(expectedScopeId!==state.scopeId)fail('HISTORY_SCOPE','The local history scope does not match');
}
function create(scopeId,{maxRevisions=30,maxBytes=20*1024*1024}={}){
  check(scopeValid(scopeId)&&limitsValid({maxRevisions,maxBytes}));
  const state={format:1,scopeId,limits:{maxRevisions,maxBytes},nextSequence:1,head:null,revisions:[],assets:{}};
  if(bytes(state)>maxBytes)fail('HISTORY_CAPACITY','Even an empty history cannot fit the logical byte budget');return state;
}
function pack(snapshot,scopeId,sequence,metadata,validate){
  const body=parseSnapshot(snapshot,validate),bindings=[],assets={};
  function visit(value,parent,key,path){
    if(typeof value==='string'&&image.test(value)){
      const assetId=sha(value);assets[assetId]=value;bindings.push({path,assetId});parent[key]=null;
    }else if(value&&typeof value==='object')for(const k of Object.keys(value))visit(value[k],value,k,[...path,Array.isArray(value)?Number(k):k]);
  }
  visit(body,null,null,[]);
  const manifest={format:1,scopeId,sequence,metadata,documentHash:sha(snapshot),body:JSON.stringify(body),bindings};
  return{revision:{manifest,manifestHash:sha(JSON.stringify(manifest))},assets};
}
function decode(revision,assets,scopeId,validate){
  check(record(revision)&&record(revision.manifest)&&typeof revision.manifestHash==='string'&&digest.test(revision.manifestHash));
  const m=revision.manifest;
  check(sha(JSON.stringify(m))===revision.manifestHash,'Manifest integrity mismatch');
  check(m.format===1&&m.scopeId===scopeId&&Number.isSafeInteger(m.sequence)&&m.sequence>0&&metadataValid(m.metadata)&&digest.test(m.documentHash));
  if(m.metadata.action==='restore')check(Number.isSafeInteger(m.metadata.restoredFromSequence)&&m.metadata.restoredFromSequence<m.sequence,'Invalid historical restore target');
  check(typeof m.body==='string'&&Array.isArray(m.bindings),'Invalid snapshot body');
  let doc;try{doc=JSON.parse(m.body);}catch(_){fail('HISTORY_INVALID','Manifest body JSON is invalid');}
  check(record(doc)&&JSON.stringify(doc)===m.body,'Manifest body must be compact JSON');
  const paths=new Set();
  for(const binding of m.bindings){
    check(record(binding)&&Array.isArray(binding.path)&&binding.path.length>0&&typeof binding.assetId==='string'&&digest.test(binding.assetId));
    const key=JSON.stringify(binding.path);check(!paths.has(key),'Duplicate asset binding');paths.add(key);
    check(own(assets,binding.assetId),'Missing asset');
    const value=assets[binding.assetId];check(typeof value==='string'&&image.test(value)&&sha(value)===binding.assetId,'Asset integrity mismatch');
    let parent=doc;
    for(let index=0;index<binding.path.length;index++){
      const part=binding.path[index],array=Array.isArray(parent);
      check(parent!==null&&typeof parent==='object'&&(array?Number.isSafeInteger(part)&&part>=0&&part<parent.length:typeof part==='string')&&own(parent,part),'Invalid asset path');
      if(index===binding.path.length-1){check(parent[part]===null,'Asset slot must be null');Object.defineProperty(parent,part,{value,writable:true,enumerable:true,configurable:true});}
      else parent=parent[part];
    }
  }
  const snapshot=JSON.stringify(doc);check(sha(snapshot)===m.documentHash,'Reconstructed document integrity mismatch');
  return{snapshot,document:parseSnapshot(snapshot,validate)};
}
function gc(state){
  const keep=new Set(state.revisions.flatMap(r=>r.manifest.bindings.map(b=>b.assetId)));
  for(const id of Object.keys(state.assets))if(!keep.has(id))delete state.assets[id];
}
async function validateAll(state,{expectedScopeId,validate}={}){
  assertScope(state,expectedScopeId);
  check(Array.isArray(state.revisions)&&record(state.assets)&&state.revisions.length<=state.limits.maxRevisions&&Number.isSafeInteger(state.nextSequence)&&state.nextSequence>0);
  let previous=0;const used=new Set();
  for(const revision of state.revisions){
    decode(revision,state.assets,state.scopeId,validate);
    check(previous===0?revision.manifest.sequence>0:revision.manifest.sequence===previous+1,'Retained revision sequences must be consecutive');previous=revision.manifest.sequence;
    for(const binding of revision.manifest.bindings)used.add(binding.assetId);
  }
  check(state.head===(state.revisions.length?previous:null)&&state.nextSequence===previous+1,'Invalid current head/sequence');
  if(!state.revisions.length)check(state.nextSequence===1,'Empty history must be new');
  const bySequence=new Map(state.revisions.map(r=>[r.manifest.sequence,r.manifest]));
  for(const {manifest}of state.revisions)if(manifest.metadata.action==='restore'){
    const target=bySequence.get(manifest.metadata.restoredFromSequence);
    if(target)check(target.documentHash===manifest.documentHash,'Retained restore provenance does not match its target');
  }
  check(Object.keys(state.assets).every(id=>digest.test(id)&&used.has(id))&&used.size===Object.keys(state.assets).length,'Orphan or extra assets');
  check(bytes(state)<=state.limits.maxBytes,'History already exceeds its logical byte budget');
  return{revisions:state.revisions.length,assets:used.size,bytes:bytes(state)};
}
async function append(state,snapshot,metadata,{expectedScopeId,expectedHead,validate}={}){
  await validateAll(state,{expectedScopeId,validate});
  if(expectedHead!==state.head)fail('HISTORY_CONFLICT','The expected head is stale');
  const next=clone(state),event={actorLabel:'',reason:'',...clone(metadata)};
  check(metadataValid(event),'Invalid client-supplied event metadata');
  if(event.action==='restore')check(Number.isSafeInteger(event.restoredFromSequence)&&next.revisions.some(r=>r.manifest.sequence===event.restoredFromSequence),'Restore target must still exist');
  const sequence=next.nextSequence;check(sequence<Number.MAX_SAFE_INTEGER,'History sequence is exhausted');
  const packed=pack(snapshot,next.scopeId,sequence,event,validate);next.revisions.push(packed.revision);
  if(event.action==='restore')check(state.revisions.find(r=>r.manifest.sequence===event.restoredFromSequence).manifest.documentHash===packed.revision.manifest.documentHash,'Restore snapshot differs from the selected target');
  Object.assign(next.assets,packed.assets);next.head=sequence;next.nextSequence=sequence+1;
  while(next.revisions.length>next.limits.maxRevisions)next.revisions.shift();gc(next);
  while(bytes(next)>next.limits.maxBytes&&next.revisions.length>1){next.revisions.shift();gc(next);}
  if(bytes(next)>next.limits.maxBytes)fail('HISTORY_CAPACITY','The newest complete snapshot cannot fit; existing history was not changed');
  await validateAll(next,{expectedScopeId,validate});return next;
}
async function restore(state,sequence,{expectedScopeId,validate}={}){
  await validateAll(state,{expectedScopeId,validate});
  const revision=state.revisions.find(r=>r.manifest.sequence===sequence);check(revision,'Requested revision is unavailable');
  return decode(revision,state.assets,state.scopeId,validate);
}
module.exports={create,append,restore,validateAll,sha,bytes};

};
factories["fast"]=function(module,exports,require,Buffer){
'use strict';
// Isolated Node experiment. Trust lives only in an owned immutable session,
// never in a serialized field, caller flag, public object or storage adapter.
const Base=require('./model.cjs');
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const record=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const image=/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const actions=['baseline','edit','presentation','add','delete','import','undo','redo','restore'];
function error(code,message){return Object.assign(Error(message),{code});}
function check(condition,message){if(!condition)throw error('HISTORY_INVALID',message||'Invalid history candidate');}
function jsonNative(value,ancestors=new Set()){
  if(value===null||typeof value==='string'||typeof value==='boolean')return;
  if(typeof value==='number'){check(Number.isFinite(value),'Non-JSON number');return;}
  check(typeof value==='object','Only JSON-native data is accepted');
  check(!ancestors.has(value),'Cyclic data is not JSON');
  const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);
  check(array?prototype===Array.prototype:prototype===Object.prototype||prototype===null,'Non-JSON object prototype');
  ancestors.add(value);let indices=0;
  for(const key of Reflect.ownKeys(value)){
    check(typeof key==='string','Symbol keys are not JSON');
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    check(own(descriptor,'value'),'Accessors are not JSON data');
    if(array&&key==='length')continue;
    check(descriptor.enumerable,'Non-enumerable data is not serialized JSON');
    if(array){const index=Number(key);check(Number.isSafeInteger(index)&&index>=0&&index<value.length&&String(index)===key,'Non-index array property');indices++;}
    jsonNative(descriptor.value,ancestors);
  }
  if(array)check(indices===value.length,'Sparse arrays are not accepted');
  ancestors.delete(value);
}
function copy(value){jsonNative(value);return JSON.parse(JSON.stringify(value));}
function freeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const key of Object.keys(value))freeze(value[key]);Object.freeze(value);
  }
  return value;
}
function metadataValid(m){
  return record(m)&&actions.includes(m.action)&&typeof m.actorLabel==='string'&&m.actorLabel.length<=200&&typeof m.reason==='string'&&m.reason.length<=1000&&
    typeof m.createdAt==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(m.createdAt)&&Number.isFinite(Date.parse(m.createdAt))&&new Date(m.createdAt).toISOString()===m.createdAt&&
    (m.restoredFromSequence===undefined||(m.action==='restore'&&Number.isSafeInteger(m.restoredFromSequence)&&m.restoredFromSequence>0));
}
function synchronousValidator(validate){
  check(typeof validate==='function','A fixed synchronous validator is required');
  return doc=>{
    const result=validate(doc);
    if(result!==null&&(typeof result==='object'||typeof result==='function')&&typeof result.then==='function'){
      // Do not let a rejected async callback become an unhandled rejection.
      Promise.resolve(result).catch(()=>{});
      throw error('HISTORY_VALIDATOR_ASYNC','The session validator must be synchronous and stable');
    }
    jsonNative(doc);
    return result;
  };
}
function pack(snapshot,scopeId,sequence,event,validate){
  check(typeof snapshot==='string','A compact snapshot string is required');
  let temporary;try{temporary=JSON.parse(snapshot);}catch(_){throw error('HISTORY_INVALID','Snapshot JSON is invalid');}
  check(record(temporary)&&JSON.stringify(temporary)===snapshot,'Snapshot must match current compact JSON serialization');
  check(validate(temporary)!==false,'Snapshot validator declined');
  check(JSON.stringify(temporary)===snapshot,'Snapshot validator must not normalize or mutate the candidate');
  const doc=JSON.parse(snapshot); // Discard every callback-accessible object.
  const assets={},bindings=[],seenImages=new Map();
  function visit(value,parent,key,path){
    if(typeof value==='string'&&image.test(value)){
      let id=seenImages.get(value);if(id===undefined){id=Base.sha(value);seenImages.set(value,id);assets[id]=value;}
      bindings.push({path,assetId:id});parent[key]=null;
    }else if(value&&typeof value==='object')for(const k of Object.keys(value))visit(value[k],value,k,[...path,Array.isArray(value)?Number(k):k]);
  }
  visit(doc,null,null,[]);
  const manifest={format:1,scopeId,sequence,metadata:event,documentHash:Base.sha(snapshot),body:JSON.stringify(doc),bindings};
  return{revision:{manifest,manifestHash:Base.sha(JSON.stringify(manifest))},assets};
}
function gc(state){
  const used=new Set(state.revisions.flatMap(r=>r.manifest.bindings.map(b=>b.assetId)));
  for(const id of Object.keys(state.assets))if(!used.has(id))delete state.assets[id];
}
async function open(rawState,options={}){
  // Own all imported bytes and capture the validation policy before yielding.
  let committed=copy(rawState);
  const expectedScopeId=options.expectedScopeId,validate=synchronousValidator(options.validate);
  const initial=await Base.validateAll(committed,{expectedScopeId,validate});
  freeze(committed);return ownedSession(committed,expectedScopeId,validate,initial.bytes,1);
}
// Only this module can create a trusted fork. It shares immutable owned data,
// never a caller-provided state or a serialized trust flag.
function ownedSession(committed,expectedScopeId,validate,logicalBytes,fullChecksCompleted){
  let tail=Promise.resolve(),committedAppends=0;
  function enqueue(work){
    const result=tail.then(work);tail=result.then(()=>undefined,()=>undefined);return result;
  }
  function status(){return Object.freeze({scopeId:committed.scopeId,head:committed.head,nextSequence:committed.nextSequence,retainedRevisions:committed.revisions.length,assets:Object.keys(committed.assets).length,logicalBytes});}
  function append(snapshot,metadata,options={}){
    let request;
    try{request={snapshot,metadata:copy(metadata),expectedHead:options.expectedHead};}catch(e){return Promise.reject(e);}
    return enqueue(()=>{
      const previous=committed;
      if(request.expectedHead!==previous.head)throw error('HISTORY_CONFLICT','The expected session head is stale');
      const event={actorLabel:'',reason:'',...request.metadata};check(metadataValid(event),'Invalid client-supplied event metadata');
      let target;
      if(event.action==='restore'){
        target=previous.revisions.find(r=>r.manifest.sequence===event.restoredFromSequence);
        check(Number.isSafeInteger(event.restoredFromSequence)&&target,'Restore target must still exist');
      }
      const sequence=previous.nextSequence;check(sequence<Number.MAX_SAFE_INTEGER,'History sequence is exhausted');
      const packed=pack(request.snapshot,previous.scopeId,sequence,event,validate);
      if(target)check(target.manifest.documentHash===packed.revision.manifest.documentHash,'Restore snapshot differs from the selected target');
      // Share only objects already owned and frozen by this session. All
      // modified containers and every new object are private to this candidate.
      const next={...previous,nextSequence:sequence+1,head:sequence,revisions:[...previous.revisions,packed.revision],assets:{...previous.assets}};
      for(const [id,value]of Object.entries(packed.assets)){
        check(!own(next.assets,id)||next.assets[id]===value,'Conflicting content-addressed asset');next.assets[id]=value;
      }
      // Preserve the same key order as the baseline envelope. Spread retains
      // existing keys in place, so replacements above do not reorder them.
      while(next.revisions.length>next.limits.maxRevisions)next.revisions.shift();gc(next);
      let candidateBytes=Base.bytes(next);
      while(candidateBytes>next.limits.maxBytes&&next.revisions.length>1){next.revisions.shift();gc(next);candidateBytes=Base.bytes(next);}
      if(candidateBytes>next.limits.maxBytes)throw error('HISTORY_CAPACITY','The newest complete snapshot cannot fit; committed history was not changed');
      const retained=new Set(next.revisions.map(r=>r.manifest.sequence));
      const prunedSequences=previous.revisions.map(r=>r.manifest.sequence).filter(seq=>!retained.has(seq));
      freeze(next);
      // This is one in-memory publication, not a durable storage transaction.
      committed=next;logicalBytes=candidateBytes;committedAppends++;
      return Object.freeze({head:next.head,nextSequence:next.nextSequence,retainedRevisions:next.revisions.length,prunedSequences:Object.freeze(prunedSequences),logicalBytes});
    });
  }
  function restore(sequence){
    return enqueue(async()=>{
      const captured=committed;
      const restored=await Base.restore(captured,sequence,{expectedScopeId,validate});fullChecksCompleted++;
      // A validator can retain its temporary parsed document. Return a new
      // parse of verified immutable bytes, rather than that callback's object.
      return{snapshot:restored.snapshot,document:JSON.parse(restored.snapshot)};
    });
  }
  function exportValidated(){
    return enqueue(async()=>{
      const captured=committed;await Base.validateAll(captured,{expectedScopeId,validate});fullChecksCompleted++;return copy(captured);
    });
  }
  function fork(){return enqueue(()=>ownedSession(committed,expectedScopeId,validate,logicalBytes,0));}
  return Object.freeze({append,restore,exportValidated,fork,snapshot:()=>copy(committed),status,stats:()=>Object.freeze({committedAppends,fullChecksCompleted})});
}
module.exports={open};

};
factories["adapter"]=function(module,exports,require,Buffer){
/* Explicit storage purposes; this adapter never performs application migration. */
(function(scope){
  'use strict';
  const fail=code=>Object.assign(Error(code),{code});
  const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const storedRecord=value=>record(value)&&Object.hasOwn(value,'token')&&typeof value.token==='string'&&value.token.length>0&&Object.hasOwn(value,'state')&&record(value.state);
  async function defaultToken(state){
    const bytes=new TextEncoder().encode(JSON.stringify(state));
    const digest=await scope.crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  }
  async function open({name,indexedDB=scope.indexedDB,token=defaultToken,purpose='laboratory'}={}){
    const productionNames=['treef-family-independent-v1','treef-family-review-v1','treef-family-draft-v1','treef-family-baselines-v1'];
    const allowed=purpose==='laboratory'?typeof name==='string'&&/^treef-history-lab-[a-zA-Z0-9-]{1,100}$/.test(name):purpose==='family-independent'&&productionNames.includes(name);
    if(!allowed)throw fail('HISTORY_LAB_NAME');
    if(!indexedDB)throw fail('HISTORY_STORAGE_UNAVAILABLE');
    const db=await new Promise((resolve,reject)=>{
      let rejected=false;const request=indexedDB.open(name,1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('records'))request.result.createObjectStore('records');};
      request.onerror=()=>{rejected=true;reject(request.error||fail('HISTORY_OPEN_FAILED'));};
      request.onblocked=()=>{rejected=true;reject(fail('HISTORY_OPEN_BLOCKED'));};
      request.onsuccess=()=>{if(rejected){request.result.close();return;}resolve(request.result);};
    });
    db.onversionchange=()=>db.close();
    function transact(mode,prepare){
      return new Promise((resolve,reject)=>{
        let result,reason;let tx;
        try{tx=db.transaction('records',mode);}catch(e){reject(e);return;}
        tx.oncomplete=()=>resolve(result);
        tx.onabort=()=>reject(reason||tx.error||fail('HISTORY_TRANSACTION_ABORTED'));
        tx.onerror=()=>{}; // Request error defaults abort the whole transaction.
        const abort=e=>{reason=e;try{tx.abort();}catch(_){reject(e);}};
        try{prepare(tx.objectStore('records'),v=>{result=v;},abort);}catch(e){abort(e);}
      });
    }
    async function compareAndSwap(expectedToken,state){
      // Snapshot caller-owned data before yielding to hashing. Hash work must
      // finish before opening the transaction, whose callback never awaits.
      const captured=JSON.parse(JSON.stringify(state));
      if(!record(captured))throw fail('HISTORY_STORAGE_INVALID');
      const nextToken=await token(captured);
      if(typeof nextToken!=='string'||!nextToken.length)throw fail('HISTORY_STORAGE_INVALID');
      return transact('readwrite',(store,done,abort)=>{
        const get=store.get('head');
        get.onsuccess=()=>{
          try{
            const current=get.result;
            // Initialization requires actual key absence. A malformed stored
            // value must never be mistaken for an empty laboratory target.
            if(current!==undefined&&!storedRecord(current)){abort(fail('HISTORY_STORAGE_INVALID'));return;}
            if((current===undefined?null:current.token)!==expectedToken){abort(fail('HISTORY_CONFLICT'));return;}
            const put=store.put({token:nextToken,state:captured},'head');
            put.onsuccess=()=>done({token:nextToken});
          }catch(e){abort(e);}
        };
      });
    }
    return Object.freeze({read:()=>transact('readonly',(store,done)=>{const get=store.get('head');get.onsuccess=()=>done(get.result??null);}),compareAndSwap,close:()=>db.close()});
  }
  const api={open};if(typeof module!=='undefined')module.exports=api;else scope.TreeHistoryLabIndexedDB=api;
})(globalThis);

};
factories["journal"]=function(module,exports,require,Buffer){
'use strict';
// Isolated observed-value journal. Its content is untrusted review input, never
// ancestry data or an instruction to replace the independently saved document.
const H=require('./model.cjs');
const MAX_ENTRIES=64,MAX_ENTRY_BYTES=24*1024*1024,MAX_BYTES=48*1024*1024;
const clone=x=>JSON.parse(JSON.stringify(x)),fail=code=>Object.assign(Error(code),{code});
const check=(ok,code)=>{if(!ok)throw fail(code);},object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const hashRaw=raw=>H.sha(JSON.stringify(raw)),bytes=x=>Buffer.byteLength(JSON.stringify(x),'utf8');
const exact=(x,keys)=>object(x)&&Object.keys(x).sort().join('|')===keys.slice().sort().join('|');
const iso=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
async function open({store,scopeId,storageContext,baselineText,onStatus=()=>{}}){
  check(typeof store?.read==='function'&&typeof store?.compareAndSwap==='function'&&typeof scopeId==='string'&&/^[A-Za-z0-9._:-]{1,100}$/.test(scopeId)&&typeof storageContext==='string'&&storageContext.length>0&&storageContext.length<=4096&&typeof baselineText==='string'&&Buffer.byteLength(baselineText,'utf8')<=MAX_ENTRY_BYTES,'LEGACY_REVIEW_CONFIG');
  const baselineHash=H.sha(baselineText),pending=new Map();let durable=null,warning=null,tail=Promise.resolve();
  function validate(record){
    if(record===null)return null;
    check(exact(record,['state','token'])&&typeof record.token==='string'&&record.token===H.sha(JSON.stringify(record.state)),'LEGACY_REVIEW_INVALID');
    const s=record.state;
    check(exact(s,['kind','version','scopeId','storageContext','baselineHash','revision','entries'])&&s.kind==='synthetic-legacy-review-journal'&&s.version===1,'LEGACY_REVIEW_INVALID');
    check(s.scopeId===scopeId&&s.storageContext===storageContext&&s.baselineHash===baselineHash,'LEGACY_REVIEW_BINDING');
    check(Array.isArray(s.entries)&&s.entries.length<=MAX_ENTRIES&&s.revision===s.entries.length&&bytes(s)<=MAX_BYTES,'LEGACY_REVIEW_INVALID');
    const seen=new Set();
    for(const e of s.entries){
      check(exact(e,['contentHash','rawText','observedAt','source'])&&(e.rawText===null||typeof e.rawText==='string')&&bytes(e.rawText)<=MAX_ENTRY_BYTES&&e.contentHash===hashRaw(e.rawText)&&e.rawText!==baselineText&&iso(e.observedAt)&&typeof e.source==='string'&&e.source.length>0&&e.source.length<=80&&!seen.has(e.contentHash),'LEGACY_REVIEW_INVALID');
      seen.add(e.contentHash);
    }
    return clone(record);
  }
  async function read(){
    const r=validate(await store.read());
    if(durable){
      check(r!==null&&r.state.revision>=durable.state.revision,'LEGACY_REVIEW_REGRESSION');
      check(JSON.stringify(r.state.entries.slice(0,durable.state.entries.length))===JSON.stringify(durable.state.entries),'LEGACY_REVIEW_REGRESSION');
    }
    durable=r;return r;
  }
  await read();
  function status(){return Object.freeze({reviewCount:durable?.state.entries.length||0,pendingCount:pending.size,dirty:pending.size>0,warning,baselineHash,automaticMerge:false});}
  function emit(){try{onStatus(status());}catch(_){/* UI callbacks cannot alter persistence. */}}
  function entryAt(r,id){return r?.state.entries.find(e=>e.contentHash===id);}
  function confirmed(r,e){const saved=entryAt(r,e.contentHash);if(!saved)return false;check(saved.rawText===e.rawText,'LEGACY_REVIEW_HASH_COLLISION');return true;}
  function completed(e,extra={}){pending.delete(e.contentHash);if(!pending.size)warning=null;emit();return Object.freeze({recorded:true,contentHash:e.contentHash,...extra});}
  function enqueue(fn){const p=tail.then(fn);tail=p.then(()=>undefined,()=>undefined);return p;}
  function observe(rawText,{observedAt=new Date().toISOString(),source='observation'}={}){
    try{check((rawText===null||typeof rawText==='string')&&iso(observedAt)&&typeof source==='string'&&source.length>0&&source.length<=80,'LEGACY_REVIEW_OBSERVATION');}catch(e){return Promise.reject(e);}
    if(rawText===baselineText)return Promise.resolve(Object.freeze({recorded:false,baseline:true}));
    const e={contentHash:hashRaw(rawText),rawText,observedAt,source};
    const previous=pending.get(e.contentHash);if(previous&&previous.rawText!==rawText)return Promise.reject(fail('LEGACY_REVIEW_HASH_COLLISION'));
    if(!previous)pending.set(e.contentHash,e);emit();
    return enqueue(async()=>{
      try{
        check(bytes(rawText)<=MAX_ENTRY_BYTES,'LEGACY_REVIEW_ENTRY_CAPACITY');
        let current=await read();
        for(let attempt=0;attempt<5;attempt++){
          if(confirmed(current,e))return completed(e,{deduplicated:true});
          const state=current?clone(current.state):{kind:'synthetic-legacy-review-journal',version:1,scopeId,storageContext,baselineHash,revision:0,entries:[]};
          check(state.entries.length<MAX_ENTRIES,'LEGACY_REVIEW_CAPACITY');state.entries.push(e);state.revision++;
          check(bytes(state)<=MAX_BYTES,'LEGACY_REVIEW_CAPACITY');
          const nextToken=H.sha(JSON.stringify(state));let problem;
          try{const receipt=await store.compareAndSwap(current?.token??null,clone(state));check(receipt?.token===nextToken,'LEGACY_REVIEW_ACK_UNCERTAIN');durable={token:nextToken,state};return completed(e);}
          catch(error){problem=error;}
          // A thrown or missing acknowledgement can follow a committed write.
          // Read the actual head before reporting failure or retrying a conflict.
          current=await read();
          if(confirmed(current,e))return completed(e,{recoveredAcknowledgement:true});
          if(problem.code!=='HISTORY_CONFLICT')throw problem;
        }
        throw fail('LEGACY_REVIEW_RETRY_LIMIT');
      }catch(error){warning=error.code||'LEGACY_REVIEW_WRITE_FAILED';emit();throw error;}
    });
  }
  emit();return Object.freeze({observe,status,snapshot:()=>durable?clone(durable.state):null,
    exportText:()=>JSON.stringify({kind:'synthetic-legacy-review-export',version:1,journal:durable?clone(durable.state):null,pending:clone([...pending.values()]),warning}),
    flush:()=>tail.then(()=>{if(pending.size)throw fail(warning||'LEGACY_REVIEW_PENDING');return status();})});
}
module.exports={open,MAX_ENTRIES,MAX_ENTRY_BYTES,MAX_BYTES};

};
const aliases={'node:crypto':'hash','./model.cjs':'model'};function load(k){if(cache[k])return cache[k].exports;const m={exports:{}};cache[k]=m;factories[k](m,m.exports,id=>{if(!aliases[id])throw Error('Unknown dependency');return load(aliases[id]);},{byteLength:t=>new TextEncoder().encode(t).length});return m.exports;}globalThis.FamilySaveRuntime={adapter:load('adapter'),journal:load('journal'),hash:load('model').sha,history:load('fast'),historyModel:load('model')};})();
