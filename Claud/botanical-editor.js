(function(scope){
  'use strict';
  scope.installBotanicalEditor=function(bridge){
    const C=scope.BotanicalCore,$=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
    let doc=C.fixture(25),selection=null,result,undo=[],redo=[],view={scale:1,x:0,y:0},drag=null,saveTimer,searchIndex=[],saveVersion=0,adapterReadFailed=false;
    const persistence=scope.familyTreePersistence;
    function persistenceAdapter(){
      if(persistence===undefined||persistence===null)return null;
      if(typeof persistence.readInitial!=='function'||typeof persistence.save!=='function')throw Error('تعذر تهيئة الحفظ؛ نزّل نسخة JSON من تعديلاتك');
      return persistence;
    }
    const gestures=scope.TreeInteraction.create({thresholdPx:3});
    const measureCanvas=document.createElement('canvas'),ctx=measureCanvas.getContext('2d');ctx.font='18px Tahoma,Arial,sans-serif';
    const measure=s=>ctx.measureText(s).width;
    const sidebar=$('sidebar');
    const panel=document.createElement('div');panel.className='panel botanical-panel';panel.innerHTML=`<div class="eyebrow">المصمم التراثي · إصدار محلي</div><h2>جذورنا، حكايتنا.</h2><p class="muted">أسماء موثقة، وأغصان تحفظ صلة الأجيال.</p><div class="local-pill">● بياناتك محفوظة في هذا الجهاز</div><label for="artTemplate">القالب الفني</label><select id="artTemplate"><option value="heritage-balanced">تراثي متوازن</option><option value="heritage-dense">تراثي كثيف</option><option value="heritage-simple">تراثي مبسط</option></select><label for="colorMode">ألوان الأجيال</label><select id="colorMode"><option value="green-leaf-colored-label">ورقة خضراء وإطار بلون الجيل</option><option value="full-leaf">الورقة كاملة بلون الجيل</option></select><div id="generationLegend"></div><label for="artSearch">ابحث في أسماء الشجرة</label><input id="artSearch" placeholder="اسم الشخص أو اسم أبيه…"/><div id="searchResults"></div><div class="grid2"><button class="btn" id="undoArt">↶ تراجع</button><button class="btn" id="redoArt">إعادة ↷</button></div><label for="editMode">حركة التصميم</label><select id="editMode"><option value="select">استكشاف / تحريك اللوحة</option><option value="node">سحب ورقة واحدة</option><option value="branch">سحب الفرع مع ذريته</option></select><div class="grid2"><button class="btn" id="inspectArt">فحص الشجرة</button><button class="btn" id="resetArt">إعادة توزيع</button></div><output id="auditResult" aria-live="polite"></output><label for="fixtureSize">تجربة بيانات وهمية</label><div class="node-field-row"><select id="fixtureSize"><option>25</option><option>150</option><option>500</option><option>1000</option></select><button class="btn" id="loadFixture">تحميل</button></div><p class="muted" id="saveStatus" role="status"></p>`;
    sidebar.prepend(panel);
    const rendererControls=document.createElement('div');rendererControls.id='rendererControls';rendererControls.innerHTML=`<label for="rendererChoice">محرك العرض</label><select id="rendererChoice"><option value="legacy">المحرك السابق — الأساسي</option><option value="botanical">المحرك الفني الجديد — اختياري</option></select><p id="rendererNote" class="muted" role="status"></p>`;panel.prepend(rendererControls);
    const printControls=document.createElement('div');printControls.innerHTML=`<label for="canopyShape">شكل التاج</label><select id="canopyShape"><option value="oval">بيضاوي</option><option value="circle">مستدير</option></select><label>مقاس الملصق الفني بالملّيمتر</label><div class="grid2"><label for="printWidth">العرض<input id="printWidth" type="number" min="100" max="5000" value="700"/></label><label for="printHeight">الارتفاع<input id="printHeight" type="number" min="100" max="5000" value="1000"/></label></div><button class="btn" id="savePrint">حفظ مقاس الملصق</button><button class="btn btn-block" id="paperPoster">ملصق 70 × 100 سم</button>`;panel.append(printControls);
    const readablePrint=document.createElement('div');readablePrint.innerHTML=`<label>مقاس دفتر الأسر</label><div class="grid2" role="group" aria-label="مقاس دفتر الأسر"><button class="btn" id="paperA4" aria-pressed="true">A4 · 21 × 29.7 سم</button><button class="btn" id="paperA3" aria-pressed="false">A3 · 29.7 × 42 سم</button></div><p class="muted" id="bookPaperNote" role="status"></p><label for="printScope">نطاق الطباعة</label><select id="printScope"><option value="whole">العائلة كاملة</option><option value="selected">فرع الشخص المحدد</option></select><p class="muted" id="printScopeHint" role="status"></p><label for="printMinimum">أصغر خط في صفحات الفروع (نقطة)</label><input id="printMinimum" type="number" min="8" max="24" step="1" value="8"/><button class="btn btn-gold btn-block" id="readableBook">دفتر طباعة مقروء</button><p class="muted" id="printBookStatus" role="status">يوزّع الأسماء على صفحات فروع مع فهرس، ويحافظ على أجيالها وألوانها.</p>`;panel.append(readablePrint);
    const printDialog=document.createElement('dialog');printDialog.id='printBookDialog';printDialog.innerHTML=`<div class="print-toolbar"><strong id="printBookHeading">معاينة دفتر الفروع</strong><button class="btn btn-gold" id="downloadPdfBook" disabled>تنزيل PDF مباشر</button><button class="btn" id="cancelPdfBook" disabled>إلغاء التنزيل</button><button class="btn" id="printBookNow">طباعة / حفظ PDF من المتصفح</button><button class="btn" id="downloadBook">حفظ ملف الطباعة HTML</button><button class="btn" id="closePrintBook">إغلاق</button><span class="print-settings-summary" id="printSettingsSummary"></span><span class="print-settings-summary" id="pdfBookStatus" role="status" aria-live="polite">PDF المباشر يحفظ صفحات الدفتر بالمقاس المحدد كصور عالية الدقة، دون نافذة الطباعة. للحفظ المتجهي استخدم الطباعة أو HTML.</span></div><iframe id="printBookFrame" title="معاينة صفحات شجرة العائلة" sandbox="allow-same-origin allow-modals"></iframe>`;document.body.append(printDialog);
    let printBookHTML='',printFrameReady=false,printBookSource=null,pdfJob=null,printPreparing=false,printPreviewVersion=0;
    function currentPrintFrameReady(){try{return !!printBookSource&&$('printBookFrame').contentDocument?.body?.getAttribute('data-print-preview')===String(printPreviewVersion);}catch{return false;}}
    $('printBookFrame').onload=()=>{printFrameReady=currentPrintFrameReady();$('printBookNow').disabled=!printFrameReady;};
    $('closePrintBook').onclick=()=>printDialog.close();
    printDialog.addEventListener('close',()=>pdfJob?.controller.abort());
    $('downloadBook').onclick=()=>{if(printBookSource)download(printBookSource.book.scope?.kind==='branch'?'family-branch-readable-print.html':'family-tree-readable-print.html',printBookHTML,'text/html;charset=utf-8');};
    $('printBookNow').onclick=()=>{if(printFrameReady&&currentPrintFrameReady()){$('printBookFrame').contentWindow.focus();$('printBookFrame').contentWindow.print();}};
    $('cancelPdfBook').onclick=()=>pdfJob?.controller.abort();
    $('downloadPdfBook').onclick=async()=>{
      if(pdfJob||!printDialog.open||!printBookSource)return;
      if(!scope.TreePrintDocument||!scope.TreePdfExport){$('pdfBookStatus').textContent='تعذر تحميل أداة PDF؛ أعد فتح الصفحة';return;}
      const source=printBookSource,job={controller:new scope.AbortController()};pdfJob=job;
      $('downloadPdfBook').disabled=true;$('cancelPdfBook').disabled=false;$('pdfBookStatus').textContent='جارٍ تجهيز صفحات PDF…';
      try{
        await new Promise(resolve=>setTimeout(resolve,0));
        if(job.controller.signal.aborted)return;
        const pages=scope.TreePrintDocument.pages(source.doc,source.book,measure);
        const bytes=await scope.TreePdfExport.create(pages,{signal:job.controller.signal,onProgress:progress=>{
          if(pdfJob===job)$('pdfBookStatus').textContent=`تجهيز ${progress.completed} من ${progress.total} صفحة · الدقة حتى ${Math.floor(progress.effectiveDpi)} نقطة/بوصة`;
        }});
        if(job.controller.signal.aborted)return;
        download(source.book.scope?.kind==='branch'?'family-branch-readable.pdf':'family-tree-readable.pdf',bytes,'application/pdf');
        $('pdfBookStatus').textContent=`جُهّز ملف من ${pages.length} صفحة للتنزيل بالمقاس المحدد، دون تاريخ أو مسار ملف من المتصفح. PDF بصور الصفحات؛ النص غير قابل للبحث.`;
      }catch(error){if(pdfJob===job)$('pdfBookStatus').textContent=error.name==='AbortError'?'أُلغي إنشاء PDF دون تنزيل ملف جزئي.':error.message;}
      finally{if(pdfJob===job){pdfJob=null;$('downloadPdfBook').disabled=!printBookSource;$('cancelPdfBook').disabled=true;if(job.controller.signal.aborted)$('pdfBookStatus').textContent='أُلغي إنشاء PDF دون تنزيل ملف جزئي.';}}
    };
    const childrenBatchDialog=document.createElement('dialog');childrenBatchDialog.id='childrenBatchDialog';childrenBatchDialog.setAttribute('aria-labelledby','childrenBatchTitle');
    childrenBatchDialog.innerHTML=`<div class="children-batch-head"><h2 id="childrenBatchTitle">إضافة أبناء دفعة واحدة</h2><button type="button" class="btn" id="closeChildrenBatch">إغلاق</button></div><div class="children-batch-body"><p id="childrenBatchFather" class="workspace-father-context"></p><label for="childrenBatchNames">أسماء الأبناء — اسم واحد في كل سطر</label><textarea id="childrenBatchNames" rows="5" placeholder="اسم الابن الأول&#10;اسم الابن الثاني"></textarea><p class="muted">حتى 100 اسم في الدفعة. تظهر علاقات الأبوة للمراجعة قبل الحفظ، ويمكن التراجع عن الدفعة كاملة.</p><button type="button" class="btn" id="previewChildrenBatch">معاينة الأبناء</button><p id="childrenBatchStatus" role="status" aria-live="polite"></p><div id="childrenBatchPreview" hidden><ol id="childrenBatchRows"></ol><label id="childrenBatchDuplicateLabel" hidden><input type="checkbox" id="childrenBatchAllowDuplicates"/> راجعت الأسماء المتكررة، وأريد إضافتها كأشخاص مستقلين</label></div></div><div class="children-batch-footer"><button type="button" class="btn btn-gold" id="saveChildrenBatch" disabled>إضافة الدفعة إلى الشجرة</button><button type="button" class="btn" id="cancelChildrenBatch">إلغاء</button></div>`;
    document.body.append(childrenBatchDialog);let childrenBatchProposal=null,childrenBatchFatherId=null;
    const detail=document.createElement('div');detail.innerHTML=`<label for="shortName">الاسم على الورقة (اختياري)</label><input id="shortName"/><label for="lifeStatus">حالة الحياة</label><select id="lifeStatus"><option value="unknown">غير معروف</option><option value="living">حي</option><option value="deceased">متوفى</option></select><label for="personNotes">ملاحظات</label><textarea id="personNotes" rows="2"></textarea><fieldset id="personDocumentationEditor"><legend>المصدر والتحقق</legend><label for="personReference">مرجع المعلومة (اختياري)</label><textarea id="personReference" rows="3" maxlength="2000" aria-describedby="personDocumentationHint" placeholder="مثال: رواية أحد الأقارب، أو اسم الوثيقة ورقم الصفحة"></textarea><label for="personVerification">حالة التحقق</label><select id="personVerification" aria-describedby="personDocumentationHint"><option value="">غير مسجل</option><option value="pending">بانتظار التحقق</option><option value="approved">معتمد</option><option value="review">يحتاج مراجعة</option></select><p class="muted" id="personDocumentationHint"></p></fieldset><img id="personPhoto" alt="صورة الشخص" hidden/><label class="btn" for="uploadPhoto">إضافة / تغيير صورة</label><input type="file" id="uploadPhoto" accept="image/png,image/jpeg,image/webp"/><button class="btn btn-sm" id="removePhoto">إزالة الصورة</button><p id="personGeneration"></p><div class="grid2"><label>الدوران <input id="nodeRotation" type="number" min="-180" max="180" value="0"/></label><label>الحجم <input id="nodeScale" type="number" min="0.5" max="2" step="0.1" value="1"/></label></div><label><input type="checkbox" id="lockNode"/> قفل موضع الشخص</label><button class="btn" id="saveDetails">حفظ البطاقة والتصميم</button><button class="btn" id="branchContract">تنزيل هيكل مساهمة الفرع</button>`;
    $('selBody').append(detail);
    const closePerson=document.createElement('button');closePerson.className='btn close-person';closePerson.textContent='إغلاق البطاقة';closePerson.setAttribute('aria-label','إغلاق بطاقة الشخص');closePerson.onclick=()=>$('selPanel').classList.remove('mobile-open');$('selPanel').prepend(closePerson);
    const exportBranch=document.createElement('button');exportBranch.id='btnExportBranchSvg';exportBranch.className='btn';exportBranch.textContent='حفظ الفرع بالتصميم الفني SVG';exportBranch.onclick=()=>{if(selection){const part=C.branch(doc,selection);download('family-branch.svg',C.svgMarkup(part),'image/svg+xml');}};detail.append(exportBranch);
    const backupBtn=document.createElement('button');backupBtn.id='btnExportLegacyJson';backupBtn.className='btn btn-outline-light btn-sm';backupBtn.textContent='JSON قديم';backupBtn.onclick=()=>download('family-tree-legacy.json',JSON.stringify(C.legacy(doc),null,2),'application/json');document.querySelector('header .actions').append(backupBtn);
    $('treeTitle').setAttribute('aria-label','عنوان الشجرة');
    ['editGender','newChildGender'].forEach(id=>{$(id).innerHTML='<option value="m">ذكر</option>';$(id).disabled=true;});
    const childLabel=$('newChildGender').previousElementSibling.previousElementSibling;if(childLabel?.tagName==='LABEL')childLabel.textContent='إضافة ابن جديد';
    // Existing layout/template controls continue to use the original renderer on a filtered copy.
    const legacyControls=['selLayout','selNodeShape','selBranch','themeGrid','tplGrid'];
    legacyControls.forEach(id=>$(id).addEventListener('change',()=>{doc.presentation.activeRenderer='legacy';doc.presentation.legacySettings={...doc.presentation.legacySettings,...bridge.getSettings()};draw();persist();}));
    ['themeGrid','tplGrid'].forEach(id=>$(id).addEventListener('click',()=>{doc.presentation.activeRenderer='legacy';doc.presentation.legacySettings={...doc.presentation.legacySettings,...bridge.getSettings()};draw();persist();}));
    function replace(id,fn,event='click'){const old=$(id),n=old.cloneNode(true);old.replaceWith(n);n.addEventListener(event,fn);return n;}
    function snapshot(){return JSON.stringify(doc);}
    function remember(){undo.push(snapshot());if(undo.length>30)undo.shift();redo=[];}
    function persist(){
      clearTimeout(saveTimer);const saved=snapshot(),version=++saveVersion;$('saveStatus').textContent='جارٍ الحفظ المحلي…';
      saveTimer=setTimeout(async()=>{try{
        const adapter=persistenceAdapter();
        if(adapter){if(adapterReadFailed)throw Error('تعذر فتح الحفظ؛ نزّل نسخة JSON من تعديلاتك');const receipt=await adapter.save(saved);if(receipt?.committed!==true)throw Error('لم يؤكد مصدر الحفظ العملية');}
        else localStorage.setItem('family-tree.botanical.v2',saved);
        if(version===saveVersion)$('saveStatus').textContent='تم الحفظ محلياً • نزّل JSON للاحتفاظ بنسخة مستقلة';
      }catch{if(version===saveVersion)$('saveStatus').textContent='تعذر الحفظ المحلي؛ نزّل نسخة JSON الآن';}},300);
    }
    function commit(fn){const previous=snapshot();try{fn();C.validate(doc);doc.revision=(doc.revision||0)+1;undo.push(previous);if(undo.length>30)undo.shift();redo=[];draw();persist();return true;}catch(e){doc=JSON.parse(previous);if(doc.presentation.legacySettings)bridge.setSettings(doc.presentation.legacySettings);draw();bridge.toast(e.message);return false;}}
    function download(name,content,type){const u=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000);}
    function transform(){let v=$('viewport');if(v)v.setAttribute('transform',`translate(${view.x} ${view.y}) scale(${view.scale})`);}
    function fit(){view={scale:1,x:0,y:0};transform();}
    function prepareRenderer(next,initial=false){
      const p=next.presentation;
      // Apply the user's new default once to historical saves. Thereafter an
      // explicit choice is part of presentation and survives JSON/reopening.
      if(p.rendererChoiceVersion!==1){if(initial||!['legacy','botanical'].includes(p.activeRenderer))p.activeRenderer='legacy';p.rendererChoiceVersion=1;}
      if(!['legacy','botanical'].includes(p.activeRenderer))p.activeRenderer='legacy';
      if(!p.legacySettings)p.legacySettings=bridge.getSettings();
      return next;
    }
    function syncRendererControls(){
      const legacy=doc.presentation.activeRenderer==='legacy';$('rendererChoice').value=legacy?'legacy':'botanical';
      $('rendererNote').textContent=legacy?'المحرك السابق هو العرض الأساسي. تعديل البيانات والبحث وإضافة الأبناء متاحة؛ تحريك الأوراق والفروع متاح في المحرك الفني الاختياري.':'المحرك الفني خيار ثانوي. مواضعه وأقفاله محفوظة عند العودة إلى المحرك السابق.';
      for(const id of ['artTemplate','canopyShape','editMode','nodeRotation','nodeScale','lockNode','resetArt'])$(id).disabled=legacy;
      if(legacy)$('editMode').value='select';
      $('saveDetails').textContent=legacy?'حفظ البطاقة':'حفظ البطاقة والتصميم';
    }
    function draw(){
      const frozenBox=drag?$('treeSvg').getAttribute('viewBox'):null;
      result=C.layout(doc,measure);
      if(doc.presentation.activeRenderer==='legacy'){
        const visibleRoot=n=>({...n,id:n.personId,name:n.fullName,children:n.children.map(visibleRoot)});
        const positions=new Map(bridge.legacy(visibleRoot(result.root)).map(n=>[n.id,n]));
        for(const n of result.nodes){const old=positions.get(n.personId);n.x=old.x;n.y=old.y;n.width=150;n.height=80;n.fontSize=14;}
        const oldBox=$('treeSvg').viewBox.baseVal;result.width=oldBox.width;result.height=oldBox.height;result.minX=oldBox.x;result.minY=oldBox.y;
        $('treeSvg').querySelectorAll('.plusbtn').forEach(g=>g.remove());
        // Assign stable IDs, generation colors and accessible actions to old nodes.
        const groups=[...$('treeSvg').querySelectorAll('.nodegroup')];groups.forEach((g,i)=>{const n=result.nodes[i];if(!n)return;g.dataset.personId=n.personId;g.setAttribute('tabindex','0');g.setAttribute('role','button');g.setAttribute('aria-label',n.fullName+'، الجيل '+(n.generation+1));const title=document.createElementNS(NS,'title');title.textContent=n.fullName+' — الجيل '+(n.generation+1);g.append(title);const shape=g.querySelector('.nodeshape'),color=C.color(doc.presentation,n.generation);shape?.setAttribute('stroke',color);shape?.setAttribute('fill',doc.presentation.generationColorMode==='full-leaf'?color:'#dce8bf');if(doc.presentation.generationColorMode==='full-leaf')g.querySelector('text')?.setAttribute('fill','#fff');g.addEventListener('click',e=>{e.stopImmediatePropagation();select(n.personId);},true);});
      }else{
        const parsed=new DOMParser().parseFromString(C.svgMarkup(doc,result),'image/svg+xml').documentElement;
        const svg=$('treeSvg');svg.setAttribute('viewBox',parsed.getAttribute('viewBox'));svg.innerHTML='';const vp=document.createElementNS(NS,'g');vp.id='viewport';for(const child of [...parsed.children])vp.append(document.importNode(child,true));svg.append(vp);
      }
      if(frozenBox)$('treeSvg').setAttribute('viewBox',frozenBox);
      transform();highlight();updateLegend();$('artTemplate').value=doc.presentation.template;$('colorMode').value=doc.presentation.generationColorMode;$('canopyShape').value=doc.presentation.canopyShape;$('treeTitle').value=doc.title;$('printWidth').value=doc.presentation.print.widthMm;$('printHeight').value=doc.presentation.print.heightMm;$('printMinimum').value=doc.presentation.print.minLabelPt;
      $('undoArt').disabled=!undo.length;$('redoArt').disabled=!redo.length;
      syncRendererControls();
      syncBookPaperControls();
      updatePrintScopeHint();
      $('auditResult').textContent=`${result.nodes.length} رجل · ${result.maxDepth+1} أجيال${result.excluded?' · '+result.excluded+' سجلاً محفوظاً خارج العرض':''}`;
      const byId=new Map(result.nodes.map(n=>[n.personId,n]));
      searchIndex=result.nodes.map(n=>({id:n.personId,label:n.fullName,parent:byId.get(n.parentId)?.fullName||'الأصل',text:searchText(n.fullName+' '+(byId.get(n.parentId)?.fullName||''))}));
      scope.familyTreeWorkspace?.refresh();
      scope.familyTreeBranchReview?.refresh();
      scope.familyTreeBranchMerge?.refresh();
      scope.familyTreeBranchCompare?.refresh();
      scope.familyTreeKinship?.refresh();
    }
    function updateLegend(){const wrap=$('generationLegend');wrap.replaceChildren();for(let g=0;g<=result.maxDepth;g++){const label=document.createElement('label');label.className='generation-chip';const input=document.createElement('input');input.type='color';input.value=C.color(doc.presentation,g);input.setAttribute('aria-label','لون الجيل '+(g+1));input.onchange=()=>commit(()=>doc.presentation.generationPalette[g]=input.value);label.append(input,document.createTextNode('الجيل '+(g+1)));wrap.append(label);}}
    function highlight(){const ids=new Set();let n=result.nodes.find(n=>n.personId===selection);while(n){ids.add(n.personId);n=result.nodes.find(p=>p.personId===n.parentId);}for(const g of $('treeSvg').querySelectorAll('[data-person-id]')){g.classList.toggle('selected-person',g.dataset.personId===selection);g.classList.toggle('ancestor-person',ids.has(g.dataset.personId));}for(const path of $('treeSvg').querySelectorAll('[data-child-id]'))path.setAttribute('stroke',ids.has(path.dataset.childId)?'#ad8333':'#65452d');}
    function select(id){const n=result.nodes.find(p=>p.personId===id);if(!n)return;selection=id;$('selEmpty').style.display='none';$('selBody').style.display='block';$('selName').textContent=n.fullName;$('editName').value=n.fullName;$('shortName').value=n.displayName||'';$('lifeStatus').value=n.lifeStatus||'unknown';$('personNotes').value=n.notes||'';syncPersonDocumentation(n);$('personGeneration').textContent='الجيل '+(n.generation+1)+' • '+n.descendantCount+' من الذرية المعروضة';$('personPhoto').hidden=!n.photo;if(n.photo)$('personPhoto').src=n.photo;else $('personPhoto').removeAttribute('src');const o=doc.presentation.nodeOverrides[doc.presentation.template]?.[id]||{};$('nodeRotation').value=o.rotation||0;$('nodeScale').value=o.scale||1;$('lockNode').checked=isLocked(id);$('btnDeleteNode').style.display=id===doc.rootPersonId?'none':'block';highlight();updatePrintScopeHint();scope.familyTreeWorkspace?.selected();}
    const person=()=>doc.persons.find(p=>p.personId===selection);
    function syncPersonDocumentation(n){
      const state=C.personDocumentation(n),unsupported=state.kind==='unsupported';
      $('personReference').value=state.reference;$('personVerification').value=state.status;
      $('personReference').disabled=unsupported;$('personVerification').disabled=unsupported;
      $('personDocumentationHint').textContent=unsupported?'يوجد توثيق بتنسيق غير مدعوم؛ يبقى محفوظًا دون تعديل، ويمكنك تعديل بقية البطاقة.':'المرجع نص محلي حتى 2000 حرف. اختر حالة عند تسجيل مرجع؛ الحالة وصف يسجله المستخدم. لإزالة التوثيق من البطاقة أفرغ المرجع واختر «غير مسجل» ثم احفظ.';
    }
    function savePerson(){
      if(!person())return;
      commit(()=>{
        if(C.personDocumentation(person()).kind!=='unsupported'){
          const updated=C.withPersonDocumentation(person(),$('personReference').value,$('personVerification').value);
          if(Object.prototype.hasOwnProperty.call(updated,'treefDocumentation'))person().treefDocumentation=updated.treefDocumentation;else delete person().treefDocumentation;
        }
        person().fullName=$('editName').value.trim();person().displayName=$('shortName').value.trim();person().lifeStatus=$('lifeStatus').value;person().notes=$('personNotes').value;
        const p=doc.presentation,t=p.template;if(p.activeRenderer!=='legacy'){p.nodeOverrides[t]||={};p.nodeOverrides[t][selection]={...p.nodeOverrides[t][selection],rotation:Math.max(-180,Math.min(180,Number($('nodeRotation').value)||0)),scale:Math.max(.5,Math.min(2,Number($('nodeScale').value)||1))};
        if($('lockNode').checked){const n=result.nodes.find(n=>n.personId===selection);const old=p.lockedElements[selection];p.lockedElements[selection]={...(typeof old==='object'?old:{}),[t]:{x:n.x,y:n.y}};}
        else if(p.lockedElements[selection]&&typeof p.lockedElements[selection]==='object')delete p.lockedElements[selection][t];
        else delete p.lockedElements[selection];
        }
      });select(selection);
    }
    replace('btnSaveName',savePerson);$('saveDetails').onclick=savePerson;
    replace('btnAddChild',()=>{const name=$('newChildName').value.trim();if(!selection||!name)return bridge.toast('حدد الأب واكتب اسم الابن');const father=selection;const added=commit(()=>{const id=C.uid();doc.persons.push({personId:id,fullName:name,gender:'m',lifeStatus:'unknown'});doc.relationships.push({relationshipId:C.uid(),type:'father',parentId:father,childId:id,siblingOrder:Date.now()});});if(!added)return;$('newChildName').value='';select(father);$('newChildName').focus();bridge.toast('أضيف الابن إلى '+person().fullName);});
    replace('btnDeleteNode',()=>{if(!selection||selection===doc.rootPersonId)return;if(!confirm('حذف الشخص وفرعه؟ يمكنك التراجع عن العملية.'))return;const remove=new Set();function walk(id){remove.add(id);doc.relationships.filter(r=>r.type==='father'&&r.parentId===id).forEach(r=>walk(r.childId));}walk(selection);commit(()=>{doc.persons=doc.persons.filter(p=>!remove.has(p.personId));doc.relationships=doc.relationships.filter(r=>!remove.has(r.childId)&&!remove.has(r.parentId));});selection=null;$('selBody').style.display='none';$('selEmpty').style.display='block';});
    replace('btnSetRoot',()=>{const name=$('rootNameInput').value.trim();if(name)commit(()=>doc.persons.find(p=>p.personId===doc.rootPersonId).fullName=name);});
    $('treeTitle').addEventListener('change',()=>commit(()=>doc.title=$('treeTitle').value));
    $('rendererChoice').onchange=e=>{
      if(gestures.active){syncRendererControls();return;}
      const renderer=e.target.value;if(!['legacy','botanical'].includes(renderer)){syncRendererControls();return;}
      const changed=commit(()=>{doc.presentation.legacySettings={...doc.presentation.legacySettings,...bridge.getSettings()};doc.presentation.activeRenderer=renderer;doc.presentation.rendererChoiceVersion=1;});if(changed)fit();
    };
    $('artTemplate').onchange=e=>{if(doc.presentation.activeRenderer==='legacy')return;commit(()=>{doc.presentation.template=e.target.value;doc.presentation.activeRenderer='botanical';});fit();};
    $('colorMode').onchange=e=>commit(()=>doc.presentation.generationColorMode=e.target.value);
    $('canopyShape').onchange=e=>commit(()=>doc.presentation.canopyShape=e.target.value);
    $('savePrint').onclick=()=>commit(()=>{doc.presentation.print.widthMm=Number($('printWidth').value);doc.presentation.print.heightMm=Number($('printHeight').value);});
    $('printMinimum').onchange=()=>commit(()=>{const value=Number($('printMinimum').value);if(!Number.isFinite(value)||value<8||value>24)throw Error('اختر حداً أدنى بين 8 و24 نقطة');doc.presentation.print.minLabelPt=value;});
    $('paperA4').onclick=()=>setBookPaper('A4');
    $('paperA3').onclick=()=>setBookPaper('A3');
    $('paperPoster').onclick=()=>commit(()=>{doc.presentation.print.widthMm=700;doc.presentation.print.heightMm=1000;});
    function setBookPaper(preset){if(gestures.active)return false;return commit(()=>{doc.presentation.bookPaper=preset;});}
    function syncBookPaperControls(){
      const paper=C.bookPaper(doc.presentation);
      for(const preset of ['A4','A3']){const button=$('paper'+preset),active=paper.preset===preset;button.setAttribute('aria-pressed',String(active));button.setAttribute('class','btn'+(active?' btn-gold':''));}
      $('bookPaperNote').textContent=`دفتر ${paper.preset} · ${paper.widthMm} × ${paper.heightMm} مم. مقاس الملصق مستقل.`;
    }
    function printScopeOptions(){
      const choice=$('printScope').value;if(choice==='whole')return {anchorPersonId:null};
      if(choice!=='selected')throw Error('اختر نطاق طباعة صالحًا');
      if(!selection||!result?.nodes.some(n=>n.personId===selection))throw Error('اختر أصل الفرع من الشجرة أو البحث أولًا');
      return {anchorPersonId:selection};
    }
    function updatePrintScopeHint(){
      const n=result?.nodes.find(p=>p.personId===selection);
      $('printScopeHint').textContent=$('printScope').value==='selected'?(n?`فرع ${n.fullName} · ${n.descendantCount+1} شخصًا · يبدأ بالجيل ${n.generation+1} من العائلة، بألوانه الأصلية`:'اختر أصل الفرع من الشجرة أو البحث أولًا؛ لن تُطبع العائلة كاملة بدلًا منه.'):`العائلة كاملة · ${result?.nodes.length||0} شخصًا، مع أجيالها وألوانها الأصلية.`;
    }
    function openBranchPrint(){
      if(gestures.active||printPreparing)return;
      if(!selection||!result?.nodes.some(n=>n.personId===selection))return bridge.toast('اختر أصل الفرع من الشجرة أولًا');
      $('printScope').value='selected';updatePrintScopeHint();return $('readableBook').onclick();
    }
    $('printScope').onchange=updatePrintScopeHint;
    async function openPrintBook(readingEdition=false){
      if(gestures.active||printPreparing)return;printPreparing=true;
      $('readableBook').disabled=true;$('printBookStatus').textContent='جارٍ توزيع الصفحات وفحص حجم الخط…';
      pdfJob?.controller.abort();printBookSource=null;printFrameReady=false;$('downloadPdfBook').disabled=true;$('printBookNow').disabled=true;
      $('pdfBookStatus').textContent='اختر تنزيل PDF مباشر لحفظ هذا الدفتر بالمقاس المحدد، دون نافذة الطباعة. الصفحات صور غير قابلة للبحث.';
      try{const options=readingEdition?{}:printScopeOptions(),printDoc=C.copy(doc),version=++printPreviewVersion;
        if(readingEdition){
          for(const person of printDoc.persons)delete person.displayName;
          printDoc.presentation.bookPaper='A3';
          // Leave headroom for the browser's conversion to physical PDF points.
          printDoc.presentation.print.minLabelPt=9.1;
        }
        await new Promise(resolve=>setTimeout(resolve,0));
        const book=scope.BotanicalPrint.plan(printDoc,measure,options);
        if(options.anchorPersonId&&(book.scope?.kind!=='branch'||book.scope.anchorPersonId!==options.anchorPersonId))throw Error('أداة طباعة الفرع غير محدثة؛ أعد فتح الصفحة');
        printBookHTML=scope.BotanicalPrint.html(printDoc,book).replace(/<body\b([^>]*)>/i,`<body$1 data-print-preview="${version}">`);printBookSource={doc:printDoc,book};
        $('printBookHeading').textContent=readingEdition?'نسخة قراءة A3':book.scope?.kind==='branch'?'دفتر فرع '+book.scope.anchorName:'دفتر العائلة كاملة';
        $('downloadPdfBook').disabled=!!pdfJob;printFrameReady=false;$('printBookNow').disabled=true;$('printBookFrame').srcdoc=printBookHTML;$('printBookStatus').textContent=`${book.scope?.kind==='branch'?'فرع محدد · ':''}${book.people} شخصاً · ${book.pages.length} صفحة فروع + فهرس · أصغر اسم ${book.minLabelPt.toFixed(1)} نقطة عند الطباعة بالمقاس المحدد بنسبة 100%`;
        $('printSettingsSummary').textContent=`دفتر ${book.paper.preset||''} · طابق نافذة الطباعة مع ${book.paper.widthMm}×${book.paper.heightMm} مم و100%، وألغِ Headers and footers. لحفظ PDF اختر Save as PDF إن توفر؛ قد تستخدم طابعة Windows مقاساً مختلفاً.`;
        printDialog.showModal();
      }catch(e){bridge.toast(e.message);$('printBookStatus').textContent=e.message;}finally{printPreparing=false;$('readableBook').disabled=false;}
    }
    $('readableBook').onclick=()=>openPrintBook();
    function restore(next){doc=C.normalize(next);scope.familyTreeKinship?.close();selection=null;$('selPanel').classList.remove('mobile-open');if(doc.presentation.legacySettings)bridge.setSettings(doc.presentation.legacySettings);draw();persist();$('selBody').style.display='none';$('selEmpty').style.display='block';}
    $('undoArt').onclick=()=>{if(!undo.length)return;redo.push(snapshot());restore(JSON.parse(undo.pop()));};
    $('redoArt').onclick=()=>{if(!redo.length)return;undo.push(snapshot());restore(JSON.parse(redo.pop()));};
    $('resetArt').onclick=()=>{if(!confirm('إعادة توزيع العناصر غير المقفلة في القالب الحالي؟'))return;commit(()=>{for(const collection of [doc.presentation.nodeOverrides,doc.presentation.branchOverrides]){const bucket=collection[doc.presentation.template]||{};for(const id of Object.keys(bucket))if(!isLocked(id))delete bucket[id];}});};
    $('inspectArt').onclick=()=>{const a=C.audit(result),missing=result.nodes.filter(n=>!n.photo).length,unknown=result.nodes.filter(n=>n.lifeStatus==='unknown').length;const pt=a.minFontPx*Math.min(doc.presentation.print.widthMm/result.width,doc.presentation.print.heightMm/(result.height+Math.ceil((result.maxDepth+1)/8)*25))*72/25.4;$('auditResult').textContent=`النسب صالح. ${a.overlaps} تداخل بين حدود الأوراق. ${missing} بلا صورة، ${unknown} بحالة حياة غير معروفة. الخط المطبوع نحو ${pt.toFixed(1)} نقطة على عرض ${doc.presentation.print.widthMm/10} سم؛ ${pt<8?'كبّر المقاس أو صدّر فروعاً منفصلة.':'المقاس الأولي مناسب.'} فحص تقاطعات الأغصان بصري في هذه المرحلة.`;};
    function searchText(value){return value.normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g,'').trim();}
    function focusPerson(id){const n=result.nodes.find(n=>n.personId===id);if(!n)return;select(id);const box=$('treeSvg').viewBox.baseVal;view={scale:Math.max(2,Math.min(100,box.width/650)),x:0,y:0};view.x=box.x+box.width/2-n.x*view.scale;view.y=box.y+box.height/2-n.y*view.scale;transform();$('selPanel').classList.add('mobile-open');}
    $('artSearch').oninput=()=>{const text=searchText($('artSearch').value),wrap=$('searchResults');wrap.replaceChildren();if(!text){scope.familyTreeWorkspace?.searchUpdated(0,false);return;}const matches=searchIndex.filter(n=>n.text.includes(text));for(const n of matches.slice(0,30)){const b=document.createElement('button');b.className='search-result';b.textContent=n.label+' · '+n.parent;b.onclick=()=>{focusPerson(n.id);scope.familyTreeWorkspace?.searchSelected();};wrap.append(b);}scope.familyTreeWorkspace?.searchUpdated(matches.length,true);};
    function load(next){doc=prepareRenderer(next);scope.familyTreeKinship?.close();if(doc.presentation.legacySettings)bridge.setSettings(doc.presentation.legacySettings);selection=null;$('selPanel').classList.remove('mobile-open');view={scale:1,x:0,y:0};$('treeTitle').value=doc.title;$('selBody').style.display='none';$('selEmpty').style.display='block';draw();persist();}
    $('loadFixture').onclick=()=>{if(confirm('استبدال الشجرة ببيانات وهمية؟ تتوفر العودة بزر التراجع.')){remember();load(C.fixture(Number($('fixtureSize').value)));}};
    replace('btnSample',()=>{if(confirm('استبدال الشجرة بمثال وهمي من 25 اسماً؟ يمكنك التراجع.')){remember();load(C.fixture(25));}});
    replace('fileInput',async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>20*1024*1024)return bridge.toast('حد ملف JSON هو 20 ميغابايت');try{const candidate=C.normalize(JSON.parse(await file.text())),v=C.visible(candidate);if(!v.root)throw Error('الجذر المستورد خارج عرض الذكور');if(!confirm(`معاينة: ${v.nodes.length} رجل سيظهر، ${v.excluded} سجلاً سيبقى محفوظاً خارج العرض. استبدال الشجرة المحلية مع إمكان التراجع؟`))return;remember();load(candidate);}catch(err){bridge.toast(err.message);}},'change');
    replace('btnExportJson',()=>download('family-tree-v2.json',JSON.stringify(doc,null,2),'application/json'));
    function exported(){if(doc.presentation.activeRenderer!=='legacy')return C.svgMarkup(doc,result);const s=$('treeSvg').cloneNode(true);s.querySelector('#viewport')?.removeAttribute('transform');s.querySelectorAll('.plusbtn').forEach(n=>n.remove());s.setAttribute('xmlns',NS);return new XMLSerializer().serializeToString(s);}
    replace('btnExportSvg',()=>download('family-tree.svg',exported(),'image/svg+xml'));
    replace('btnExportPng',async()=>{
      await document.fonts.ready;
      const parsed=new DOMParser().parseFromString(exported(),'image/svg+xml').documentElement,box=parsed.getAttribute('viewBox').split(/[ ,]+/).map(Number),w=box[2],h=box[3],ratio=Math.min(2,4096/Math.max(w,h));
      const width=Math.ceil(w*ratio),height=Math.ceil(h*ratio);
      // Bound the SVG image itself before decode, as well as the output canvas.
      parsed.setAttribute('width',width);parsed.setAttribute('height',height);
      const img=new Image(),url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(parsed)],{type:'image/svg+xml'}));
      img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const c=canvas.getContext('2d');c.fillStyle='#faf5e8';c.fillRect(0,0,width,height);c.drawImage(img,0,0,width,height);URL.revokeObjectURL(url);canvas.toBlob(blob=>{if(blob)download('family-tree.png',blob,'image/png');else bridge.toast('تعذر التصدير');});};
      img.onerror=()=>{URL.revokeObjectURL(url);bridge.toast('تعذر إنشاء PNG؛ استخدم SVG');};img.src=url;
    });
    $('branchContract').onclick=()=>{if(selection)download('branch-contribution-draft.json',JSON.stringify(C.contribution(doc,selection),null,2),'application/json');};
    $('uploadPhoto').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file||!person())return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)return bridge.toast('اختر PNG/JPEG/WebP أقل من 5 ميغابايت');const selected=selection;try{const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas'),ratio=Math.min(1,800/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();commit(()=>doc.persons.find(p=>p.personId===selected).photo=canvas.toDataURL('image/jpeg',.85));select(selected);}catch{bridge.toast('الصورة تالفة أو غير مدعومة');}};
    $('removePhoto').onclick=()=>{if(person())commit(()=>delete person().photo);select(selection);};
    // Pointer events use SVG coordinates, so mouse/touch remain correct after zoom.
    const svg=$('treeSvg');svg.style.touchAction='none';
    function point(e){return new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());}
    svg.addEventListener('mousedown',e=>e.stopImmediatePropagation(),true);
    svg.addEventListener('wheel',e=>{e.preventDefault();e.stopImmediatePropagation();if(gestures.active)return;const pt=point(e),old=view.scale;view.scale=Math.max(.25,Math.min(100,view.scale*(e.deltaY>0?.9:1.1)));view.x=pt.x-(pt.x-view.x)*view.scale/old;view.y=pt.y-(pt.y-view.y)*view.scale/old;transform();},{capture:true,passive:false});
    function isLocked(id){const value=doc.presentation.lockedElements[id];return value===true||!!value?.[doc.presentation.template];}
    function lockedInBranch(id){const n=result.nodes.find(p=>p.personId===id);return n&&(isLocked(id)||n.children.some(c=>lockedInBranch(c.personId)));}
    svg.addEventListener('pointerdown',e=>{
      if(gestures.active||e.button>0)return;
      const g=e.target.closest('[data-person-id]'),id=g?.dataset.personId;if(id)select(id);
      const mode=$('editMode').value;
      if(id&&mode==='branch'&&lockedInBranch(id)){bridge.toast('الفرع يتضمن موضعاً مقفلاً؛ فك القفل أولاً');return;}
      const editable=id&&mode!=='select'&&doc.presentation.activeRenderer!=='legacy'&&!isLocked(id),kind=editable?mode:'pan';
      const key=kind==='branch'?'branchOverrides':'nodeOverrides',t=doc.presentation.template;
      // Presentation entries may contain only rotation/scale; omitted offsets
      // mean zero, exactly as in the renderer, and must still allow dragging.
      const origin=editable?{x:0,y:0,...C.copy(doc.presentation[key][t]?.[id]||{})}:{x:view.x,y:view.y},pt=point(e);
      const started=gestures.start({pointerId:e.pointerId,pointerType:e.pointerType,clientX:e.clientX,clientY:e.clientY,svgX:pt.x,svgY:pt.y,scale:view.scale,mode:kind,personId:id,origin,before:snapshot()});
      if(!started.accepted)return;
      drag={id,key,t,origin,pointerId:e.pointerId,before:snapshot(),view:{...view},mode:kind,matrix:svg.getScreenCTM().inverse()};
      sidebar.inert=true;document.querySelector('header').inert=true;
      document.querySelector('.zoom-controls').inert=true;
      try{svg.setPointerCapture(e.pointerId);}catch{/* Synthetic test events do not create native capture. */}
    });
    svg.addEventListener('pointermove',e=>{
      if(!drag)return;const pt=new DOMPoint(e.clientX,e.clientY).matrixTransform(drag.matrix);
      const movement=gestures.move({pointerId:e.pointerId,clientX:e.clientX,clientY:e.clientY,svgX:pt.x,svgY:pt.y});if(!movement)return;
      if(movement.mode==='pan'){view.x=movement.x;view.y=movement.y;transform();}
      else{doc.presentation[drag.key][drag.t]||={};doc.presentation[drag.key][drag.t][drag.id]={...drag.origin,x:movement.x,y:movement.y};draw();}
    });
    function end(e){
      const ended=gestures.end({pointerId:e.pointerId,cancelled:e.type!=='pointerup'});if(!ended||!drag)return;
      const previous=drag;drag=null;
      sidebar.inert=false;document.querySelector('header').inert=false;
      document.querySelector('.zoom-controls').inert=false;
      if(ended.kind==='cancel'){doc=JSON.parse(previous.before);view=previous.view;draw();}
      else if(ended.kind==='commit'&&ended.mode!=='pan'){undo.push(previous.before);if(undo.length>30)undo.shift();redo=[];doc.revision=(doc.revision||0)+1;draw();persist();}
      else if(ended.kind==='tap'&&ended.personId){$('selPanel').classList.add('mobile-open');}
      try{if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);}catch{}
    }
    svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);svg.addEventListener('lostpointercapture',end);
    svg.addEventListener('keydown',e=>{if(e.key==='Enter'){const id=e.target.closest('[data-person-id]')?.dataset.personId;if(id){select(id);$('selPanel').classList.add('mobile-open');scope.familyTreeWorkspace?.focusCard();}}if(e.key==='Escape'){if(drag)end({pointerId:drag.pointerId,type:'pointercancel'});selection=null;highlight();updatePrintScopeHint();$('selPanel').classList.remove('mobile-open');$('selBody').style.display='none';scope.familyTreeWorkspace?.refresh();}});
    replace('zoomIn',()=>{view.scale=Math.min(100,view.scale*1.3);transform();});replace('zoomOut',()=>{view.scale=Math.max(.25,view.scale/1.3);transform();});replace('zoomReset',fit);
    let printState=null;
    window.addEventListener('beforeprint',()=>{printState={selection,transform:$('viewport')?.getAttribute('transform')};selection=null;highlight();$('viewport')?.removeAttribute('transform');});
    window.addEventListener('afterprint',()=>{if(!printState)return;selection=printState.selection;if(printState.transform)$('viewport')?.setAttribute('transform',printState.transform);highlight();printState=null;});
    document.querySelector('.hint').textContent='اضغط على اسم لتفقد بطاقته • اسحب الفراغ للتحريك • اختر وضع السحب لتعديل التصميم دون تغيير النسب';
    try{const adapter=persistenceAdapter(),saved=adapter?adapter.readInitial():localStorage.getItem('family-tree.botanical.v2');if(adapter&&saved!==null&&typeof saved!=='string')throw Error('مصدر الحفظ غير متزامن');if(saved)doc=C.normalize(JSON.parse(saved));}catch{adapterReadFailed=!!persistence;$('saveStatus').textContent='تعذر استعادة الحفظ؛ لم يحذف الملف السابق';}
    prepareRenderer(doc,true);
    if(doc.presentation.legacySettings)bridge.setSettings(doc.presentation.legacySettings);
    function invalidateChildrenBatch(){childrenBatchProposal=null;$('childrenBatchPreview').hidden=true;$('childrenBatchRows').replaceChildren();$('childrenBatchDuplicateLabel').hidden=true;$('childrenBatchAllowDuplicates').checked=false;$('saveChildrenBatch').disabled=true;}
    function openChildrenBatch(){
      if(gestures.active)return;
      if(!scope.TreeChildrenBatch)return bridge.toast('تعذر تحميل أداة إضافة الأبناء؛ أعد فتح الصفحة');
      const father=result.nodes.find(n=>n.personId===selection);if(!father)return bridge.toast('اختر الأب من الشجرة أولاً');
      childrenBatchFatherId=father.personId;invalidateChildrenBatch();$('childrenBatchNames').value='';$('childrenBatchStatus').textContent='اكتب الأسماء ثم اعرض المعاينة.';
      const chain=[];let n=father;while(n){chain.unshift(n.fullName);n=result.nodes.find(p=>p.personId===n.parentId);}
      $('childrenBatchFather').textContent='الأب المحدد: '+chain.join(' ← ');childrenBatchDialog.showModal();$('childrenBatchNames').focus();
    }
    $('childrenBatchNames').oninput=()=>{invalidateChildrenBatch();$('childrenBatchStatus').textContent='تغيرت الأسماء؛ اعرض المعاينة مجدداً قبل الإضافة.';};
    $('previewChildrenBatch').onclick=()=>{
      invalidateChildrenBatch();
      try{
        const p=scope.TreeChildrenBatch.preview(doc,childrenBatchFatherId,$('childrenBatchNames').value);childrenBatchProposal=p;
        $('childrenBatchFather').textContent='الأب المحدد: '+p.fatherPath.map(n=>n.fullName).join(' ← ');
        for(const row of p.rows){const li=document.createElement('li');li.textContent=row.fullName+(row.duplicateInBatch||row.duplicateExisting?' — اسم متكرر يحتاج مراجعتك':'');$('childrenBatchRows').append(li);}
        $('childrenBatchStatus').textContent=p.rows.length+' ابنًا تحت '+p.fatherName+(p.ignoredBlankLines?' · تجاهل '+p.ignoredBlankLines+' من الأسطر الفارغة':'')+(p.warnings.length?' · '+p.warnings.join(' · '):'');
        $('childrenBatchPreview').hidden=false;$('childrenBatchDuplicateLabel').hidden=!p.warnings.length;$('saveChildrenBatch').disabled=!!p.warnings.length;
      }catch(e){$('childrenBatchStatus').textContent=e.message;}
    };
    $('childrenBatchAllowDuplicates').onchange=()=>{$('saveChildrenBatch').disabled=!childrenBatchProposal||(childrenBatchProposal.warnings.length>0&&!$('childrenBatchAllowDuplicates').checked);};
    $('saveChildrenBatch').onclick=()=>{
      if(!childrenBatchDialog.open||!childrenBatchProposal)return;
      const proposal=childrenBatchProposal;let applied,failure='';$('saveChildrenBatch').disabled=true;
      const saved=commit(()=>{try{applied=scope.TreeChildrenBatch.apply(doc,proposal,{allowDuplicates:$('childrenBatchAllowDuplicates').checked});doc=applied.document;}catch(e){failure=e.message;throw e;}});
      if(!saved){invalidateChildrenBatch();$('childrenBatchStatus').textContent=failure||'لم تحفظ الدفعة؛ راجع الأسماء ثم أعد المعاينة.';return;}
      childrenBatchDialog.close();invalidateChildrenBatch();$('childrenBatchNames').value='';select(applied.fatherId);bridge.toast('أضيف '+applied.addedIds.length+' ابنًا؛ يمكنك التراجع عن الدفعة كاملة.');
    };
    $('closeChildrenBatch').onclick=$('cancelChildrenBatch').onclick=()=>childrenBatchDialog.close();
    childrenBatchDialog.addEventListener('close',()=>{invalidateChildrenBatch();const b=$('workspaceBatchChildren');if(b?.isConnected&&!b.closest('[hidden]'))b.focus();});
    scope.familyTreeKinship=scope.installKinshipPanel?.({document:()=>doc,selection:()=>selection,gestureActive:()=>gestures.active,showPerson(id){focusPerson(id);scope.familyTreeWorkspace?.focusCard();},toast:bridge.toast});
    function openKinship(){if(gestures.active)return;if(!scope.familyTreeKinship)return bridge.toast('تعذر تحميل أداة القرابة؛ أعد فتح الصفحة.');return scope.familyTreeKinship.open(selection);}
    scope.familyTreePoster=scope.installWholeTreePoster?.({document:()=>C.copy(doc),svg:exported,download,toast:bridge.toast,gestureActive:()=>gestures.active});
    function openWholePoster(){if(gestures.active)return;return scope.familyTreePoster?.open();}
    scope.familyTreeWorkspace=scope.installTreeWorkspace?.({people:()=>result?.nodes||[],selection:()=>selection,document:()=>doc,focusPerson,openChildrenBatch,openBranchPrint,openKinship,openWholePoster,openHeritagePoster:()=>scope.familyTreePoster?.open('heritage'),openReadingPrint:()=>openPrintBook(true),gestureActive:()=>gestures.active,toast:bridge.toast});
    $('treeTitle').value=doc.title;bridge.attach(draw);draw();
    // Read-only diagnostics; editing is through transactional UI actions.
    scope.familyTreeDiagnostics={snapshot:()=>C.copy(doc),audit:()=>C.audit(result)};
    scope.familyTreeSaveBoot?.attach({snapshot:()=>C.copy(doc),replace(next){C.validate(next);remember();load(next);}});
    scope.familyTreeBranchReview=scope.installBranchReview?.({document:()=>C.copy(doc)});
    scope.familyTreeBranchMerge=scope.installBranchMerge?.({document:()=>C.copy(doc),apply(next){return commit(()=>{doc=C.copy(next);selection=null;});}});
    scope.familyTreeBranchCompare=scope.installBranchCompare?.({document:()=>C.copy(doc),apply(next){return commit(()=>{doc=C.copy(next);selection=null;});}});
  };
})(globalThis);
