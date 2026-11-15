/* Read-only three-way field comparison. Never normalizes or applies documents. */
(function(scope){'use strict';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k),obj=o=>o!==null&&typeof o==='object'&&!Array.isArray(o),clone=o=>JSON.parse(JSON.stringify(o));
const stable=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
const labels={fullName:'الاسم الكامل',displayName:'الاسم المعروض',lifeStatus:'حالة الحياة',notes:'الملاحظات الخاصة',photo:'الصورة الخاصة'};
function create({core:C,hash}){
 const check=(v,m)=>{if(!v)throw Object.assign(Error(m||'عقد المقارنة غير صالح'),{code:'BRANCH_COMPARE_INVALID'});};
 const exact=(o,keys)=>obj(o)&&Object.keys(o).length===keys.length&&keys.every(k=>own(o,k));
 function parse(text){check(typeof text==='string'&&new TextEncoder().encode(text).length<=20*1024*1024,'حد كل ملف20ميغابايت');try{return JSON.parse(text);}catch{check(false,'ملف JSON غير صالح');}}
 function baseRead(text){let d=parse(text);if(obj(d)&&d.schemaVersion!==2&&own(d,'payload')){check(exact(d,['payload','checksum'])&&obj(d.payload)&&d.payload.kind==='family-tree-local-backup'&&d.payload.version===1&&hash(JSON.stringify(d.payload))===d.checksum,'نسخة احتياطية غير متحققة');const snapshot=d.payload.snapshotText;check(typeof snapshot==='string','لقطة النسخة مفقودة');d=parse(snapshot);check(JSON.stringify(d)===snapshot,'لقطة النسخة ليست بالصيغة المحفوظة');}check(obj(d)&&d.schemaVersion===2,'يلزم ملف أساس بهويات محفوظة من الإصدار2');C.validate(d);return d;}
 function visible(d){const nodes=C.visible(d).nodes,by=new Map(nodes.map(n=>[n.personId,n]));return{by,path(id){const out=[];let n=by.get(id);while(n){out.push(n.personId);n=by.get(n.parentId);}return out;},inside(id,anchor){return this.path(id).includes(anchor);}};}
 function draft(d,anchor){C.validate(d);check(d.schemaVersion===2&&typeof d.treeId==='string'&&d.treeId.length>0&&visible(d).by.has(anchor),'مرساة ظاهرة وهوية شجرة محفوظة مطلوبتان');return{schemaVersion:3,kind:'branch-field-proposal',treeId:d.treeId,anchorPersonId:anchor,baseDocumentHash:hash(JSON.stringify(d)),changes:[],status:'draft'};}
 const state=(p,k)=>own(p,k)?{present:true,value:p[k]}:{present:false};
 function validState(s,field,after){check(obj(s)&&typeof s.present==='boolean'&&exact(s,s.present?['present','value']:['present']),'وصف وجود الحقل غير صالح');if(!after)return;if(!s.present){check(field!=='fullName','لا يمكن حذف الاسم الكامل');return;}check(typeof s.value==='string','قيمة مقترحة غير صالحة');if(field==='fullName')check(s.value.trim()&&s.value.length<=300,'اسم مقترح غير صالح');if(field==='displayName')check(s.value.length<=80,'اسم معروض طويل');if(field==='lifeStatus')check(['unknown','living','deceased'].includes(s.value),'حالة حياة غير صالحة');if(field==='photo')check(s.value===''||/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s.value),'الصورة المقترحة يجب أن تكون محلية');}
 const lifeLabels={unknown:'غير معروف',living:'حي',deceased:'متوفى'};
 const text=(s,field)=>!s.present?'غير موجود':field==='notes'||field==='photo'?'قيمة خاصة محفوظة':field==='lifeStatus'?(typeof s.value==='string'&&own(lifeLabels,s.value)?lifeLabels[s.value]:'حالة سابقة غير مدعومة'):typeof s.value==='string'?s.value:'قيمة سابقة غير نصية';
 function analyze(current,baseText,proposalText){
  check(current?.schemaVersion===2,'وثيقة حالية غير صالحة');C.validate(current);const base=baseRead(baseText),p=parse(proposalText),baseHash=hash(JSON.stringify(base));
  check(exact(p,['schemaVersion','kind','treeId','anchorPersonId','baseDocumentHash','changes','status'])&&p.schemaVersion===3&&p.kind==='branch-field-proposal'&&p.status==='draft'&&p.baseDocumentHash===baseHash,'يلزم عقد الإصدار3 ونسخة أساس مطابقة');
  check(typeof p.treeId==='string'&&p.treeId.length>0&&p.treeId===base.treeId&&p.treeId===current.treeId,'هوية الشجرة لا تطابق الأساس والحالي');
  check(Array.isArray(p.changes)&&p.changes.length<=200,'حد المقارنة200شخص');const bv=visible(base),cv=visible(current);check(bv.by.has(p.anchorPersonId)&&cv.by.has(p.anchorPersonId),'مرساة الفرع غير متاحة في عرض الرجال');
  const old=new Map(base.persons.map(x=>[x.personId,x])),now=new Map(current.persons.map(x=>[x.personId,x])),seen=new Set(),shadow=clone(base),shadowPeople=new Map(shadow.persons.map(x=>[x.personId,x])),rows=[],issues=[],summary={conflicts:0,proposalOnly:0,alreadyCurrent:0,noChanges:0,unavailable:0};
  for(const change of p.changes){check(exact(change,['personId','fields'])&&typeof change.personId==='string'&&old.has(change.personId)&&!seen.has(change.personId)&&obj(change.fields)&&Object.keys(change.fields).length>0,'شخص أو تعديل مكرر أو غير معروف');seen.add(change.personId);
   const beforePerson=old.get(change.personId),currentPerson=now.get(change.personId),available=bv.by.has(change.personId)&&cv.by.has(change.personId)&&bv.inside(change.personId,p.anchorPersonId)&&cv.inside(change.personId,p.anchorPersonId)&&stable(bv.path(change.personId))===stable(cv.path(change.personId));
   for(const [field,patch]of Object.entries(change.fields)){check(own(labels,field)&&exact(patch,['before','after']),'لا تقبل المقارنة تغيير الهوية أو الجنس أو النسب أو حقول غير مدعومة');validState(patch.before,field,false);validState(patch.after,field,true);check(stable(patch.before)===stable(state(beforePerson,field)),'القيمة السابقة لا تطابق نسخة الأساس');if(patch.after.present)Object.defineProperty(shadowPeople.get(change.personId),field,{value:clone(patch.after.value),writable:true,enumerable:true,configurable:true});else delete shadowPeople.get(change.personId)[field];
    if(!available){summary.unavailable++;continue;}
    const local=state(currentPerson,field);let classification;if(stable(patch.after)===stable(patch.before)){classification='no-change';summary.noChanges++;}else if(stable(local)===stable(patch.after)){classification='already-current';summary.alreadyCurrent++;}else if(stable(local)===stable(patch.before)){classification='proposal-only';summary.proposalOnly++;}else{classification='conflict';summary.conflicts++;}
    rows.push({personId:change.personId,personName:currentPerson.fullName,field,label:labels[field],classification,beforeText:text(patch.before,field),currentText:text(local,field),afterText:text(patch.after,field)});
   }
  }
  C.validate(shadow);if(summary.unavailable)issues.push({code:'PERSON_UNAVAILABLE',message:'توجد سجلات غائبة أو خارج الفرع/عرض الرجال أو تغير مسار نسبها؛ لا تظهر أسماؤها أو قيمها.',count:summary.unavailable});issues.push({code:'LOCAL_REVIEW_ONLY',message:'هذه مقارنة للقراءة فقط؛ البصمة والقيم السابقة ليستا إثبات هوية أو صلاحية.'});
  return{kind:'branch-three-way-report',format:1,readOnly:true,canApply:false,currentHash:hash(JSON.stringify(current)),baseHash,proposalHash:hash(proposalText),summary,issues,rows};
 }
 return Object.freeze({draft,analyze,matchesDocument:(current,report)=>hash(JSON.stringify(current))===report.currentHash});
}
const api={create};if(typeof module!=='undefined')module.exports=api;else scope.TreeBranchCompare=api;
})(globalThis);
