/* Explicit verified field choices; no storage, automatic conflict policy, or genealogy edits. */
(function(scope){'use strict';
 const copy=x=>JSON.parse(JSON.stringify(x)),object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x),allowed=new Set(['fullName','displayName','lifeStatus']),key=(id,field)=>JSON.stringify([id,field]);
 function freeze(x){if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;}
 function create({core:C,hash,compare}){
  const check=(ok,message)=>{if(!ok)throw Object.assign(Error(message),{code:'BRANCH_FIELD_MERGE_INVALID'});};
  function prepare(current,baseText,proposalText,selection){
   const report=compare.analyze(current,baseText,proposalText);
   check(Array.isArray(selection)&&selection.length>0&&selection.length<=600,'اختر حقولًا محددة غير متعارضة');
   const rows=new Map(report.rows.map(r=>[key(r.personId,r.field),r])),seen=new Set(),captured=[];
   for(const s of selection){check(object(s)&&Object.keys(s).length===2&&Object.hasOwn(s,'personId')&&Object.hasOwn(s,'field')&&typeof s.personId==='string'&&allowed.has(s.field),'الهوية أو الحقل غير مدعوم للاعتماد');const k=key(s.personId,s.field),row=rows.get(k);check(!seen.has(k)&&row?.classification==='proposal-only','حقل مكرر أو غير متاح أو متعارض أو مطبق أصلًا');seen.add(k);captured.push({personId:s.personId,field:s.field});}
   const proposal=JSON.parse(proposalText),changes=new Map(proposal.changes.map(c=>[c.personId,c])),candidate=copy(current),people=new Map(candidate.persons.map(p=>[p.personId,p]));
   for(const s of captured){const after=changes.get(s.personId).fields[s.field].after,p=people.get(s.personId);check(p,'الشخص غير متاح');if(after.present)Object.defineProperty(p,s.field,{value:copy(after.value),writable:true,enumerable:true,configurable:true});else delete p[s.field];}
   C.validate(candidate);const candidateText=JSON.stringify(candidate);check(new TextEncoder().encode(candidateText).length<=24*1024*1024,'تجاوزت الوثيقة المرشحة حد الحفظ24ميغابايت');
   return freeze({kind:'verified-nonconflicting-field-plan',sourceHash:report.currentHash,baseHash:report.baseHash,proposalHash:report.proposalHash,selection:captured,candidateText,summary:{selectedFields:captured.length,selectedPersons:new Set(captured.map(x=>x.personId)).size}});
  }
  function apply(current,baseText,proposalText,selection,expectedSourceHash,expectedProposalHash){check(typeof expectedSourceHash==='string'&&hash(JSON.stringify(current))===expectedSourceHash,'تغيرت الوثيقة منذ المعاينة');if(expectedProposalHash!==undefined)check(hash(proposalText)===expectedProposalHash,'تغير ملف الاقتراح منذ المعاينة');const plan=prepare(current,baseText,proposalText,selection);check(plan.sourceHash===expectedSourceHash,'مرجع المعاينة غير مطابق');return JSON.parse(plan.candidateText);}
  function prepareResolved(current,baseText,proposalText,decisions){
   const report=compare.analyze(current,baseText,proposalText);
   check(Array.isArray(decisions)&&decisions.length>0&&decisions.length<=600,'اختر قرارًا صريحًا لتعارض محدد');
   const rows=new Map(report.rows.map(r=>[key(r.personId,r.field),r])),seen=new Set(),captured=[];
   for(const d of decisions){check(object(d)&&Object.keys(d).length===3&&Object.hasOwn(d,'personId')&&Object.hasOwn(d,'field')&&Object.hasOwn(d,'choice')&&typeof d.personId==='string'&&allowed.has(d.field)&&['keep-current','use-proposal'].includes(d.choice),'قرار التعارض أو الهوية أو الحقل غير مدعوم');const k=key(d.personId,d.field);check(!seen.has(k)&&rows.get(k)?.classification==='conflict','القرار مكرر أو الحقل ليس تعارضًا متاحًا');seen.add(k);captured.push({personId:d.personId,field:d.field,choice:d.choice});}
   const proposal=JSON.parse(proposalText),changes=new Map(proposal.changes.map(c=>[c.personId,c])),candidate=copy(current),people=new Map(candidate.persons.map(p=>[p.personId,p]));
   for(const d of captured){if(d.choice==='keep-current')continue;const after=changes.get(d.personId).fields[d.field].after,p=people.get(d.personId);check(p,'الشخص غير متاح');if(after.present)Object.defineProperty(p,d.field,{value:copy(after.value),writable:true,enumerable:true,configurable:true});else delete p[d.field];}
   C.validate(candidate);const candidateText=JSON.stringify(candidate);check(new TextEncoder().encode(candidateText).length<=24*1024*1024,'تجاوزت الوثيقة المرشحة حد الحفظ24ميغابايت');
   const useProposal=captured.filter(d=>d.choice==='use-proposal').length;
   return freeze({kind:'verified-conflict-resolution-plan',sourceHash:report.currentHash,baseHash:report.baseHash,proposalHash:report.proposalHash,decisions:captured,candidateText,summary:{decisions:captured.length,keepCurrent:captured.length-useProposal,useProposal}});
  }
  function applyResolved(current,baseText,proposalText,decisions,expectedSourceHash,expectedProposalHash){check(typeof expectedSourceHash==='string'&&/^[a-f0-9]{64}$/.test(expectedSourceHash)&&hash(JSON.stringify(current))===expectedSourceHash,'تغيرت الوثيقة منذ معاينة القرارات');check(typeof expectedProposalHash==='string'&&/^[a-f0-9]{64}$/.test(expectedProposalHash)&&hash(proposalText)===expectedProposalHash,'تغير ملف الاقتراح منذ معاينة القرارات');const plan=prepareResolved(current,baseText,proposalText,decisions);check(plan.sourceHash===expectedSourceHash,'مرجع معاينة القرارات غير مطابق');check(plan.summary.useProposal>0&&plan.candidateText!==JSON.stringify(current),'لا توجد قيمة مختلفة لاعتمادها؛ الاحتفاظ بالحالي لا يعدّل الشجرة');return JSON.parse(plan.candidateText);}
  return Object.freeze({prepare,apply,prepareResolved,applyResolved});
 }
 const api={create};if(typeof module!=='undefined')module.exports=api;else scope.TreeBranchFieldMerge=api;
})(globalThis);
