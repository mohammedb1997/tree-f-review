/* Readable local detail pages. No genealogy mutations, network, or PDF service. */
(function(scope){
  'use strict';
  const C=typeof module!=='undefined'?require('./botanical-core.js'):scope.BotanicalCore;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const indexRecord=row=>`${row.name} — الأب: ${row.parent} · الجيل ${row.generation+1} · صفحة الأسرة ${row.page}`;
  function checkPaper(doc,paper){
    const expected=C.bookPaper(doc.presentation);
    if(!paper||paper.widthMm!==expected.widthMm||paper.heightMm!==expected.heightMm||paper.preset!==undefined&&paper.preset!==expected.preset){const error=Error('مقاس دفتر الأسر لا يطابق اختيار A4 أو A3؛ أعد تجهيز الدفتر');error.code='BOOK_PAPER_INVALID';throw error;}
  }
  function selectScope(doc,anchorPersonId=null){
    const visible=C.visible(doc);if(!visible.root)throw Error('لا يوجد جذر ضمن العرض الحالي');
    let root=visible.root,nodes=visible.nodes;
    if(anchorPersonId!==null){
      root=typeof anchorPersonId==='string'&&visible.nodes.find(n=>n.personId===anchorPersonId);
      if(!root){const error=Error('أصل الفرع يجب أن يكون شخصاً ضمن سلسلة الذكور المعروضة');error.code='PRINT_SCOPE_INVALID';throw error;}
      nodes=[];(function collect(node){nodes.push(node);node.children.forEach(collect);})(root);
    }
    const branch=anchorPersonId!==null;
    const scope={kind:branch?'branch':'whole',anchorPersonId:branch?root.personId:null,...(branch?{anchorName:root.fullName}:{}),rootGeneration:root.generation,people:nodes.length,totalVisible:visible.nodes.length,omittedPeople:visible.nodes.length-nodes.length,title:branch?'فرع '+root.fullName:doc.title};
    return {root,nodes,excluded:visible.excluded,scope};
  }
  function plan(doc,measure,options={anchorPersonId:null}){
    const visible=selectScope(doc,options.anchorPersonId??null);
    const p=C.presentation(doc.presentation),paper=C.bookPaper(p),margin=Math.min(10,paper.widthMm/20,paper.heightMm/20),header=14;
    const area={width:paper.widthMm-2*margin,height:paper.heightMm-2*margin-header};
    if(area.width<50||area.height<60)throw Error('مقاس الورق صغير؛ اختر A4 أو أكبر');
    const font=p.template==='heritage-simple'?22:18,target=Math.max(8,p.print.minLabelPt),unitsPerMm=font/target*72/25.4;
    const W=area.width*unitsPerMm,H=area.height*unitsPerMm,byId=new Map(visible.nodes.map(n=>[n.personId,n]));
    if(W-40<300)throw Error('عرض الورق لا يستوعب بطاقة مقروءة بهذا الخط؛ كبّر المقاس أو خفّض حجم الخط');
    const maxDepth=Math.max(...visible.nodes.map(n=>n.generation));
    const generations=[...new Set(visible.nodes.map(n=>n.generation))].sort((a,b)=>a-b);
    const legendLabels=generations.map(g=>'الجيل '+(g+1)),legendWidths=legendLabels.map(label=>(measure?measure(label):label.length*10)*font/18);
    const legendSlot=Math.max(160,Math.ceil(Math.max(...legendWidths))+60);
    if(legendSlot>W-70)throw Error('عرض الورق لا يستوعب دليل الأجيال؛ كبّر المقاس');
    const legendCols=Math.max(1,Math.floor((W-70)/legendSlot)),legendCenter=(legendSlot+20)/2,legendHeight=Math.ceil(generations.length/legendCols)*34+35;
    const contentHeight=H-legendHeight,pages=[],assigned=new Set(),pageByPerson={};
    const widthOf=n=>Math.max(126,(measure?measure(n.displayName||n.fullName):Array.from(n.displayName||n.fullName).length*10)*font/18+42);
    const xmlEsc=s=>esc(s).replace(/&#39;/g,'&apos;');
    let page={groups:[],personIds:[],contextPersonIds:[],number:1},x=20,y=20,rowHeight=0;
    const finish=()=>{if(page.groups.length){pages.push(page);page={groups:[],personIds:[],contextPersonIds:[],number:pages.length+1};x=20;y=20;rowHeight=0;}};
    const roots=visible.nodes.filter(n=>n.children.length);if(!roots.length)roots.push(visible.root);
    for(const father of roots){
      const familyWidth=Math.min(1050,W-40),parentWidth=widthOf(father),kids=father.children;
      if(parentWidth+80>familyWidth||kids.some(n=>widthOf(n)+80>familyWidth))throw Error('اسم أطول من مساحة الصفحة؛ استخدم الاسم القصير أو كبّر الورق');
      const rows=[];let row=[],used=0;
      for(const child of kids){const w=widthOf(child);if(row.length&&used+w+25>familyWidth-70){rows.push(row);row=[];used=0;}row.push(child);used+=w+25;}if(row.length)rows.push(row);
      const maxRows=Math.floor((contentHeight-150)/125);if(maxRows<1)throw Error('المقاس أو الحد الأدنى للخط لا يسمح بصفوف مقروءة');
      for(let start=0;start<Math.max(1,rows.length);start+=maxRows){
        const batch=rows.slice(start,start+maxRows),maxRowWidth=Math.max(0,...batch.map(r=>r.reduce((s,n)=>s+widthOf(n)+25,0)-25));
        const gw=Math.max(300,parentWidth+80,maxRowWidth+70),gh=150+Math.max(1,batch.length)*125;
        if(x+gw>W-20){x=20;y+=rowHeight+25;rowHeight=0;}if(y+gh>contentHeight){finish();}
        const parent={...father,x:gw/2,y:60,width:parentWidth,height:92,scale:1,rotation:0,fontSize:font,label:father.displayName||father.fullName};
        const nodes=[parent];batch.forEach((r,j)=>{let cx=(gw-r.reduce((s,n)=>s+widthOf(n)+25,0)+25)/2;for(const n of r){const w=widthOf(n);nodes.push({...n,x:cx+w/2,y:200+j*125,width:w,height:92,scale:1,rotation:0,fontSize:font,label:n.displayName||n.fullName});cx+=w+25;}});
        const primary=nodes.filter(n=>!assigned.has(n.personId)).map(n=>n.personId),context=nodes.filter(n=>assigned.has(n.personId)).map(n=>n.personId);
        let people=C.svgMarkup(doc,{root:parent,nodes,links:[],width:gw,height:gh,minX:0,minY:0,maxDepth}).match(/<g id="people">([\s\S]*?)<\/g><g id="overlays"/)[1];
        people=people.replace(/ tabindex="0" role="button"/g,'');
        let generationCount=0;
        people=people.replace(/<text x="0" y="29" text-anchor="middle" fill="([^"]+)" font-size="10">(\d+)<\/text>/g,(_,ink,generation)=>{generationCount++;return `<text class="print-generation" x="0" y="38" text-anchor="middle" fill="${ink}" font-size="${font}">${generation}</text>`;});
        if(generationCount!==nodes.length)throw Error('تعذر تجهيز أرقام الأجيال المقروءة لدفتر الأسر');
        for(const id of context)people=people.replace(`data-person-id="${xmlEsc(id)}"`,`data-context-person-id="${xmlEsc(id)}"`);
        const paths=nodes.slice(1).map(n=>{
          // One row forms a direct T. Only later rows need the side spine.
          const start=parent.y+parent.height/2,spine=start+20,end=n.y-n.height/2,bus=end-16;
          const route=batch.length>1?`M${parent.x},${start} L${parent.x},${spine} L22,${spine} L22,${bus} L${n.x},${bus} L${n.x},${end}`:`M${parent.x},${start} L${parent.x},${bus} L${n.x},${bus} L${n.x},${end}`;
          return `<path data-parent-id="${xmlEsc(father.personId)}" data-child-id="${xmlEsc(n.personId)}" d="${route}" fill="none" stroke="#725038" stroke-width="3"/>`;
        }).join('');
        const markup=`<g transform="translate(${x} ${y})"><rect x="0" y="0" width="${gw}" height="${gh}" rx="12" fill="#faf5e8" stroke="#c4b98c"/>${paths}${people}</g>`;
        page.groups.push({anchorPersonId:father.personId,parentPersonId:byId.has(father.parentId)?father.parentId:null,personIds:nodes.map(n=>n.personId),primaryIds:primary,contextIds:context,width:gw,height:gh,x,y,markup});
        page.personIds.push(...primary);page.contextPersonIds.push(...context);for(const id of primary){assigned.add(id);pageByPerson[id]=page.number;}
        x+=gw+25;rowHeight=Math.max(rowHeight,gh);
      }
    }
    finish();if(assigned.size!==visible.nodes.length)throw Error('صفحات الطباعة لا تغطي جميع المعروضين');
    const legend=legendLabels.map((label,i)=>`<g transform="translate(${35+(i%legendCols)*legendSlot} ${H-legendHeight+30+Math.floor(i/legendCols)*34})"><circle r="7" fill="${C.color(p,generations[i])}"/><text x="${legendCenter}" y="6" font-size="${font}" fill="#27382e" direction="rtl" text-anchor="middle">${label}</text></g>`).join('');
    for(const item of pages){item.labelPt=target;item.markup=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${area.width}mm" height="${area.height}mm" style="font-family:Tahoma,Arial,sans-serif"><rect width="${W}" height="${H}" fill="#faf5e8"/>${item.groups.map(g=>g.markup).join('')}${legend}</svg>`;}
    const collator=new Intl.Collator('ar'),index=visible.nodes.map(n=>({personId:n.personId,name:n.fullName,parent:byId.has(n.parentId)?byId.get(n.parentId).fullName:visible.scope.kind==='branch'?'أصل الفرع':'الأصل',generation:n.generation,page:pageByPerson[n.personId]}));
    index.sort((a,b)=>collator.compare(a.name,b.name)||collator.compare(a.parent,b.parent)||(a.personId<b.personId?-1:a.personId>b.personId?1:0));
    return {method:'father-children-detail-sheets',scope:visible.scope,pages,pageByPerson,people:visible.nodes.length,excluded:visible.excluded,paper:{...paper,minLabelPt:target,marginMm:margin},area,minLabelPt:target,minGenerationPt:target,index};
  }
  function html(doc,book){
    checkPaper(doc,book.paper);
    const paper=book.paper,scope=selectScope(doc,book.scope?.kind==='branch'?book.scope.anchorPersonId:null).scope;
    const scopeLine=scope.kind==='branch'?`نطاق الطباعة: فرع · أصل الفرع: ${esc(scope.anchorName)} · ${scope.people} شخصاً · يبدأ بالجيل الأصلي ${scope.rootGeneration+1}`:'';
    const pages=book.pages.map(page=>{
      const metadata=`صفحة ${page.number} من ${book.pages.length} · ${page.groups.length} مجموعة أب وأبنائه · ${page.personIds.length} اسماً جديداً · الخط المخطط ${page.labelPt.toFixed(1)} نقطة`;
      const branchHeader=scope.kind==='branch'?`<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(scope.title)}">${esc(scope.title)}</div><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${scope.people} شخصاً · الجيل الأصلي ${scope.rootGeneration+1} · ${metadata}</div>`:'';
      return `<section class="sheet" id="page-${page.number}"><header${branchHeader?' style="font-size:8pt;line-height:1.4"':''}>${branchHeader||metadata}</header>${page.markup}</section>`;
    }).join('');
    const index=book.index.map(n=>`<li><a href="#page-${n.page}">${esc(indexRecord(n))}</a></li>`).join('');
    const indexHeading=(scope.kind==='branch'?esc(scope.title)+' — ':'')+'فهرس الأشخاص والصفحات';
    const instructions=`<p>لحفظ PDF مطابق اختر وجهة <strong>Save as PDF</strong> المدمجة في المتصفح إن توفرت، ثم المقاس <strong>${paper.widthMm}×${paper.heightMm} مم</strong> ومقياس <strong>100%</strong>. ألغِ خيار <strong>Headers and footers — الرؤوس والتذييلات</strong> لإزالة التاريخ ومسار الملف. عند استعمال Microsoft Print to PDF طابق حجم الورق من خصائص الطابعة أيضاً؛ قد تخرج على Letter رغم اختيار A4 في الموقع.</p><p>إعداد الموقع لا يغيّر إعدادات نافذة الطباعة تلقائياً. تصغير الصفحة أو تغيير المقاس يلغي تقدير الخط؛ والخط يعتمد على الخطوط المثبتة بالجهاز.</p>`;
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(scope.title)} — صفحات تفصيلية</title><style>@page{size:${paper.widthMm}mm ${paper.heightMm}mm;margin:${paper.marginMm}mm}*{box-sizing:border-box}body{margin:0;background:#e9e6dc;color:#27382e;font-family:Tahoma,Arial,sans-serif}.guide,.index{padding:20px;max-width:1000px;margin:auto;background:#fffdf6}.guide p{line-height:1.8}.guide h1,.index h1{overflow-wrap:anywhere}.sheet{background:#faf5e8;margin:20px auto;padding:0;width:${book.area.width}mm;height:${paper.heightMm-2*paper.marginMm}mm;break-before:page;overflow:hidden}.sheet header{height:14mm;line-height:1.5;padding:2mm;font-size:11pt}.sheet svg{display:block;width:${book.area.width}mm;height:${book.area.height}mm}.index ul{list-style:none;padding:0;column-count:1;line-height:1.25;font-size:${Math.max(8,book.minLabelPt)}pt}.index li{padding:.5mm 1.5mm;margin-block:.25mm}.index li,.index a{overflow-wrap:anywhere}a{color:inherit}@media screen{.sheet{max-width:96vw;height:auto}.sheet header{height:auto;min-height:30px}.sheet svg{width:100%;height:auto;aspect-ratio:${book.area.width}/${book.area.height}}}@media print{body{background:#fff}.guide{display:none}.sheet{margin:0;break-inside:avoid}.sheet:first-of-type{break-before:auto}.index{break-before:page;max-width:none;padding:0}.index h1{font-size:18pt}.index ul{column-count:2;column-gap:8mm}.index li{break-inside:avoid}}</style></head><body><div class="guide"><h1>${esc(scope.title)} — دفتر الفروع</h1>${scopeLine?'<p>'+scopeLine+'</p>':''}<p>${book.people} شخصاً موزعون على ${book.pages.length} صفحة تفصيلية بمجموعات الأب وأبنائه. أصغر اسم ${book.minLabelPt.toFixed(1)} نقطة بالمقاس المحدد. أرقام الأجيال وألوانها من الشجرة الأصلية. الأب قد يتكرر كسياق لوصل مجموعتين؛ الفهرس يسرد كل شخص مرة واحدة. التخطيط التفصيلي مستقل عن اللوحة الفنية الأصلية ولا يغيرها.</p>${instructions}</div>${pages}<section class="index"><h1>${indexHeading}</h1><ul>${index}</ul></section></body></html>`;
  }
  const api={selectScope,indexRecord,plan,html};if(typeof module!=='undefined')module.exports=api;else scope.BotanicalPrint=api;
})(globalThis);
