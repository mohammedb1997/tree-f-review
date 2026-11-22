/* Local-only genealogy and presentation engine; also loadable by Node tests. */
(function (scope) {
  'use strict';
  const copy = x => JSON.parse(JSON.stringify(x));
  const palette = ['#b88b39','#215c47','#356e99','#843e4b','#71518c','#287e80','#8b592b','#657a32','#944f7d','#416886'];
  const defaults = () => ({template:'heritage-balanced',canopyShape:'oval',layoutSeed:20261025,layoutAlgorithmVersion:'botanical-v1',generationColorMode:'green-leaf-colored-label',generationPalette:Object.fromEntries(palette.map((c,i)=>[i,c])),nodeOverrides:{},branchOverrides:{},lockedElements:{},print:{widthMm:700,heightMm:1000,minLabelPt:8}});
  const uid = () => globalThis.crypto?.randomUUID?.() || 'person-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  function bookPaper(raw={}) {
    const preset=raw&&typeof raw==='object'&&!Array.isArray(raw)?(raw.bookPaper===undefined?'A4':raw.bookPaper):null;
    if(!['A4','A3'].includes(preset)){const error=Error('مقاس دفتر الأسر يجب أن يكون A4 أو A3');error.code='BOOK_PAPER_INVALID';throw error;}
    return {preset,widthMm:preset==='A4'?210:297,heightMm:preset==='A4'?297:420};
  }
  function presentation(raw={}) {
    if(!raw || typeof raw!=='object'||Array.isArray(raw))throw Error('إعدادات تصميم غير صالحة');
    const p={...defaults(),...copy(raw)};
    if(!['heritage-balanced','heritage-dense','heritage-simple'].includes(p.template))throw Error('قالب فني غير معروف');
    if(!['full-leaf','green-leaf-colored-label'].includes(p.generationColorMode))throw Error('نمط ألوان غير معروف');
    if(!['oval','circle'].includes(p.canopyShape))throw Error('شكل تاج غير معروف');
    if(!Number.isFinite(p.layoutSeed))throw Error('بذرة تخطيط غير صالحة');
    for(const key of ['generationPalette','nodeOverrides','branchOverrides','lockedElements'])if(!p[key]||typeof p[key]!=='object'||Array.isArray(p[key]))throw Error('إعداد تصميم غير صالح: '+key);
    if(Object.values(p.generationPalette).some(c=>!/^#[0-9a-f]{6}$/i.test(c)))throw Error('لون جيل غير صالح');
    p.print={...defaults().print,...p.print};
    for(const key of ['widthMm','heightMm','minLabelPt'])if(typeof p.print[key]!=='number'||!Number.isFinite(p.print[key])||p.print[key]<=0||p.print[key]>10000)throw Error('مقاس طباعة غير صالح');
    bookPaper(p); // Missing stays missing: legacy poster sizes are never migrated.
    for(const key of ['nodeOverrides','branchOverrides'])for(const bucket of Object.values(p[key])){
      if(!bucket||typeof bucket!=='object'||Array.isArray(bucket))throw Error('مواضع تصميم غير صالحة');
      for(const o of Object.values(bucket)){if(!o||typeof o!=='object')throw Error('إزاحة غير صالحة');for(const f of ['x','y','rotation','scale'])if(o[f]!==undefined&&(typeof o[f]!=='number'||!Number.isFinite(o[f])||Math.abs(o[f])>1e7))throw Error('إحداثية غير صالحة');}
    }
    for(const locked of Object.values(p.lockedElements)){
      if(typeof locked==='boolean')continue;
      if(!locked||typeof locked!=='object'||Array.isArray(locked))throw Error('قفل موضع غير صالح');
      for(const point of Object.values(locked))if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||Math.abs(point.x)>1e7||Math.abs(point.y)>1e7)throw Error('إحداثيات قفل غير صالحة');
    }
    return p;
  }
  function normalize(input) {
    if (!input || typeof input !== 'object') throw Error('ملف JSON غير صالح');
    if (input.schemaVersion === 2 && Array.isArray(input.persons)) {
      const d=copy(input); d.presentation=presentation(d.presentation); validate(d); return d;
    }
    const root=input.root || input.treeData || input;
    const persons=[],relationships=[],ids=new Set();
    function visit(n,parent,depth) {
      if(depth>250 || persons.length>=10000) throw Error('تجاوز حدود الملف: 10000 شخص / 250 جيلاً');
      if(!n || typeof n!=='object' || Array.isArray(n)) throw Error('سجل شخص غير صالح');
      const id=String(n.id ?? n.personId ?? uid());
      if(ids.has(id)) throw Error('معرّف شخص مكرر: '+id); ids.add(id);
      const {children,...fields}=copy(n);
      persons.push({...fields,personId:id,fullName:n.fullName ?? n.name,gender:n.gender || 'm',lifeStatus:n.lifeStatus || 'unknown'});
      if(parent) relationships.push({relationshipId:'father:'+id,type:'father',parentId:parent,childId:id,siblingOrder:persons.length});
      if(children!==undefined && !Array.isArray(children)) throw Error('الأبناء يجب أن يكونوا مصفوفة');
      (children||[]).forEach(c=>visit(c,id,depth+1)); return id;
    }
    const rootPersonId=visit(root,null,0);
    const doc={schemaVersion:2,treeId:input.treeId || uid(),rootPersonId,title:input.title || 'شجرة العائلة',persons,relationships,presentation:presentation(input.presentation),legacyEnvelope:input.root || input.treeData ? copy(input) : null};
    if(input.settings&&!input.presentation){doc.presentation.legacySettings=copy(input.settings);doc.presentation.activeRenderer='legacy';}
    validate(doc); return doc;
  }
  function validate(d) {
    presentation(d.presentation);
    if(!Array.isArray(d.persons)||!Array.isArray(d.relationships)||d.persons.length>10000) throw Error('بنية الأشخاص والعلاقات غير صالحة');
    const ids=new Set(),parents=new Map(),children=new Map();
    for(const p of d.persons){
      if(typeof p.personId!=='string' || !p.personId || ['__proto__','prototype','constructor'].includes(p.personId) || ids.has(p.personId)) throw Error('معرّف شخص مفقود أو مكرر'); ids.add(p.personId);
      if(typeof p.fullName!=='string'||!p.fullName.trim()||p.fullName.length>300) throw Error('اسم فارغ أو أطول من 300 حرف');
      if(p.displayName!==undefined&&(typeof p.displayName!=='string'||p.displayName.length>80))throw Error('الاسم القصير يجب أن يكون نصاً حتى 80 حرفاً');
      if(p.photo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p.photo)) throw Error('الصورة يجب أن تكون PNG/JPEG/WebP محلية');
    }
    if(!ids.has(d.rootPersonId)) throw Error('جذر مفقود');
    for(const r of d.relationships){
      if(r.type!=='father') continue;
      if(!ids.has(r.parentId)||!ids.has(r.childId)) throw Error('مرجع أب أو ابن مفقود');
      if(parents.has(r.childId)) throw Error('أكثر من أب للشخص نفسه');
      parents.set(r.childId,r.parentId); if(!children.has(r.parentId))children.set(r.parentId,[]); children.get(r.parentId).push(r);
    }
    const active=new Set(),done=new Set();
    function walk(id,depth){if(depth>250)throw Error('عمق أكبر من 250 جيلاً');if(active.has(id))throw Error('دورة في علاقات النسب');if(done.has(id))return;active.add(id);for(const r of children.get(id)||[])walk(r.childId,depth+1);active.delete(id);done.add(id);}
    for(const id of ids)walk(id,0);
    if(parents.has(d.rootPersonId))throw Error('الجذر المعروض له أب داخل هذه الشجرة');
    const connected=new Set();(function reach(id){connected.add(id);for(const r of children.get(id)||[])reach(r.childId);})(d.rootPersonId);
    if(connected.size!==ids.size)throw Error('أشخاص غير متصلين بالجذر');
    return {parents,children};
  }
  const male = p => ['m','male','ذكر'].includes(p.gender);
  function visible(d) {
    const {children}=validate(d),byId=new Map(d.persons.map(p=>[p.personId,p])),nodes=[];
    function walk(id,g,parentId){const p=byId.get(id);if(!male(p))return;const n={...p,generation:g,parentId,children:[]};nodes.push(n);n.children=(children.get(id)||[]).slice().sort((a,b)=>(a.siblingOrder||0)-(b.siblingOrder||0)).map(r=>walk(r.childId,g+1,id)).filter(Boolean);n.descendantCount=n.children.reduce((s,c)=>s+c.descendantCount+1,0);return n;}
    const root=walk(d.rootPersonId,0,null);return {root,nodes,excluded:d.persons.length-nodes.length};
  }
  // Structural paternal relation only: no names, maternal inference or degree of law.
  // visible() validates the document and bounds every path to the displayed tree.
  function kinship(d,firstPersonId,secondPersonId) {
    const {nodes}=visible(d),byId=new Map(nodes.map(n=>[n.personId,n]));
    if(!byId.has(firstPersonId)||!byId.has(secondPersonId)){
      const error=Error('Choose two people in the visible paternal tree.');error.code='KINSHIP_PERSON_NOT_VISIBLE';throw error;
    }
    const firstAncestors=[],firstPositions=new Map();
    for(let id=firstPersonId;id!==null;id=byId.get(id).parentId){firstPositions.set(id,firstAncestors.length);firstAncestors.push(id);}
    const secondPath=[];let commonAncestorId=secondPersonId;
    while(!firstPositions.has(commonAncestorId)){secondPath.push(commonAncestorId);commonAncestorId=byId.get(commonAncestorId).parentId;}
    secondPath.push(commonAncestorId);
    const firstPath=firstAncestors.slice(0,firstPositions.get(commonAncestorId)+1),firstUp=firstPath.length-1,secondUp=secondPath.length-1;
    let kind,orientation;
    if(!firstUp&&!secondUp){kind='same-person';orientation='same';}
    else if(!firstUp||!secondUp){kind=Math.max(firstUp,secondUp)===1?'parent':'ancestor';orientation=!firstUp?'first-is-ancestor':'second-is-ancestor';}
    else{
      const near=Math.min(firstUp,secondUp),far=Math.max(firstUp,secondUp);
      kind=near===1?(far===1?'paternal-siblings':far===2?'paternal-uncle':'collateral-ancestor'):'cousins';
      orientation=firstUp===secondUp?'same-generation':firstUp<secondUp?'first-is-senior':'second-is-senior';
    }
    const result={kind,firstPersonId,secondPersonId,commonAncestorId,firstPath,secondPath,firstUp,secondUp,generationGap:Math.abs(firstUp-secondUp),orientation};
    if(kind==='cousins')result.cousinDegree=Math.min(firstUp,secondUp)-1;
    return result;
  }
  function documentationSupported(raw) {
    return !!raw&&typeof raw==='object'&&!Array.isArray(raw)&&raw.version===1&&
      typeof raw.reference==='string'&&raw.reference.length<=2000&&
      ['pending','approved','review',''].includes(raw.status)&&
      (raw.status!==''||!raw.reference.trim());
  }
  function personDocumentation(person) {
    if(!person||!Object.prototype.hasOwnProperty.call(person,'treefDocumentation'))return {kind:'empty',reference:'',status:''};
    const raw=person.treefDocumentation;
    return documentationSupported(raw)?{kind:'supported',reference:raw.reference,status:raw.status}:{kind:'unsupported',reference:'',status:''};
  }
  function withPersonDocumentation(person,reference,status) {
    const fail=(code,message)=>{const error=Error(message);error.code=code;throw error;};
    if(!person||typeof person!=='object'||Array.isArray(person))fail('DOCUMENTATION_INVALID','سجل الشخص غير صالح');
    const current=personDocumentation(person);
    if(current.kind==='unsupported')fail('DOCUMENTATION_UNSUPPORTED','بيانات التوثيق المحفوظة غير مدعومة للتعديل');
    if(typeof reference!=='string'||reference.length>2000)fail('DOCUMENTATION_INVALID','مرجع المعلومة يجب أن يكون نصًا حتى 2000 حرف');
    if(!['pending','approved','review',''].includes(status))fail('DOCUMENTATION_INVALID','اختر حالة تحقق صالحة');
    if(status===''&&reference.trim())fail('DOCUMENTATION_INVALID','اختر حالة التحقق قبل حفظ المرجع');
    const next=copy(person),clear=status===''&&!reference.trim();
    const extra=current.kind==='supported'&&Object.keys(next.treefDocumentation).some(key=>!['version','reference','status'].includes(key));
    if(clear&&!extra)delete next.treefDocumentation;
    else next.treefDocumentation={...(next.treefDocumentation||{}),version:1,reference:clear?'':reference,status};
    return next;
  }
  function layout(d,measure = s => Array.from(s).length*10,view=visible(d)) {
    const {root,nodes,excluded}=view,p=d.presentation,t=p.template;
    if(!root)throw Error('الجذر ليس ضمن سلسلة الذكور المعروضة');
    const gap=t==='heritage-dense'?18:t==='heritage-simple'?66:38;
    let depth=0;
    for(const n of nodes){n.label=n.displayName || n.fullName;n.fontSize=t==='heritage-simple'?22:18;n.width=Math.max(126,measure(n.label)*n.fontSize/18+42);n.height=n.generation<2?78:64;depth=Math.max(depth,n.generation);}
    // Each subtree owns a weighted angular sector. Expand the canopy until all
    // unedited label boxes have clearance, without reducing the Arabic font.
    function weigh(n){n.weight=Math.max(n.width+gap,n.children.reduce((s,c)=>s+weigh(c),0));return n.weight;}weigh(root);
    const oval=p.canopyShape==='oval'?1.22:1;
    function sector(n,start,end){const a=(start+end)/2,r=depth?Math.pow(n.generation/depth,.9):0;n.ux=Math.cos(a)*r;n.uy=Math.sin(a)*r*oval;let cursor=start;const total=n.children.reduce((s,c)=>s+c.weight,0);for(const c of n.children){const next=cursor+(end-start)*c.weight/total;sector(c,cursor,next);cursor=next;}}
    sector(root,-Math.PI+.16,-.16);
    let radius=Math.max(340,depth*115);
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
      const a=nodes[i],b=nodes[j],dx=Math.abs(a.ux-b.ux),dy=Math.abs(a.uy-b.uy);
      radius=Math.max(radius,Math.min(dx>1e-9?((a.width+b.width)/2+gap)/dx:Infinity,dy>1e-9?((a.height+b.height)/2+gap)/dy:Infinity));
    }
    let left=Infinity,right=-Infinity,top=Infinity;
    for(const n of nodes){n.x=n.ux*radius;n.y=n.uy*radius;left=Math.min(left,n.x-n.width/2);right=Math.max(right,n.x+n.width/2);top=Math.min(top,n.y-n.height/2);}
    const width=Math.max(1000,right-left+180),height=Math.max(760,-top+330);
    for(const n of nodes){n.x+=-left+90+(width-(right-left+180))/2;n.y+=height-170;}
    // Keep all overrides in the presentation, keyed by template and stable ID.
    const overrides=p.nodeOverrides[t]||{},branches=p.branchOverrides[t]||{};
    function offsets(n,inherited){const branch=branches[n.personId]||{};const sum={x:inherited.x+(Number(branch.x)||0),y:inherited.y+(Number(branch.y)||0)};const o=overrides[n.personId]||{};n.x+=sum.x+(Number(o.x)||0);n.y+=sum.y+(Number(o.y)||0);const lock=p.lockedElements[n.personId]?.[t];if(lock){n.x=lock.x;n.y=lock.y;}n.rotation=Number(o.rotation)||0;n.scale=Math.max(.5,Math.min(2,Number(o.scale)||1));for(const c of n.children)offsets(c,sum);}offsets(root,{x:0,y:0});
    let minX=0,minY=0,maxX=width,maxY=height;for(const n of nodes){const r=Math.hypot(n.width*n.scale,n.height*n.scale)/2;minX=Math.min(minX,n.x-r-35);maxX=Math.max(maxX,n.x+r+35);minY=Math.min(minY,n.y-r-35);maxY=Math.max(maxY,n.y+r+35);}
    const links=nodes.filter(n=>n.parentId).map(n=>({child:n,parent:nodes.find(a=>a.personId===n.parentId)}));
    return {root,nodes,links,excluded,width:maxX-minX,height:maxY-minY,minX,minY,maxDepth:depth};
  }
  function bounds(n){const a=(n.rotation||0)*Math.PI/180,c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a)),w=n.width*n.scale,h=n.height*n.scale;return {x:n.x-(w*c+h*s)/2,y:n.y-(w*s+h*c)/2,w:w*c+h*s,h:w*s+h*c};}
  function audit(result){let overlaps=0;for(let i=0;i<result.nodes.length;i++){const a=bounds(result.nodes[i]);for(let j=i+1;j<result.nodes.length;j++){const b=bounds(result.nodes[j]);if(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y)overlaps++;}}return {people:result.nodes.length,excluded:result.excluded,overlaps,minFontPx:Math.min(...result.nodes.map(n=>n.fontSize)),width:result.width,height:result.height};}
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  function color(p,g){
    if(/^#[0-9a-f]{6}$/i.test(p.generationPalette[g]))return p.generationPalette[g];
    if(g<palette.length)return palette[g];
    const h=(g*137.508)%360,s=.55,l=.39,a=s*Math.min(l,1-l);
    return '#'+[0,8,4].map(n=>{const k=(n+h/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0');}).join('');
  }
  function branch(d,id){
    validate(d);const kept=new Set(),byParent=new Map();for(const r of d.relationships.filter(r=>r.type==='father')){if(!byParent.has(r.parentId))byParent.set(r.parentId,[]);byParent.get(r.parentId).push(r.childId);}
    if(!d.persons.some(p=>p.personId===id))throw Error('مرساة غير موجودة');
    (function walk(n){kept.add(n);for(const c of byParent.get(n)||[])walk(c);})(id);
    const out=copy(d);out.rootPersonId=id;out.legacyEnvelope=null;out.branchOrigin={treeId:d.treeId,anchorPersonId:id};out.persons=out.persons.filter(p=>kept.has(p.personId));out.relationships=out.relationships.filter(r=>kept.has(r.parentId)&&kept.has(r.childId));out.title='فرع '+out.persons.find(p=>p.personId===id).fullName;return out;
  }
  function svgMarkup(d,result=layout(d)){
    const p=d.presentation,{root,nodes,links,width,height,minX,minY}=result;
    const text=(s,x,y,size=18,fill='#302719')=>`<text x="${x}" y="${y}" text-anchor="middle" direction="rtl" style="font:${size}px Tahoma,Arial,sans-serif;unicode-bidi:plaintext" fill="${fill}">${escape(s)}</text>`;
    const legend=Array.from({length:result.maxDepth+1},(_,g)=>`<g transform="translate(${minX+45+(g%8)*145},${minY+height-55+Math.floor(g/8)*25})"><circle r="6" fill="${color(p,g)}"/>${text('الجيل '+(g+1),65,6,14)}</g>`).join('');
    const branches=links.map(({parent:a,child:b})=>{const bend=(a.y+b.y)/2;return `<path data-parent-id="${escape(a.personId)}" data-child-id="${escape(b.personId)}" d="M${a.x},${a.y} C${a.x},${bend} ${b.x},${bend} ${b.x},${b.y}" stroke-width="${Math.min(45,4+Math.sqrt(b.descendantCount+1)*3.5)}"/>`;}).join('');
    const people=nodes.map(n=>{
      const c=color(p,n.generation),w=n.width,h=n.height,full=p.generationColorMode==='full-leaf';
      const channels=c.slice(1).match(/../g).map(v=>{const s=parseInt(v,16)/255;return s<=.04045?s/12.92:Math.pow((s+.055)/1.055,2.4);});
      const ink=full&&(channels[0]*.2126+channels[1]*.7152+channels[2]*.0722)<.179?'#ffffff':'#211b10';
      const leaf=n.generation<2?`<ellipse rx="${w/2}" ry="${h/2}"/>`:`<path d="M${-w/2},0 Q0,${-h} ${w/2},0 Q0,${h} ${-w/2},0Z"/>`;
      return `<g class="nodegroup botanical-person" data-person-id="${escape(n.personId)}" tabindex="0" role="button" aria-label="${escape(n.fullName)}, الجيل ${n.generation+1}" transform="translate(${n.x} ${n.y}) rotate(${n.rotation}) scale(${n.scale})"><title>${escape(n.fullName)} — الجيل ${n.generation+1}</title><g fill="${full?c:'#dce8bf'}" stroke="${c}" stroke-width="3">${leaf}</g><rect x="${-w/2+13}" y="-19" width="${w-26}" height="38" rx="15" fill="${full?c:'#fff9e9'}" stroke="${c}" stroke-width="3"/>${text(n.label,0,6,n.fontSize,ink)}<text x="0" y="29" text-anchor="middle" fill="${ink}" font-size="10">${n.generation+1}</text></g>`;
    }).join('');
    let foliage='';if(p.template!=='heritage-simple')for(const n of nodes.filter(n=>!n.children.length)){foliage+=`<path transform="translate(${n.x-24} ${n.y-60}) rotate(${(n.personId.length*17+p.layoutSeed)%100-50})" d="M0,0 Q-26,-20 0,-42 Q26,-20 0,0" fill="#607c47" opacity=".75"/>`;}
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height+Math.ceil((result.maxDepth+1)/8)*25}" width="${p.print.widthMm}mm" height="${p.print.heightMm}mm" lang="ar" direction="rtl"><g id="background"><rect x="${minX}" y="${minY}" width="${width}" height="${height+80}" fill="#faf5e8"/></g><g id="ornaments"><rect x="${minX+16}" y="${minY+16}" width="${width-32}" height="${height-32}" rx="12" fill="none" stroke="#b88b39" stroke-width="4"/>${text(d.title || 'شجرة العائلة',width/2+minX,minY+67,32)}${text('جذور تجمعنا • حكاية تمتد عبر الأجيال',width/2+minX,minY+102,17,'#6e7459')}</g><g id="branches" fill="none" stroke="#65452d" stroke-linecap="round"><path d="M${root.x-55},${height-90} Q${root.x-24},${root.y+60} ${root.x},${root.y} Q${root.x+24},${root.y+60} ${root.x+55},${height-90}Z" fill="#65452d"/>${branches}</g><g id="decorative-foliage" pointer-events="none">${foliage}</g><g id="people">${people}</g><g id="overlays"/><g id="print-footer">${legend}</g></svg>`;
  }
  function legacy(d){const by=new Map(d.persons.map(p=>[p.personId,p]));const {children}=validate(d);function build(id){const {personId,fullName,...rest}=copy(by.get(id));return {...rest,id:personId,name:fullName,children:(children.get(id)||[]).map(r=>build(r.childId))};}return {...copy(d.legacyEnvelope||{}),title:d.title,root:build(d.rootPersonId),presentation:copy(d.presentation),treeId:d.treeId};}
  function fixture(count){const root={id:'test-0',name:'عبدالله التجريبي',gender:'m',children:[]},q=[root];for(let i=1;i<count;i++){const n={id:'test-'+i,name:['محمد','أحمد','عبدالرحمن','إبراهيم','سليمان','عبدالعزيز'][i%6]+' '+i,gender:'m',children:[]};q[Math.floor((i-1)/3)].children.push(n);q.push(n);}return normalize({title:'عائلة تجريبية • '+count,root});}
  function contribution(d,anchorPersonId){if(!d.persons.some(p=>p.personId===anchorPersonId))throw Error('مرساة غير موجودة');return {schemaVersion:1,kind:'branch-contribution',treeId:d.treeId,anchorPersonId,baseRevision:d.revision||0,persons:[],relationships:[],status:'draft'};}
  const api={copy,defaults,presentation,bookPaper,uid,normalize,validate,visible,kinship,personDocumentation,withPersonDocumentation,layout,audit,svgMarkup,legacy,fixture,contribution,color,branch};
  if(typeof module!=='undefined')module.exports=api;else scope.BotanicalCore=api;
})(globalThis);
