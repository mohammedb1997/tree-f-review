/* Explicit local choices for safe conflicting fields. No automatic resolutions. */
(function(scope){'use strict';
  scope.installBranchConflictControls=function({currentDocument,comparison,inputs,apply,download,status}){
    const make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
    const button=(id,text,fn)=>{const e=make('button',text);e.id=id;e.type='button';e.className='btn';e.onclick=fn;return e;};
    const element=make('details');element.id='branchConflictsPanel';
    const choices=make('div');choices.id='branchConflictsChoices';
    const previewText=make('p');previewText.id='branchConflictsPreview';previewText.setAttribute('role','status');
    let plan=null,backupHash=null,page=0,items=[],importTicket=0,importPending=false;const selected=new Map(),pageSize=100;
    function invalidate(){importTicket++;if(importPending){importPending=false;importState.textContent='أُلغيت قراءة القرارات بعد تغيير سياق المراجعة.';}plan=null;backupHash=null;confirmed.checked=false;accept.disabled=true;previewText.textContent='';}
    function reset(){invalidate();choices.replaceChildren();selected.clear();items=[];page=0;navigation.hidden=true;pageText.textContent='';}
    function context(){
      const doc=currentDocument(),r=comparison(),texts=inputs();
      if(!r||r.currentHash!==FamilySaveRuntime.hash(JSON.stringify(doc)))throw Error('اعرض مقارنة حديثة أولًا');
      return {doc,...texts};
    }
    const merger=()=>TreeBranchFieldMerge.create({core:BotanicalCore,hash:FamilySaveRuntime.hash,compare:TreeBranchCompare.create({core:BotanicalCore,hash:FamilySaveRuntime.hash})});
    const decisions=()=>[...selected.values()];
    const navigation=make('div');navigation.hidden=true;
    const pageText=make('p');pageText.id='branchConflictsPage';pageText.setAttribute('role','status');
    const previous=button('branchConflictsPrevious','الصفحة السابقة',()=>{if(page>0){page--;renderPage();}}),next=button('branchConflictsNext','الصفحة التالية',()=>{if((page+1)*pageSize<items.length){page++;renderPage();}});
    navigation.append(previous,next,pageText);
    function renderPage(){
      const doc=currentDocument(),people=new Map(doc.persons.map(p=>[p.personId,p])),fathers=new Map(doc.relationships.filter(r=>r.type==='father').map(r=>[r.childId,r.parentId]));
      choices.replaceChildren();for(const row of items.slice(page*pageSize,(page+1)*pageSize)){
        const key=JSON.stringify([row.personId,row.field]),box=make('fieldset');box.style.cssText='border:1px solid #d8c8a8;border-radius:8px;padding:12px;margin:12px 0';
        const identity=row.personName+' — '+row.label+' • '+(fathers.has(row.personId)?'الأب: '+people.get(fathers.get(row.personId))?.fullName:'أصل الشجرة')+' • المعرّف: '+row.personId,legend=make('legend',identity);legend.style.overflowWrap='anywhere';
        box.append(legend,make('p','الحالي: '+row.currentText),make('p','المقترح: '+row.afterText));
        const select=make('select');select.dataset.personId=row.personId;select.dataset.field=row.field;select.style.cssText='width:100%;min-height:44px;font:inherit';select.setAttribute('aria-label','قرار '+identity);
        for(const [value,text]of[['','لم أحسم هذا الحقل'],['keep-current','الإبقاء على القيمة الحالية'],['use-proposal','استخدام القيمة المقترحة']]){const o=make('option',text);o.value=value;select.append(o);}
        select.value=selected.get(key)?.choice||'';
        select.onchange=()=>{invalidate();if(select.value)selected.set(key,{personId:row.personId,field:row.field,choice:select.value});else selected.delete(key);updatePageText();};box.append(select);choices.append(box);
      }
      navigation.hidden=!items.length;previous.disabled=page===0;next.disabled=(page+1)*pageSize>=items.length;updatePageText();
    }
    function updatePageText(){pageText.textContent=items.length?`عرض ${page*pageSize+1}–${Math.min((page+1)*pageSize,items.length)} من ${items.length} تعارض • ${selected.size} قرار مختار عبر الصفحات`:'';}
    const list=button('branchConflictsList','عرض التعارضات القابلة للمراجعة',()=>{
      reset();try{
        context();items=comparison().rows.filter(r=>r.classification==='conflict'&&['fullName','displayName','lifeStatus'].includes(r.field));renderPage();
        status(items.length?'لا يوجد اختيار افتراضي. يمكنك التنقل بين صفحات التعارضات؛ القرارات المختارة تبقى أثناء التنقل، وغير المحسوم لا يتغير.':'لا توجد تعارضات مؤهلة؛ الملاحظات والصور لا تُحسم من هنا.');
      }catch(e){status(e.message);}
    });
    const preview=button('branchConflictsPrepare','معاينة قراراتي',()=>{
      invalidate();try{
        if(!scope.familyTreeSaveBoot?.canMerge())throw Error('يلزم حفظ مستقل جاهز');
        const c=context();plan=merger().prepareResolved(c.doc,c.baseText,c.proposalText,decisions());
        previewText.textContent=plan.summary.useProposal+' قيمة مقترحة ستُستخدم • '+plan.summary.keepCurrent+' قيمة حالية ستبقى. الحقول غير المحسومة لن تتغير.';
        status(plan.summary.useProposal?'نزّل النسخة القبلية ثم راجع موافقتك قبل الاعتماد.':'اخترت إبقاء القيم الحالية فقط؛ لا تعديل للشجرة. يمكنك تنزيل القرارات الخاصة.');
      }catch(e){status('لم تتغير الشجرة. '+e.message);}
    });
    const backup=button('branchConflictsBackup','تنزيل نسخة قبل حسم التعارضات',()=>{
      try{const c=context();if(!plan||FamilySaveRuntime.hash(JSON.stringify(c.doc))!==plan.sourceHash)throw Error('يلزم معاينة حديثة');download('family-tree-before-conflict-resolution.json',JSON.stringify(c.doc));backupHash=plan.sourceHash;confirmed.checked=false;accept.disabled=true;status('بدأ التنزيل؛ تحقق من النسخة ثم وافق على القرارات المعاينة فقط.');}catch(e){invalidate();status(e.message);}
    });
    const confirmed=make('input');confirmed.id='branchConflictsConfirmed';confirmed.type='checkbox';
    const consent=make('label');consent.style.cssText='display:flex;align-items:center;gap:8px;min-height:44px;font:inherit';consent.append(confirmed,document.createTextNode('راجعت القيمتين وتحققت من النسخة الاحتياطية، وأوافق على القرارات المعاينة فقط.'));
    confirmed.onchange=()=>{accept.disabled=!confirmed.checked||!plan||!plan.summary.useProposal||backupHash!==plan.sourceHash;};
    const accept=button('branchConflictsAccept','اعتماد قرارات التعارض إلى المحرر',()=>{
      try{
        if(!scope.familyTreeSaveBoot?.canMerge()||!plan||!plan.summary.useProposal||!confirmed.checked||backupHash!==plan.sourceHash)throw Error('يلزم حفظ جاهز ومعاينة ونسخة قبلية وموافقة حديثة');
        const c=context(),fresh=merger().prepareResolved(c.doc,c.baseText,c.proposalText,decisions());
        if(fresh.candidateText!==plan.candidateText||fresh.baseHash!==plan.baseHash||fresh.proposalHash!==plan.proposalHash||JSON.stringify(fresh.decisions)!==JSON.stringify(plan.decisions))throw Error('تغيرت الملفات أو القرارات؛ أعد المعاينة');
        const next=merger().applyResolved(c.doc,c.baseText,c.proposalText,decisions(),plan.sourceHash,plan.proposalHash);
        if(!apply(next))throw Error('رفض المحرر التغيير');reset();status('أُرسلت قراراتك إلى المحرر بتراجع واحد. راقب تأكيد الحفظ؛ عند تعذره نزّل المعروض وراجع المسودات.');
      }catch(e){invalidate();status('لم تُعتمد القرارات. '+e.message);}
    });accept.disabled=true;
    const exportChoices=button('branchConflictsExport','تنزيل سجل القرارات الخاص',()=>{
      try{const c=context();if(!plan)throw Error('عاين قراراتك أولًا');const fresh=merger().prepareResolved(c.doc,c.baseText,c.proposalText,decisions());if(fresh.sourceHash!==plan.sourceHash||fresh.proposalHash!==plan.proposalHash||fresh.baseHash!==plan.baseHash||JSON.stringify(fresh.decisions)!==JSON.stringify(plan.decisions))throw Error('أعد المعاينة');download('family-tree-private-conflict-decisions.json',JSON.stringify({kind:'private-conflict-decisions',version:1,readOnly:true,canApply:false,sourceHash:plan.sourceHash,baseHash:plan.baseHash,proposalHash:plan.proposalHash,decisions:plan.decisions,summary:plan.summary},null,2));status('نُزّل سجل قرارات محلي خاص؛ ليس إثبات هوية أو موافقة من طرف آخر.');}catch(e){invalidate();status(e.message);}
    });
    const importInput=make('input');importInput.id='branchConflictsImport';importInput.type='file';importInput.accept='application/json';
    const importLabel=button('branchConflictsImportChoose','استعادة اختيارات من سجل قرارات خاص',()=>importInput.click());importLabel.setAttribute('aria-controls',importInput.id);importInput.setAttribute('aria-label','سجل قرارات خاص لاستعادة الاختيارات');importLabel.style.cssText='display:inline-block;min-height:44px';
    const importState=make('p','الاستعادة تعيد الاختيارات فقط؛ يلزم معاينة ونسخة قبلية وموافقة جديدة.');importState.id='branchConflictsImportState';importState.setAttribute('role','status');
    importInput.onchange=async()=>{
      const file=importInput.files[0];importInput.value='';if(!file)return;invalidate();const ticket=++importTicket;importPending=true;importState.textContent='جارٍ فحص سجل القرارات…';
      try{
        const captured=context(),source=FamilySaveRuntime.hash(JSON.stringify(captured.doc));
        if(file.size>1024*1024)throw Error('limit');const text=await file.text();if(ticket!==importTicket)return;
        const c=context();if(source!==FamilySaveRuntime.hash(JSON.stringify(c.doc))||c.baseText!==captured.baseText||c.proposalText!==captured.proposalText)throw Error('stale');
        let record;try{record=JSON.parse(text);}catch{throw Error('invalid');}
        if(!record||record.kind!=='private-conflict-decisions'||record.version!==1||record.readOnly!==true||record.canApply!==false)throw Error('invalid');
        const checked=merger().prepareResolved(c.doc,c.baseText,c.proposalText,record.decisions);
        if(record.sourceHash!==checked.sourceHash||record.baseHash!==checked.baseHash||record.proposalHash!==checked.proposalHash)throw Error('pins');
        confirmed.checked=false;accept.disabled=true;plan=null;backupHash=null;selected.clear();for(const d of checked.decisions)selected.set(JSON.stringify([d.personId,d.field]),d);
        items=comparison().rows.filter(r=>r.classification==='conflict'&&['fullName','displayName','lifeStatus'].includes(r.field));page=0;renderPage();
        importState.textContent='استُعيدت الاختيارات فقط دون تعديل أو موافقة. راجعها ثم أعد المعاينة والنسخ الاحتياطي.';status(importState.textContent);
      }catch{if(ticket===importTicket){importState.textContent='رُفض السجل: يلزم سجل صالح حتى1ميغابايت يطابق الشجرة والأساس والاقتراح. لم تتغير الشجرة.';status(importState.textContent);}}
      finally{if(ticket===importTicket)importPending=false;}
    };
    element.append(make('summary','مراجعة التعارضات باختيار صريح (اختياري)'),make('p','للأسماء وحالة الحياة فقط. لا تختار الأداة عنك ولا تقرر أي الروايتين صحيحة. لا تتغير الأبوة أو الهوية أو ترتيب الإخوة. الملاحظات والصور خارج هذا المسار.'),list,importLabel,importInput,importState,navigation,choices,preview,previewText,backup,consent,accept,exportChoices);
    return Object.freeze({element,reset});
  };
})(globalThis);
