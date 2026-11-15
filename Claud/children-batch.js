/* Local, transactional child-batch planning. No storage, UI, or network access. */
(function(scope){
  'use strict';
  const C=typeof module!=='undefined'&&module.exports?require('./botanical-core.js'):scope.BotanicalCore;
  const MAX_NAMES=100,MAX_NAME_LENGTH=300,MAX_PEOPLE=10000;
  const key=name=>name.normalize('NFKC').replace(/\s+/g,' ').trim();
  // Images/notes/design stay out of the preview fingerprint and are retained
  // from the current document when the transaction is applied.
  const signature=d=>JSON.stringify({rootPersonId:d.rootPersonId,
    persons:d.persons.map(p=>[p.personId,p.fullName,p.gender,p.displayName??null]),
    relationships:d.relationships.map(r=>[r.relationshipId??null,r.type,r.parentId,r.childId,r.siblingOrder??null])});
  const revision=d=>JSON.stringify(d.revision??0);
  const tree=d=>JSON.stringify(d.treeId??null);
  function preview(doc,fatherId,text){
    const visible=C.visible(doc),byId=new Map(visible.nodes.map(n=>[n.personId,n]));
    if(typeof fatherId!=='string'||!byId.has(fatherId))throw Error('اختر أبًا موجودًا في الشجرة الذكورية المعروضة');
    if(typeof text!=='string')throw Error('أدخل أسماء الأبناء كنص، كل اسم في سطر');
    if(text.length>100000)throw Error('النص كبير جدًا؛ أدخل حتى 100 اسم في الدفعة');
    const lines=text.split(/\r\n?|\n/),rows=[];let ignoredBlankLines=0;
    for(let i=0;i<lines.length;i++){
      const fullName=lines[i].trim();
      if(!fullName){ignoredBlankLines++;continue;}
      if(fullName.length>MAX_NAME_LENGTH)throw Error('الاسم في السطر '+(i+1)+' أطول من 300 حرف');
      rows.push({lineNumber:i+1,fullName,duplicateInBatch:false,duplicateExisting:false});
    }
    if(!rows.length)throw Error('أدخل اسم ابن واحد على الأقل');
    if(rows.length>MAX_NAMES)throw Error('الحد الأقصى للدفعة 100 اسم؛ قسّم الأسماء إلى دفعات');
    if(doc.persons.length+rows.length>MAX_PEOPLE)throw Error('الإضافة تتجاوز حد الشجرة: 10000 شخص');
    const father=byId.get(fatherId),counts=new Map(),existing=new Set(father.children.map(n=>key(n.fullName)));
    for(const row of rows){const k=key(row.fullName);counts.set(k,(counts.get(k)||0)+1);}
    const warnings=[],warned=new Set();
    for(const row of rows){
      const k=key(row.fullName);row.duplicateInBatch=counts.get(k)>1;row.duplicateExisting=existing.has(k);
      if(row.duplicateInBatch&&!warned.has('batch:'+k)){warnings.push('الاسم «'+row.fullName+'» يتكرر في الدفعة؛ سيضاف كل سطر كشخص مستقل');warned.add('batch:'+k);}
      if(row.duplicateExisting&&!warned.has('existing:'+k)){warnings.push('يوجد ابن معروض للأب نفسه باسم «'+row.fullName+'»؛ راجع احتمال التكرار');warned.add('existing:'+k);}
    }
    const fatherPath=[];for(let n=father;n;n=byId.get(n.parentId))fatherPath.unshift({personId:n.personId,fullName:n.fullName});
    return {fatherId,fatherName:father.fullName,fatherPath,rows,ignoredBlankLines,warnings,
      treeId:C.copy(doc.treeId??null),baseRevision:C.copy(doc.revision??0),baseSignature:signature(doc),
      namesSignature:JSON.stringify({fatherId,names:rows.map(row=>row.fullName)})};
  }
  function apply(doc,proposal,{allowDuplicates=false}={}){
    C.validate(doc);
    if(!proposal||typeof proposal!=='object'||!Array.isArray(proposal.rows)||!proposal.rows.length||proposal.rows.length>MAX_NAMES)throw Error('المعاينة غير صالحة؛ أعد معاينة الأسماء');
    if(tree(doc)!==JSON.stringify(proposal.treeId)||revision(doc)!==JSON.stringify(proposal.baseRevision)||signature(doc)!==proposal.baseSignature)throw Error('تغيرت الشجرة بعد المعاينة؛ أعد المعاينة قبل الحفظ');
    const names=proposal.rows.map(row=>row&&row.fullName);
    if(names.some(name=>typeof name!=='string'||!name.trim()||/[\r\n]/.test(name))||JSON.stringify({fatherId:proposal.fatherId,names})!==proposal.namesSignature)throw Error('تغير الأب أو الأسماء بعد المعاينة؛ أعد المعاينة قبل الحفظ');
    const current=preview(doc,proposal.fatherId,names.join('\n'));
    if(current.warnings.length&&allowDuplicates!==true)throw Error('راجع الأسماء المتكررة وأكّد إضافتها كسجلات مستقلة');
    const orders=doc.relationships.filter(r=>r.type==='father'&&r.parentId===proposal.fatherId).map(r=>Number(r.siblingOrder||0));
    const lastOrder=Math.max(0,...orders);
    if(orders.some(n=>!Number.isFinite(n))||!Number.isFinite(lastOrder)||lastOrder+names.length>Number.MAX_SAFE_INTEGER)throw Error('ترتيب الأبناء الحالي يحتاج مراجعة قبل إضافة دفعة');
    const next=C.copy(doc),used=new Set([...next.persons.map(p=>p.personId),...next.relationships.map(r=>r.relationshipId).filter(Boolean)]),addedIds=[];
    function freshId(){for(let attempt=0;attempt<20;attempt++){const id=C.uid();if(typeof id==='string'&&id&&!['__proto__','prototype','constructor'].includes(id)&&!used.has(id)){used.add(id);return id;}}throw Error('تعذر إنشاء معرّف جديد؛ لم تحفظ الدفعة');}
    for(let i=0;i<current.rows.length;i++){
      const personId=freshId();addedIds.push(personId);
      next.persons.push({personId,fullName:current.rows[i].fullName,gender:'m',lifeStatus:'unknown'});
      next.relationships.push({relationshipId:freshId(),type:'father',parentId:proposal.fatherId,childId:personId,siblingOrder:lastOrder+i+1});
    }
    C.validate(next);return {document:next,addedIds,fatherId:proposal.fatherId};
  }
  const api={preview,apply,limits:{names:MAX_NAMES,nameLength:MAX_NAME_LENGTH,people:MAX_PEOPLE}};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.TreeChildrenBatch=api;
})(globalThis);
