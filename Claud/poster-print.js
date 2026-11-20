/* A frozen, complete tree poster. No genealogy or storage writes. */
(function(scope){'use strict';
  scope.installWholeTreePoster=function({document:readDocument,svg:readSvg,download,toast,gestureActive}){
    const D=scope.document,NS='http://www.w3.org/2000/svg',C=scope.BotanicalCore;
    const el=(tag,text)=>{const e=D.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
    const button=(id,text,fn)=>{const b=el('button',text);b.id=id;b.type='button';b.className='btn';b.onclick=fn;return b;};
    const dialog=el('dialog');dialog.id='posterDialog';dialog.dir='rtl';dialog.style.cssText='width:min(1100px,96vw);max-height:94vh;overflow:auto;background:#fffdf6;color:#203c2b;padding:16px;border-radius:12px';
    const status=el('p');status.id='posterStatus';status.setAttribute('role','status');
    const printNameTargetPt=9;
    let suggestedSize;
    const applySuggestedSize=button('posterSuggestedSize','',()=>{
      if(!suggestedSize)return;
      width.value=suggestedSize.width;
      height.value=suggestedSize.height;
      printSettings.open=true;
      build();
      applySize.focus();
    });
    applySuggestedSize.hidden=true;
    const stylePicker=el('fieldset');
    stylePicker.id='posterHeritageStyle';
    stylePicker.append(el('legend','قالب اللوحة'));
    const styleCards=el('div');styleCards.className='poster-style-cards';stylePicker.append(styleCards);
    const styleInputs=new Map();
    for(const [value,title] of [['organic-improved','التاج العضوي المحسّن'],['organic','التاج العضوي الأصلي'],['growing','التوزيع المتّسع']]){
      const card=el('label'),input=el('input'),preview=el('span'),image=el('img');
      input.type='radio';input.name='poster-heritage-style';input.value=value;
      preview.className='poster-style-card';
      image.src='poster-thumbnails/'+value+'.png';image.alt='';image.width=150;image.height=212;
      preview.append(image,el('span',title));card.append(input,preview);styleCards.append(card);
      styleInputs.set(value,input);
    }
    let preferredHeritageStyle;
    const selectedStyle=()=>stylePicker.querySelector('input:checked')?.value || 'growing';
    const width=el('input'),height=el('input');for(const [e,id,name]of[[width,'posterWidth','عرض اللوحة بالملّيمتر'],[height,'posterHeight','ارتفاع اللوحة بالملّيمتر']]){e.id=id;e.type='number';e.min='100';e.max='5000';e.setAttribute('aria-label',name);}
    const frame=el('iframe');frame.id='posterFrame';frame.title='معاينة صورة الشجرة كاملة في صفحة واحدة';frame.setAttribute('sandbox','allow-same-origin allow-modals');frame.style.cssText='display:block;width:100%;height:65vh;background:#ddd;border:1px solid #bca';
    const reviewFrame=el('iframe');reviewFrame.id='heritageReviewFrame';reviewFrame.title='معاينة تفاعلية للوحة الأنساب';reviewFrame.setAttribute('sandbox','allow-scripts');reviewFrame.style.cssText='width:100%;height:70vh;border:1px solid #a89260;border-radius:8px';reviewFrame.hidden=true;
    let captured=null,job=null,ticket=0,ready=false,busy=false,dirty=true,renderTicket=0,openTicket=0;
    const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const node=(tag,attrs={},text)=>{const e=D.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e;};
    function printHtml(title,w,h,markup){
      return `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>${escape(title)}</title><style>@page{size:${w}mm ${h}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;width:${w}mm;height:${h}mm;overflow:hidden;background:#faf5e8}body>svg{display:block;width:100%;height:100%}</style><body>${markup}</body></html>`;
    }
    function compose(source,w,h){
      if(![w,h].every(n=>Number.isFinite(n)&&n>=100&&n<=5000))throw Error('اختر عرضًا وارتفاعًا بين100و5000ملّيمتر');
      if(source.mode==='heritage'){
        const ctx=D.createElement('canvas').getContext('2d');
        const measure=(name,font)=>{ctx.font=font+'px Tahoma,Arial,sans-serif';return ctx.measureText(name).width;};
        const art=scope.HeritagePoster.render(source.doc,w,h,measure,selectedStyle());
        return {...art,html:printHtml(source.doc.title,w,h,art.svg)};
      }
      const parsed=new DOMParser().parseFromString(source.svg,'image/svg+xml');if(parsed.querySelector('parsererror'))throw Error('رسم الشجرة غير صالح');
      const base=parsed.documentElement;base.setAttribute('text-rendering','geometricPrecision');if(base.localName!=='svg')throw Error('الرسم يحتاجSVG');
      base.querySelectorAll('script,foreignObject,metadata,.plusbtn').forEach(n=>n.remove());base.querySelector('#viewport')?.removeAttribute('transform');
      for(const e of [base,...base.querySelectorAll('*')]){
        for(const a of [...e.attributes]){
          if(/^on/i.test(a.name)||['tabindex','role','aria-label'].includes(a.name))e.removeAttribute(a.name);
          else if(/(?:href|src)$/i.test(a.localName)&&!/^#/.test(a.value)&&!/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(a.value))throw Error('الرسم يحتوي موردًا غير محلي');
          else if(/(?:https?:|file:|@import|url\(\s*[^#])/i.test(a.value)&&!a.name.startsWith('xmlns'))throw Error('الرسم يحتوي موردًا خارجيًا');
        }
        e.classList.remove('selected-person','ancestor-person');
        if(source.doc.presentation.activeRenderer==='legacy'&&e.matches('[data-child-id]'))e.setAttribute('stroke','#65452d');
      }
      if([...base.querySelectorAll('style')].some(e=>/@import|https?:|file:|url\(\s*[^#]/i.test(e.textContent)))throw Error('تنسيق الرسم غير محلي');
      const actual=[...base.querySelectorAll('[data-person-id]')].map(e=>e.dataset.personId),visible=C.visible(source.doc).nodes,expected=new Set(visible.map(p=>p.personId));
      if(actual.length!==expected.size||new Set(actual).size!==actual.length||actual.some(id=>!expected.has(id)))throw Error('الرسم لا يضم جميع الأسماء المعروضة مرة واحدة');
      // Render full names in the detached poster only; screen legacy labels remain unchanged.
      const measure=D.createElement('canvas').getContext('2d'),stage=D.createElement('div');
      stage.style.cssText='position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none';
      const savedStyle=base.getAttribute('style'),measurementBox=base.getAttribute('viewBox').trim().split(/[ ,]+/).map(Number);base.style.width=measurementBox[2]+'px';base.style.height=measurementBox[3]+'px';stage.append(base);D.body.append(stage);
      try{
        for(const person of visible){
          const group=[...base.querySelectorAll('[data-person-id]')].find(g=>g.dataset.personId===person.personId);
          const text=[...group.children].find(e=>e.localName==='text');if(!text)throw Error('اسم مرئي مفقود');
          const shape=source.doc.presentation.activeRenderer==='legacy'?group.querySelector('.nodeshape'):group.querySelector('rect');
          if(!shape)throw Error('حدود ورقة الاسم مفقودة');
          const b=shape.getBBox(),legacy=source.doc.presentation.activeRenderer==='legacy',uw=legacy?b.width*.65:b.width-8,uh=legacy?b.height*.65:b.height-8,cx=b.x+b.width/2,cy=b.y+b.height/2;
          let size=parseFloat(text.getAttribute('font-size'))||14,lines=[];
          const words=person.fullName.trim().split(/\s+/);
          for(let attempt=0;attempt<70;attempt++){
            measure.font=(legacy?'700 ':'400 ')+size+'px Tahoma,Arial,sans-serif';lines=[];let line='';
            for(const word of words){const candidate=line?line+' '+word:word;if(line&&measure.measureText(candidate).width>uw){lines.push(line);line=word;}else line=candidate;}if(line)lines.push(line);
            if(lines.every(line=>measure.measureText(line).width<=uw)&&lines.length*size*1.2<=uh)break;size*=.9;
          }
          text.replaceChildren();text.setAttribute('x',cx);text.removeAttribute('y');text.setAttribute('direction','rtl');text.setAttribute('text-anchor','middle');text.setAttribute('font-size',size);text.setAttribute('data-poster-name','true');
          text.style.cssText='font-family:Tahoma,Arial,sans-serif;font-weight:'+(legacy?'700':'400')+';font-size:'+size+'px;unicode-bidi:plaintext';
          lines.forEach((line,i)=>text.append(node('tspan',{x:cx,y:cy+(i-(lines.length-1)/2)*size*1.2+size*.32},line+(i<lines.length-1?' ':''))));
          let bounds=text.getBBox();for(let attempt=0;attempt<40&&(bounds.width>uw||bounds.height>uh);attempt++){size*=.9;text.style.fontSize=size+'px';text.setAttribute('font-size',size);[...text.children].forEach((line,i)=>line.setAttribute('y',cy+(i-(lines.length-1)/2)*size*1.2+size*.32));bounds=text.getBBox();}const correction=cy-(bounds.y+bounds.height/2);for(const line of text.children)line.setAttribute('y',Number(line.getAttribute('y'))+correction);
          bounds=text.getBBox();if(bounds.width>uw+1||bounds.height>uh+1)throw Error('تعذر احتواء الاسم كاملاً داخل الورقة');
        }
        const content=base.getBBox(),old=base.getAttribute('viewBox').split(/[ ,]+/).map(Number),left=Math.min(old[0],content.x-12),top=Math.min(old[1],content.y-12),right=Math.max(old[0]+old[2],content.x+content.width+12),bottom=Math.max(old[1]+old[3],content.y+content.height+12);base.setAttribute('viewBox',[left,top,right-left,bottom-top].join(' '));
      }finally{stage.remove();if(savedStyle===null)base.removeAttribute('style');else base.setAttribute('style',savedStyle);}
      const box=(base.getAttribute('viewBox')||'').trim().split(/[ ,]+/).map(Number);if(box.length!==4||!box.every(Number.isFinite)||box[2]<=0||box[3]<=0)throw Error('حدود الرسم غير صالحة');
      const sw=box[2],sh=box[3],head=sw*.06,step=sw*.032,levels=Math.max(...visible.map(p=>p.generation))+1,rows=Math.ceil(levels/8),total=sh+head+rows*step;
      const outer=node('svg',{xmlns:NS,width:w+'mm',height:h+'mm',viewBox:`0 0 ${sw} ${total}`,preserveAspectRatio:'xMidYMid meet','text-rendering':'geometricPrecision'});
      outer.append(node('rect',{width:sw,height:total,fill:'#faf5e8'}),node('text',{x:sw/2,y:head*.65,'text-anchor':'middle','font-family':'Tahoma,Arial,sans-serif','font-size':sw/40,direction:'rtl',fill:'#203c2b'},source.doc.title));
      base.setAttribute('x','0');base.setAttribute('y',head);base.setAttribute('width',sw);base.setAttribute('height',sh);base.setAttribute('preserveAspectRatio','xMidYMid meet');outer.append(D.importNode(base,true));
      for(let i=0;i<levels;i++){const x=sw-(i%8+.5)*sw/8,y=head+sh+(Math.floor(i/8)+.65)*step;outer.append(node('circle',{cx:x+sw/25,cy:y-sw/500,r:sw/400,fill:C.color(source.doc.presentation,i)}),node('text',{x,y,'text-anchor':'middle','font-size':sw/110,'font-family':'Tahoma,Arial,sans-serif',direction:'rtl',fill:'#203c2b'},'الجيل '+(i+1)));}
      const markup=new XMLSerializer().serializeToString(outer),fonts=[...base.querySelectorAll('text')].map(e=>parseFloat(e.getAttribute('font-size'))).filter(n=>n>0),pt=(fonts.length?Math.min(...fonts):14)*Math.min(w/sw,h/total)*72/25.4;
      const html=printHtml(source.doc.title,w,h,markup);
      return{svg:markup,html,w,h,pt,count:visible.length};
    }
    const controls=[];function lock(){ready=false;dirty=true;ticket++;suggestedSize=null;applySuggestedSize.hidden=true;for(const b of controls)b.disabled=true;}
    function recommendSize({pt,w,h,boardWidth=w,boardHeight=h}){
      if(!Number.isFinite(pt)||pt<=0||pt>=printNameTargetPt)return '';
      const factor=Math.min(w/boardWidth,h/boardHeight)*printNameTargetPt/pt;
      const roundUp=mm=>Math.ceil(mm*factor/5)*5;
      const width=Math.max(100,roundUp(boardWidth)),height=Math.max(100,roundUp(boardHeight));
      if(width>5000||height>5000)return 'للوصول إلى ٩ نقاط، جرّب تصدير لوحات الفروع.';
      suggestedSize={width,height};
      applySuggestedSize.textContent=`جرّب مقاس ${width} × ${height} مم`;
      applySuggestedSize.hidden=false;
      return 'أصغر خط دون ٩ نقاط. يمكنك تجربة المقاس المقترح أو تصدير لوحات الفروع.';
    }
    frame.onload=()=>{try{ready=!!job&&!dirty&&frame.contentDocument?.body?.getAttribute('data-poster-token')===job.token;}catch{ready=false;}print.disabled=!ready;};
    function build(){
      lock();
      try{
        job=compose(captured,Number(width.value),Number(height.value));
        job.token=String(++renderTicket);
        job.html=job.html.replace('<body>','<body data-poster-token="'+job.token+'">');
        dirty=false;
        frame.srcdoc=job.html;
        const heritage=captured.mode==='heritage';
        if(heritage){
          job.reviewHtml=scope.HeritageReview.html(captured.doc.title,job.svg);
          reviewFrame.srcdoc=job.reviewHtml;
        }
        for(const b of controls)b.disabled=false;
        print.disabled=true;
        const warnings=[];
        if(!heritage&&job.pt<8)warnings.push('الأسماء قد تكون صغيرة عند هذا المقاس. كبّر اللوحة.');
        if(job.collisions)warnings.push('توجد أسماء متداخلة في هذا التوزيع.');
        if(job.obstructedBranches)warnings.push('بعض مسارات الأغصان تمر خلف أوراق أخرى.');
        else if(job.branchCrossings)warnings.push('توجد تقاطعات بين بعض مسارات الأغصان.');
        if(job.ribbonContacts)warnings.push(`تلامس حواف ${job.ribbonContacts} أزواج من الأغصان غير المتصلة.`);
        if(heritage){
          warnings.push(`أصغر خط على المقاس المحدد: ${job.pt.toFixed(1)} نقطة.`);
          const recommendation=recommendSize(job);
          if(recommendation)warnings.push(recommendation);
        }
        status.textContent=heritage ? [`${job.count} اسمًا في لوحة واحدة.`,...warnings].join(' ') : [`لوحة واحدة كاملة · ${job.count} اسم · ${job.w}×${job.h} مم. أصغر خط تقريبي ${job.pt.toFixed(1)} نقطة.`,...warnings,'SVG أفضل جودة للمطبعة. PNG محدود بـ4096 بكسل.'].join(' ');
      }catch(e){job=null;frame.srcdoc='';reviewFrame.srcdoc='';status.textContent=e.message;}
    }
    width.oninput=height.oninput=lock;
    stylePicker.onchange=()=>{
      preferredHeritageStyle=selectedStyle();
      build();
    };
    const applySize=button('posterApplySize','تحديث مقاس اللوحة',build);
    const saveSvg=button('posterSvg','تنزيل صورة الشجرة SVG للمطبعة',()=>{if(job&&!dirty)download('family-tree-complete-poster.svg',job.svg,'image/svg+xml');});
    const saveHtml=button('posterHtml','تنزيل ملف الطباعة — صفحة واحدة',()=>{if(job&&!dirty)download('family-tree-complete-poster.html',job.html,'text/html;charset=utf-8');});
    const saveReview=button('posterReviewHtml','تنزيل المعاينة التفاعلية HTML',()=>{
      if(job?.reviewHtml&&!dirty)download('family-tree-heritage-review.html',job.reviewHtml,'text/html;charset=utf-8');
    });
    const print=button('posterPrintNow','طباعة الصورة / حفظ PDF — صفحة واحدة',()=>{if(ready&&job&&!dirty){frame.contentWindow.focus();frame.contentWindow.print();}});
    const saveBranches=button('posterBranchPages','تنزيل لوحات الفروع — عدة صفحات',()=>{
      if(captured?.mode!=='heritage'||!job||dirty) return;
      try {
        const {w,h}=job;
        const ctx=D.createElement('canvas').getContext('2d');
        const pages=scope.HeritagePoster.renderPaged(captured.doc,w,h-12,(name,font)=>{
          ctx.font=font+'px Tahoma,Arial,sans-serif';
          return ctx.measureText(name).width;
        });
        const sections=pages.map(page=>{
          const svg=new DOMParser().parseFromString(page.art.svg,'image/svg+xml').documentElement;
          const prefix=`page-${page.number}-`;
          for(const element of svg.querySelectorAll('*')){
            if(element.id)element.id=prefix+element.id;
            for(const attribute of [...element.attributes]){
              if(attribute.value.startsWith('url(#'))
                element.setAttribute(attribute.name,attribute.value.replace('url(#','url(#'+prefix));
            }
          }
          const from=page.from ? ` · <a href="#branch-page-${page.from}">متابعة من صفحة ${page.from}</a>` : '';
          const next=pages.filter(child=>child.from===page.number).map(child=>child.number);
          const continuation=next.length ? ` · تكمل الفروع في ${next.map(n=>`<a href="#branch-page-${n}">${n}</a>`).join('، ')}` : '';
          return `<section id="branch-page-${page.number}" aria-label="صفحة ${page.number}: ${escape(page.anchor)}">${new XMLSerializer().serializeToString(svg)}<footer><div>صفحة ${page.number} من ${pages.length}${from}${continuation}</div></footer></section>`;
        });
        const index=pages.map(page=>`<li><a href="#branch-page-${page.number}">${page.number} · ${escape(page.anchor)}</a></li>`).join('');
        const html=`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(captured.doc.title)}</title><style>
          @page{size:${w}mm ${h}mm;margin:0}*{box-sizing:border-box}body{margin:0;background:#eee}
          section{width:${w}mm;height:${h}mm;margin:0 auto 12px;background:white;break-inside:avoid;break-after:page;print-color-adjust:exact}
          section:last-child{break-after:auto}section>svg{display:block;width:100%;height:${h-12}mm}
          footer{height:12mm;display:grid;place-items:center;font:10pt Tahoma,Arial,sans-serif;text-align:center;padding:0 6mm}
          a{color:#205641}nav{margin:12px auto;padding:12px 18px;width:min(100%,${w}mm);background:#fffdf5;font:15px Tahoma,Arial,sans-serif}
          nav ul{display:flex;flex-wrap:wrap;gap:8px 24px;list-style:none;padding:0;margin:10px 0 0}
          @media screen{section{max-width:100%;height:auto}section>svg{height:auto}footer{height:auto;min-height:12mm}}
          @media print{nav{display:none}section{margin:0}footer a{color:inherit;text-decoration:none}}
        </style><nav aria-label="فهرس لوحات الفروع"><strong>فهرس لوحات الفروع</strong><ul>${index}</ul></nav>${sections.join('')}</html>`;
        download('family-tree-branch-posters.html',html,'text/html;charset=utf-8');
        const minPt=Math.min(...pages.map(page=>page.art.pt));
        const crowded=pages.filter(({art})=>art.collisions || art.branchCrossings || art.obstructedBranches || art.ribbonContacts).length;
        const warning=crowded ? ` · راجع التداخل في ${crowded} صفحات` : '';
        status.textContent=`تم تجهيز ${pages.length} صفحات · أصغر خط تقريبي ${minPt.toFixed(1)} نقطة${warning}.`;
      } catch(error) { toast(error.message); }
    });
    const png=button('posterPng','تنزيل صورة PNG كاملة',async()=>{if(!job||dirty||busy)return;busy=true;const source=job,t=++ticket;let url;try{const p=new DOMParser().parseFromString(source.svg,'image/svg+xml').documentElement,rasterW=source.boardWidth||source.w,rasterH=source.boardHeight||source.h,ratio=Math.min(4096/Math.max(rasterW,rasterH),Math.sqrt(12000000/(rasterW*rasterH))),pw=Math.max(1,Math.floor(rasterW*ratio)),ph=Math.max(1,Math.floor(rasterH*ratio));p.setAttribute('width',pw);p.setAttribute('height',ph);url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(p)],{type:'image/svg+xml'}));const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});const canvas=D.createElement('canvas');canvas.width=pw;canvas.height=ph;const paint=canvas.getContext('2d');paint.fillStyle='#faf5e8';paint.fillRect(0,0,pw,ph);paint.drawImage(image,0,0,pw,ph);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=canvas.height=0;if(blob&&dialog.open&&t===ticket&&job===source)download('family-tree-complete-poster.png',blob,'image/png');}catch{toast('تعذرPNG؛ استخدمSVG');}finally{if(url)URL.revokeObjectURL(url);busy=false;}});
    controls.push(saveSvg,saveHtml,print,png,saveReview,saveBranches);lock();
    const close=button('posterClose','إغلاق',()=>dialog.close());dialog.addEventListener('close',()=>{if(dialog.open)return;const opener=captured?.mode==='heritage'?'workspaceHeritagePoster':'workspacePoster';openTicket++;ticket++;lock();job=null;captured=null;frame.srcdoc='';reviewFrame.srcdoc='';D.getElementById(opener)?.focus();});
    const heading=el('h2','صورة الشجرة كاملة — لوحة واحدة');
    const instructions=el('p');
    const printSettings=el('details');printSettings.id='posterPrintSettings';
    printSettings.append(el('summary','خيارات الطباعة'),el('label','العرض بالملّيمتر'),width,el('label','الارتفاع بالملّيمتر'),height,applySize,saveHtml,print,saveBranches);
    dialog.append(heading,instructions,stylePicker,status,applySuggestedSize,saveReview,saveSvg,png,close,reviewFrame,printSettings,frame);D.body.append(dialog);
    async function open(mode){
      if(dialog.open||gestureActive?.())return;
      try{
        const request=++openTicket;
        await D.fonts.ready;
        if(request!==openTicket||dialog.open)return;
        const doc=C.copy(readDocument());
        const heritage=mode==='heritage';
        stylePicker.hidden=!heritage;
        if(heritage){
          const initialStyle=preferredHeritageStyle ?? (C.visible(doc).nodes.length<=80?'organic-improved':'growing');
          styleInputs.get(initialStyle).checked=true;
        }
        captured={doc,mode,svg:heritage?null:readSvg()};
        heading.textContent=heritage?'لوحة الأنساب التراثية':'صورة الشجرة كاملة — لوحة واحدة';
        instructions.textContent=heritage?'كبّر اللوحة أو ابحث عن اسم. اختر شخصًا لتتبّع نسبه حتى الجذر.':'اختر مقاس اللوحة عند الطباعة وأوقف ترويسات المتصفح. يمكن تكبير الورق إذا صغرت الأسماء.';
        printSettings.open=!heritage;
        reviewFrame.hidden=!heritage;
        saveReview.hidden=!heritage;
        saveBranches.hidden=!heritage;
        frame.style.position=heritage?'absolute':'';
        frame.style.insetInlineStart=heritage?'-100000px':'';
        frame.setAttribute('aria-hidden',String(heritage));
        frame.tabIndex=heritage?-1:0;
        width.value=heritage?700:doc.presentation.print.widthMm;
        height.value=heritage?1000:doc.presentation.print.heightMm;
        dialog.showModal();build();
      }catch(e){toast(e.message);}
    }
    return Object.freeze({open});
  };
})(globalThis);
