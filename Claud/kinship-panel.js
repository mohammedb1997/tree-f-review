/* Read-only paternal comparison. Family records never enter HTML markup. */
(function(scope){
  'use strict';
  scope.installKinshipPanel=function(api){
    const document=scope.document,C=scope.BotanicalCore,$=id=>document.getElementById(id);
    const dialog=document.createElement('dialog');dialog.id='kinshipDialog';dialog.dir='rtl';
    dialog.setAttribute('aria-labelledby','kinshipTitle');dialog.setAttribute('aria-describedby','kinshipNote');
    dialog.innerHTML='<div class="kinship-head"><h2 id="kinshipTitle">صلة القرابة الأبوية</h2><button type="button" class="btn" id="closeKinship">إغلاق</button></div><div class="kinship-body"><p id="kinshipNote" class="muted">الحساب حسب النسب الأبوي المسجّل في الشجرة فقط؛ لا يغيّر البيانات.</p><div class="kinship-anchor"><span>الشخص الأول</span><p id="kinshipFirst"></p></div><label for="kinshipQuery">ابحث عن الشخص الثاني بالاسم أو مسار النسب</label><input id="kinshipQuery" type="search" autocomplete="off" placeholder="اكتب الاسم ثم اختر الشخص" aria-controls="kinshipMatches"><p id="kinshipStatus" role="status" aria-live="polite"></p><div id="kinshipMatches" class="kinship-matches"></div><section id="kinshipResult" tabindex="-1" aria-labelledby="kinshipRelation" hidden><h3 id="kinshipRelation"></h3><p id="kinshipSecond"></p><p id="kinshipAncestor"></p><p id="kinshipDistances"></p><div class="kinship-paths"><div><h4>مسار الشخص الأول إلى الأصل المشترك</h4><ol id="kinshipFirstPath"></ol></div><div><h4>مسار الشخص الثاني إلى الأصل المشترك</h4><ol id="kinshipSecondPath"></ol></div></div><button type="button" class="btn" id="kinshipShowAncestor" disabled>إظهار الأصل المشترك في الشجرة</button></section></div>';
    document.body.append(dialog);
    let firstId=null,secondId=null,treeToken=null,opener=null,suppressReturn=false,epoch=0;
    const normalize=value=>String(value).normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').toLowerCase().trim();
    const token=doc=>typeof doc.treeId==='string'&&doc.treeId.trim()?doc.treeId:doc;
    function clearResult(){
      $('kinshipResult').hidden=true;$('kinshipShowAncestor').disabled=true;
      for(const id of ['kinshipRelation','kinshipSecond','kinshipAncestor','kinshipDistances','kinshipFirstPath','kinshipSecondPath'])$(id).replaceChildren();
    }
    function clearNamed(){
      epoch++;firstId=null;secondId=null;$('kinshipFirst').textContent='';$('kinshipQuery').value='';$('kinshipQuery').disabled=true;$('kinshipMatches').replaceChildren();clearResult();
    }
    function current(){
      if(!dialog.open||!firstId)return null;
      try{
        const doc=api.document();
        if(token(doc)!==treeToken){clearNamed();$('kinshipStatus').textContent='تغيّرت الشجرة؛ أغلق النافذة واختر الشخص الأول من جديد.';return null;}
        const nodes=C.visible(doc).nodes,byId=new Map(nodes.map(n=>[n.personId,n]));
        if(!byId.has(firstId)){clearNamed();$('kinshipStatus').textContent='الشخص الأول غير متاح في العرض الحالي؛ أغلق النافذة واختره من جديد.';return null;}
        return{doc,nodes,byId};
      }catch(_){clearNamed();$('kinshipStatus').textContent='تعذر التحقق من النسب؛ أغلق النافذة وراجع بيانات الشجرة.';return null;}
    }
    function ancestry(n,byId){const path=[];for(let p=n;p;p=byId.get(p.parentId))path.push(p.fullName);return path.reverse().join(' ← ');}
    function context(n,byId){return ancestry(n,byId)+' · الجيل '+(n.generation+1);}
    function labels(state){
      if(state.labels)return state.labels;
      const contexts=new Map(),counts=new Map();for(const n of state.nodes){const label=context(n,state.byId);contexts.set(n.personId,label);counts.set(label,(counts.get(label)||0)+1);}
      state.labels=new Map(state.nodes.map(n=>[n.personId,contexts.get(n.personId)+(counts.get(contexts.get(n.personId))>1?' · المعرّف '+n.personId:'')]));return state.labels;
    }
    function relation(r,byId){
      const first=byId.get(firstId).fullName,second=byId.get(secondId).fullName;
      if(r.kind==='same-person')return 'الشخص نفسه: '+first;
      if(r.kind==='parent')return r.firstUp===0?second+' ابن '+first+' من جهة الأب':second+' أب '+first;
      if(r.kind==='ancestor'){
        const up=Math.max(r.firstUp,r.secondUp);
        if(r.firstUp===0)return second+' من ذرية '+first+' بفارق '+up+' أجيال';
        return second+(up===2?' جد ':' سلف ')+first+' من جهة الأب بفارق '+up+' أجيال';
      }
      if(r.kind==='paternal-siblings')return first+' و'+second+' أخوان من جهة الأب';
      if(r.kind==='paternal-uncle')return r.firstUp===1?second+' ابن أخ '+first+' من جهة الأب':second+' عم '+first+' من جهة الأب';
      if(r.kind==='collateral-ancestor'){
        const senior=r.firstUp===1?first:second,junior=r.firstUp===1?second:first,path=r.firstUp===1?r.secondPath:r.firstPath;
        const sibling=byId.get(path[path.length-2]).fullName;
        return senior+' أخ '+sibling+' من جهة الأب؛ و'+junior+' من ذرية '+sibling+' بفارق '+(path.length-2)+' أجيال';
      }
      return r.firstUp===2&&r.secondUp===2?first+' و'+second+' ابنا عم من جهة الأب':'قرابة أبناء عمومة من جهة الأب بين '+first+' و'+second;
    }
    function renderResult(state){
      clearResult();
      if(!state.byId.has(secondId)){
        epoch++;secondId=null;$('kinshipQuery').value='';$('kinshipMatches').replaceChildren();$('kinshipStatus').textContent='الشخص الثاني غير متاح في العرض الحالي؛ ابحث واختر شخصًا آخر.';return null;
      }
      try{
        const r=C.kinship(state.doc,firstId,secondId);
        $('kinshipRelation').textContent=relation(r,state.byId);
        $('kinshipSecond').textContent='الشخص الثاني: '+labels(state).get(secondId);
        $('kinshipAncestor').textContent='أقرب أصل مشترك: '+state.byId.get(r.commonAncestorId).fullName;
        $('kinshipDistances').textContent='خطوات الأبوة صعودًا إلى الأصل المشترك: الأول '+r.firstUp+'، الثاني '+r.secondUp+' · فرق الأجيال '+r.generationGap;
        for(const [id,path]of [['kinshipFirstPath',r.firstPath],['kinshipSecondPath',r.secondPath]])for(const personId of path){
          const n=state.byId.get(personId),li=document.createElement('li');li.textContent=n.fullName+' · الجيل '+(n.generation+1);$(id).append(li);
        }
        $('kinshipResult').hidden=false;$('kinshipShowAncestor').disabled=false;
        $('kinshipStatus').textContent='تُعرض العلاقة حسب بيانات الأبوة المسجّلة فقط.';return r;
      }catch(_){clearNamed();$('kinshipStatus').textContent='تعذر التحقق من النسب؛ راجع بيانات الشجرة ثم افتح المقارنة من جديد.';return null;}
    }
    function choose(id,searchEpoch){
      if(api.gestureActive()||searchEpoch!==epoch)return;
      const state=current();if(!state)return;
      if(!state.byId.has(id)){secondId=null;clearResult();epoch++;$('kinshipQuery').value='';$('kinshipMatches').replaceChildren();$('kinshipStatus').textContent='هذه النتيجة لم تعد متاحة؛ ابحث واختر شخصًا آخر.';return;}
      secondId=id;epoch++;$('kinshipQuery').value=state.byId.get(id).fullName;$('kinshipMatches').replaceChildren();
      if(renderResult(state))$('kinshipResult').focus();
    }
    function search(state){
      epoch++;const searchEpoch=epoch,query=normalize($('kinshipQuery').value);$('kinshipMatches').replaceChildren();
      if(!query){$('kinshipStatus').textContent='اكتب الاسم ثم اختر الشخص الثاني من النتائج.';return;}
      const contexts=labels(state),matches=state.nodes.filter(n=>normalize(contexts.get(n.personId)).includes(query));
      for(const n of matches.slice(0,30)){
        const button=document.createElement('button');button.type='button';button.className='kinship-match';
        button.textContent=contexts.get(n.personId);button.onclick=()=>choose(n.personId,searchEpoch);$('kinshipMatches').append(button);
      }
      $('kinshipStatus').textContent=matches.length?'عدد النتائج '+matches.length+(matches.length>30?'؛ تظهر أول 30 نتيجة، أضف اسم الأب لتضييق البحث.':'؛ اختر الشخص المقصود.'):'لا توجد نتائج في الأشخاص المعروضين.';
    }
    function refresh(){
      const state=current();if(!state)return;
      $('kinshipFirst').textContent=labels(state).get(firstId);
      if(secondId){$('kinshipQuery').value=state.byId.get(secondId)?.fullName||'';renderResult(state);}else search(state);
    }
    function returnFocus(){
      const usable=node=>node?.isConnected&&!node.disabled&&!node.closest('[hidden]')&&node.style.display!=='none';
      const launcher=$('workspaceKinship'),target=usable(launcher)?launcher:usable(opener)?opener:$('treeSvg');target?.focus();
    }
    function cleanup(){clearNamed();treeToken=null;$('kinshipStatus').textContent='';if(!suppressReturn)returnFocus();suppressReturn=false;opener=null;}
    function close(){if(dialog.open)dialog.close();}
    function open(id=api.selection()){
      if(api.gestureActive()||dialog.open||document.querySelector('dialog[open]'))return false;
      try{
        const doc=api.document(),nodes=C.visible(doc).nodes,byId=new Map(nodes.map(n=>[n.personId,n]));
        if(!byId.has(id)){api.toast('اختر شخصًا معروضًا في الشجرة أولًا.');return false;}
        clearNamed();firstId=id;treeToken=token(doc);opener=document.activeElement;$('kinshipQuery').disabled=false;
        $('kinshipFirst').textContent=labels({nodes,byId}).get(id);$('kinshipStatus').textContent='اكتب الاسم ثم اختر الشخص الثاني من النتائج.';
        dialog.showModal();$('kinshipQuery').focus();return true;
      }catch(_){clearNamed();treeToken=null;api.toast('تعذر فتح المقارنة؛ راجع بيانات الشجرة أو أعد فتح الصفحة.');return false;}
    }
    $('kinshipQuery').oninput=()=>{if(api.gestureActive())return;const state=current();if(!state)return;secondId=null;clearResult();search(state);};
    $('kinshipQuery').onkeydown=e=>{
      if(e.isComposing||api.gestureActive()||!dialog.open)return;
      const button=$('kinshipMatches').querySelector('button');if(!button)return;
      if(e.key==='ArrowDown'){e.preventDefault();button.focus();}else if(e.key==='Enter'){e.preventDefault();button.click();}
    };
    $('kinshipShowAncestor').onclick=()=>{
      if(api.gestureActive()||!dialog.open||!secondId)return;
      const state=current();if(!state)return;const r=renderResult(state);if(!r)return;
      suppressReturn=true;close();api.showPerson(r.commonAncestorId);
    };
    $('closeKinship').onclick=close;dialog.addEventListener('close',cleanup);
    return{open,refresh,close};
  };
})(globalThis);
