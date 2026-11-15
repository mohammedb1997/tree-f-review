(function(scope){
  'use strict';
  // Presentation-only shell. The editor remains the owner of genealogy and files.
  scope.installTreeWorkspace=function(api){
    const $=id=>document.getElementById(id),header=document.querySelector('header'),sidebar=$('sidebar');
    const make=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text)n.textContent=text;return n;};
    const button=(id,text,fn)=>{const n=make('button','btn',text);n.id=id;n.type='button';n.onclick=fn;return n;};
    const section=(title,open=false)=>{const n=make('details','workspace-section');n.open=open;n.append(make('summary','',title));return n;};
    let mode='view',activePanel=null,opener=null;
    document.body.classList.add('tree-workspace');document.body.dataset.workspaceMode=mode;

    const originalPanels=[...sidebar.children],personPanel=$('selPanel'),artPanel=sidebar.querySelector('.botanical-panel');
    const brand=document.querySelector('header .brand'),title=$('treeTitle'),files=document.querySelector('header .actions');
    const brandWrap=make('div','workspace-brand');brandWrap.append(brand,title);
    brand.querySelector('span').textContent='شجرة العائلة';
    title.readOnly=true;
    const modes=make('nav','workspace-modes');modes.setAttribute('aria-label','طريقة استخدام الشجرة');
    const viewButton=button('workspaceView','مشاهدة',()=>setMode('view'));
    const editButton=button('workspaceEdit','تعديل',()=>setMode('edit'));
    modes.append(viewButton,editButton);
    const actions=make('div','workspace-actions');
    const settingsButton=button('workspaceSettings','التصميم',()=>{setMode('edit');togglePanel('settings',settingsButton);});
    const filesButton=button('workspaceFiles','الملفات والطباعة',()=>togglePanel('files',filesButton));
    for(const b of [settingsButton,filesButton]){b.setAttribute('aria-controls','sidebar');b.setAttribute('aria-expanded','false');}
    const posterButton=button('workspacePoster','طباعة الشجرة كاملة',()=>api.openWholePoster?.());posterButton.classList.add('btn-gold');
    const readingButton=button('workspaceReading','نسخة قراءة A3',()=>api.openReadingPrint?.());
    const heritageButton=button('workspaceHeritagePoster','لوحة تراثية',()=>api.openHeritagePoster?.());
    actions.append(posterButton,heritageButton,readingButton,settingsButton,filesButton);

    const search=make('div','workspace-search'),searchField=$('artSearch'),results=$('searchResults');
    const searchLabel=document.querySelector('label[for="artSearch"]');searchLabel.classList.add('visually-hidden');
    searchField.type='search';searchField.autocomplete='off';searchField.placeholder='ابحث عن اسم أو اسم الأب…';
    searchField.setAttribute('aria-controls','searchResults');searchField.setAttribute('aria-expanded','false');
    results.setAttribute('aria-label','نتائج البحث');results.hidden=true;
    const clearSearch=button('workspaceClearSearch','×',()=>{searchField.value='';searchField.dispatchEvent(new Event('input'));searchField.focus();});
    clearSearch.setAttribute('aria-label','مسح البحث');clearSearch.hidden=true;
    const searchStatus=make('p','workspace-search-status');searchStatus.id='workspaceSearchStatus';searchStatus.setAttribute('role','status');
    const searchPopup=make('div','workspace-search-popup');searchPopup.id='workspaceSearchPopup';searchPopup.hidden=true;searchPopup.append(searchStatus,results);
    search.append(searchLabel,searchField,clearSearch,searchPopup);
    header.replaceChildren(brandWrap,search,modes,actions);

    const drawerHead=make('div','workspace-drawer-head'),drawerTitle=make('h2');drawerTitle.id='workspaceDrawerTitle';
    const close=button('workspaceClosePanel','إغلاق',closePanel);drawerHead.append(drawerTitle,close);
    sidebar.prepend(drawerHead);sidebar.hidden=true;sidebar.classList.add('workspace-drawer');
    sidebar.setAttribute('aria-labelledby','workspaceDrawerTitle');
    const settingsPanel=make('div','workspace-drawer-body');settingsPanel.id='workspaceSettingsPanel';
    const filesPanel=make('div','workspace-drawer-body');filesPanel.id='workspaceFilesPanel';
    sidebar.append(settingsPanel,filesPanel);filesPanel.append(files);
    const personClose=personPanel.querySelector('.close-person');personClose.hidden=true;
    personPanel.querySelector('h3').textContent='بطاقة الشخص';

    const controls=document.querySelector('.zoom-controls');controls.setAttribute('aria-label','التنقل في الشجرة');
    const undoRow=$('undoArt').parentElement;undoRow.classList.add('workspace-edit-only','workspace-history');
    const editLabel=document.querySelector('label[for="editMode"]');editLabel.classList.add('visually-hidden');
    const motion=make('div','workspace-motion workspace-edit-only');motion.append(editLabel,$('editMode'));
    controls.append(undoRow,motion);
    for(const [id,name]of [['zoomIn','تكبير الشجرة'],['zoomOut','تصغير الشجرة'],['zoomReset','إظهار الشجرة كاملة']])$(id).setAttribute('aria-label',name);
    $('zoomReset').textContent='احتواء';
    $('treeSvg').setAttribute('tabindex','0');$('treeSvg').setAttribute('aria-label','شجرة العائلة؛ اختر اسماً لفتح بطاقته');

    const status=make('div','workspace-status'),counts=make('span');counts.id='workspaceCounts';
    const template=make('span','workspace-template');template.id='workspaceTemplate';
    const saveStatus=$('saveStatus');if(!saveStatus.textContent)saveStatus.textContent='يعمل محليًا • نزّل نسخة للاحتفاظ بها';
    status.append(counts,template,saveStatus);$('canvasWrap').append(status);
    const guide=document.querySelector('.hint');guide.textContent='اختر اسمًا لتفقد بطاقته • اسحب المساحة للتنقل';

    // Move original controls, preserving IDs, state, event handlers and legacy templates.
    for(const el of [...artPanel.querySelectorAll('.eyebrow,h2,.local-pill')])el.remove();
    const intro=[...artPanel.children].find(n=>n.classList.contains('muted'));intro?.remove();
    const testLabel=document.querySelector('label[for="fixtureSize"]'),testRow=$('fixtureSize').parentElement;
    const thirty=make('option','','30');thirty.value='30';$('fixtureSize').append(thirty);
    const examples=section('أمثلة وبيانات اختبار');examples.append(make('p','muted','تحميل المثال يستبدل الشجرة بعد التأكيد، ويمكن التراجع.'),testLabel,testRow,$('btnSample'));
    const printSettings=$('printWidth').closest('.grid2').parentElement;
    const readableSettings=$('printMinimum').parentElement;
    const posterPrinting=section('مقاس لوحة الشجرة الكاملة',true);posterPrinting.append(printSettings);
    const printing=section('دفتر الأسر — صفحات تفصيلية (اختياري)');printing.append(readableSettings);
    const renderer=$('rendererControls');if(renderer)settingsPanel.append(renderer);
    const art=section('ألوان الأجيال وإعدادات المحرك الفني',true);art.append(artPanel);
    const legacy=section('قوالب المحرك السابق — الأساسي',true);
    for(const p of originalPanels){if(p===personPanel||p===artPanel)continue;if(p.contains($('rootNameInput'))){const root=section('اسم الجذر');root.append(p);settingsPanel.append(root);}else legacy.append(p);}
    settingsPanel.append(legacy,art,examples);
    $('btnSidebar').hidden=true;
    for(const b of files.querySelectorAll('.btn'))b.classList.remove('btn-outline-light');
    $('btnExportJson').textContent='تنزيل نسخة احتياطية JSON';$('btnExportPng').textContent='حفظ صورة PNG';$('btnExportSvg').textContent='حفظ لوحة SVG';
    const importLabel=files.querySelector('label[for="fileInput"]');importLabel.textContent='فتح ملف شجرة JSON';importLabel.setAttribute('role','button');importLabel.tabIndex=0;
    importLabel.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('fileInput').click();}};
    const data=section('النسخ الاحتياطية والصور',true);data.append(make('p','muted','ملف JSON نسخة خاصة كاملة تشمل البيانات والصور. SVG وPNG للعرض؛ احتفظ بنسخة JSON قبل الاستيراد.'),files);
    filesPanel.append(data,posterPrinting,printing);

    const body=$('selBody'),oldChildren=[...body.childNodes],overview=make('div','workspace-person-overview'),editor=make('div','workspace-person-editor workspace-edit-only');
    body.append(editor);for(const child of oldChildren)editor.append(child);
    overview.append($('personPhoto'),$('selName'),$('personGeneration'));
    const facts=make('p','workspace-person-facts');facts.id='workspacePersonFacts';
    const notes=make('p','workspace-person-notes');notes.id='workspacePersonNotes';
    const documentation=make('p','workspace-person-documentation');documentation.id='workspacePersonDocumentation';documentation.hidden=true;overview.append(facts,notes,documentation);
    const personActions=make('div','workspace-person-actions');
    const locate=button('workspaceLocatePerson','إظهار في الشجرة',()=>{const id=api.selection();if(id)api.focusPerson(id);});
    const parent=button('workspaceParent','انتقل إلى الأب',()=>{const n=api.people().find(p=>p.personId===api.selection());if(n?.parentId)api.focusPerson(n.parentId);});
    const editPerson=button('workspaceEditPerson','تعديل البيانات',()=>{setMode('edit');$('editName').focus();});
    const quickAdd=button('workspaceAddChild','+ إضافة ابن',()=>{setMode('edit');$('newChildName').focus();});quickAdd.classList.add('btn-gold');
    const batchAdd=button('workspaceBatchChildren','إضافة أبناء دفعة واحدة',()=>{setMode('edit');api.openChildrenBatch?.();});
    const printBranch=button('workspacePrintBranch','طباعة هذا الفرع',()=>{if(!api.gestureActive())api.openBranchPrint?.();});
    const kinship=button('workspaceKinship','صلة القرابة',()=>{if(!api.gestureActive())api.openKinship?.();});
    personActions.append(locate,parent,kinship,printBranch,editPerson,quickAdd,batchAdd);body.append(overview,personActions,editor);
    $('editGender').previousElementSibling.hidden=true;$('editGender').hidden=true;$('newChildGender').hidden=true;
    $('editName').setAttribute('aria-label','الاسم الكامل');$('newChildName').setAttribute('aria-label','اسم الابن الجديد');
    $('newChildName').placeholder='اكتب اسم الابن ثم اضغط Enter';
    $('newChildName').onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();$('btnAddChild').click();}};
    $('btnAddChild').textContent='إضافة الابن';
    const father=make('p','workspace-father-context');father.id='workspaceFatherContext';$('newChildName').parentElement.before(father);
    const personDesign=section('موضع الورقة وتصدير الفرع');personDesign.classList.add('workspace-edit-only');
    personDesign.append($('nodeRotation').closest('.grid2'),$('lockNode').parentElement,$('branchContract'),$('btnExportBranchSvg'));editor.append(personDesign);
    // Both original save actions remain; clarify their identical full-card behavior.
    $('btnSaveName').textContent='حفظ';$('saveDetails').textContent='حفظ بيانات البطاقة';
    const dangerous=section('حذف الشخص وفرعه');dangerous.classList.add('workspace-edit-only');dangerous.append($('btnDeleteNode'));editor.append(dangerous);

    function setMode(next){
      if(api.gestureActive())return;
      mode=next;document.body.dataset.workspaceMode=mode;title.readOnly=mode==='view';
      viewButton.setAttribute('aria-pressed',String(mode==='view'));editButton.setAttribute('aria-pressed',String(mode==='edit'));
      if(mode==='view'){$('editMode').value='select';if(activePanel==='settings')closePanel();}
      guide.textContent=mode==='view'?'اختر اسمًا لتفقد بطاقته • اسحب المساحة للتنقل':'اختر شخصًا لإضافة ابن أو تعديل بياناته • حركة التصميم من الأدوات السفلية';
    }
    function showPanel(kind,source){
      if(api.gestureActive())return;
      if(activePanel!==kind){
        const candidate=source||document.activeElement;
        if(search.contains(candidate))opener=searchField;
        else if(!sidebar.contains(candidate))opener=candidate===document.body?$('treeSvg'):candidate;
      }
      activePanel=kind;sidebar.hidden=false;
      personPanel.hidden=kind!=='person';settingsPanel.hidden=kind!=='settings';filesPanel.hidden=kind!=='files';
      drawerTitle.textContent={person:'أفراد العائلة',settings:'تصميم الشجرة',files:'الملفات والطباعة'}[kind];
      settingsButton.setAttribute('aria-expanded',String(kind==='settings'));filesButton.setAttribute('aria-expanded',String(kind==='files'));
      if(kind!=='person')close.focus();
    }
    function togglePanel(kind,source){if(activePanel===kind)closePanel();else showPanel(kind,source);}
    function closePanel(){
      if(api.gestureActive())return;
      sidebar.hidden=true;activePanel=null;personPanel.classList.remove('mobile-open');
      settingsButton.setAttribute('aria-expanded','false');filesButton.setAttribute('aria-expanded','false');
      if(opener?.isConnected&&!sidebar.contains(opener)&&!opener.closest('[hidden]'))opener.focus();else $('treeSvg').focus();
    }
    function closeSearch(){searchPopup.hidden=true;results.hidden=true;searchField.setAttribute('aria-expanded','false');}
    function searchUpdated(count,hasQuery){
      clearSearch.hidden=!hasQuery;searchPopup.hidden=!hasQuery;results.hidden=!hasQuery;
      searchField.setAttribute('aria-expanded',String(hasQuery));
      searchStatus.textContent=!count?'لم نجد اسمًا مطابقًا. جرّب اسم الأب أو جزءًا من الاسم.':count>30?`${count} نتيجة • تظهر أول 30؛ اكتب اسم الأب لتحديد البحث`:`${count} نتيجة • اختر اسمًا لعرض بطاقته`;
    }
    searchField.onkeydown=e=>{
      if(e.key==='Escape'){closeSearch();e.stopPropagation();}
      if(e.key==='ArrowDown'){const first=results.querySelector('button');if(first){e.preventDefault();first.focus();}}
      if(e.key==='Enter'){const first=results.querySelector('button');if(first){e.preventDefault();first.click();}}
    };
    searchField.onfocus=()=>{if(searchField.value.trim()){searchPopup.hidden=false;results.hidden=false;searchField.setAttribute('aria-expanded','true');}};
    document.addEventListener('click',e=>{if(!search.contains(e.target))closeSearch();});
    document.addEventListener('keydown',e=>{
      if(api.gestureActive()||document.querySelector('dialog[open]'))return;
      if(e.key==='Escape'&&activePanel){closePanel();e.preventDefault();}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();searchField.focus();}
    });
    function refresh(){
      const people=api.people(),selected=people.find(p=>p.personId===api.selection());
      counts.textContent=`${people.length} رجل · ${Math.max(0,...people.map(p=>p.generation))+1} أجيال`;
      template.textContent=api.document().presentation.activeRenderer==='legacy'?'المحرك السابق — الأساسي':('الفني الاختياري · '+($('artTemplate').selectedOptions?.[0]?.textContent||'شجرة العائلة'));
      if(!selected){
        documentation.textContent='';documentation.hidden=true;documentation.removeAttribute('data-verification');
        $('personReference').value='';$('personVerification').value='';$('personReference').disabled=true;$('personVerification').disabled=true;$('personDocumentationHint').textContent='';
        if(activePanel==='person')closePanel();return;
      }
      const fatherName=people.find(p=>p.personId===selected.parentId)?.fullName;
      facts.textContent=(fatherName?'ابن '+fatherName+' · ':'')+({living:'حي',deceased:'متوفى',unknown:'حالة الحياة غير مسجلة'}[selected.lifeStatus]||'حالة الحياة غير مسجلة');
      notes.textContent=selected.notes||'';notes.hidden=!selected.notes;parent.disabled=!selected.parentId;
      const evidence=scope.BotanicalCore?.personDocumentation(selected);
      documentation.textContent='';documentation.hidden=true;documentation.removeAttribute('data-verification');
      if(evidence?.kind==='unsupported'){documentation.textContent='يوجد توثيق بتنسيق غير مدعوم؛ يبقى محفوظًا في النسخة الخاصة.';documentation.hidden=false;}
      else if(evidence&&(evidence.reference.trim()||evidence.status)){
        documentation.textContent='حالة المعلومة (محلية): '+({pending:'بانتظار التحقق',approved:'معتمد',review:'يحتاج مراجعة'}[evidence.status]||'غير مسجل')+'\nالمرجع: '+(evidence.reference.trim()?evidence.reference:'غير مسجل');
        documentation.dataset.verification=evidence.status;documentation.hidden=false;
      }
      father.textContent='الأب المحدد: '+selected.fullName;
    }
    function selected(){refresh();showPanel('person');}
    function focusCard(){if(!api.gestureActive()&&activePanel==='person')close.focus();}
    function searchSelected(){opener=searchField;closeSearch();focusCard();}
    setMode('view');
    return {refresh,selected,searchUpdated,closeSearch,searchSelected,focusCard};
  };
})(globalThis);
