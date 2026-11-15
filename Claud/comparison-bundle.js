/* Private paired comparison files. Integrity checks are not contributor authentication. */
(function(scope){'use strict';
 const MAX_BYTES=48*1024*1024,MAX_INPUT_BYTES=20*1024*1024,own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k),object=o=>o!==null&&typeof o==='object'&&!Array.isArray(o),bytes=s=>new TextEncoder().encode(s).length;
 const exact=(o,keys)=>object(o)&&Object.keys(o).length===keys.length&&keys.every(k=>own(o,k));
 function create({core,hash,compare}){
  const check=(ok,message)=>{if(!ok)throw Object.assign(Error(message||'ملف المراجعة الخاصة غير صالح'),{code:'COMPARISON_BUNDLE_INVALID'});};
  check(typeof core?.validate==='function'&&typeof hash==='function'&&typeof compare?.analyze==='function','محرك التحقق من المراجعة غير متاح');
  function inputs(baseText,proposalText){check(typeof baseText==='string'&&typeof proposalText==='string'&&bytes(baseText)<=MAX_INPUT_BYTES&&bytes(proposalText)<=MAX_INPUT_BYTES,'حد كل ملف داخلي20ميغابايت؛ يلزم نص الأساس والاقتراح الأصليان');}
  function pack(current,baseText,proposalText){
   inputs(baseText,proposalText);compare.analyze(current,baseText,proposalText);
   const payload={baseRawText:baseText,proposalRawText:proposalText},text=JSON.stringify({kind:'private-family-comparison-bundle',version:1,payload,checksum:hash(JSON.stringify(payload))});
   check(bytes(text)<=MAX_BYTES,'تجاوز ملف المراجعة الخاصة حد48ميغابايت');return text;
  }
  function unpack(current,bundleText){
   check(typeof bundleText==='string'&&bytes(bundleText)<=MAX_BYTES,'حد ملف المراجعة الخاصة48ميغابايت');let envelope;
   try{envelope=JSON.parse(bundleText);}catch{check(false,'ملف المراجعة ليس JSON صالحًا');}
   check(object(envelope)&&envelope.version===1,'نوع ملف المراجعة أو إصداره غير مدعوم');let payload,format;
   if(envelope.kind==='private-family-comparison-bundle'){
    check(exact(envelope,['kind','version','payload','checksum'])&&exact(envelope.payload,['baseRawText','proposalRawText'])&&typeof envelope.checksum==='string'&&/^[a-f0-9]{64}$/.test(envelope.checksum),'غلاف المراجعة الخاصة غير صالح');
    check(hash(JSON.stringify(envelope.payload))===envelope.checksum,'بصمة ملف المراجعة الخاصة غير مطابقة');payload=envelope.payload;format='checksummed-bundle';
   }else{
    check(envelope.kind==='private-three-way-review'&&envelope.canApply===false&&envelope.readOnly===true&&own(envelope,'baseRawText')&&own(envelope,'proposalRawText'),'يلزم ملف مراجعة خاصة سابق أو حزمة مراجعة خاصة');
    payload=envelope;format='legacy-private-review';
   }
   const baseText=payload.baseRawText,proposalText=payload.proposalRawText;inputs(baseText,proposalText);
   // The embedded report/stale flags in old exports have no authority: always analyze the original files again.
   const report=compare.analyze(current,baseText,proposalText);return Object.freeze({baseText,proposalText,report,format});
  }
  return Object.freeze({pack,unpack});
 }
 const api={create,MAX_BYTES,MAX_INPUT_BYTES};if(typeof module!=='undefined')module.exports=api;else scope.TreeComparisonBundle=api;
})(globalThis);
