/* A self-contained, offline viewer for the exported heritage SVG. */
(function (scope) {
  'use strict';
  function initialize() {
    const byId = id => document.getElementById(id);
    const svg = document.querySelector('#art > svg');
    const full = Object.fromEntries(['x','y','width','height'].map(key => [key, svg.viewBox.baseVal[key]]));
    let view = { ...full };
    let gesture;
    const people = new Map([...svg.querySelectorAll('[data-person-id]')].map(node => [node.dataset.personId,node]));
    const edges = new Map([...svg.querySelectorAll('[data-child-id]')].map(edge => [edge.dataset.childId,edge]));
    const trace = document.createElementNS(svg.namespaceURI,'g');
    trace.id = 'lineageTrace';
    trace.setAttribute('aria-hidden','true');
    trace.setAttribute('pointer-events','none');
    const branches = edges.values().next().value?.parentElement;
    if (branches) branches.after(trace);
    else svg.append(trace);
    const children = new Map();
    const name = node => node.querySelector('[data-poster-name]').textContent.trim().replace(/\s+/g,' ');
    const searchable = value => value.normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[٠-٩۰-۹]/g,digit => String('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)%10)).toLowerCase();
    const index = [...people].map(([id,node]) => ({id,node,label:name(node),key:searchable(name(node))}));
    for (const edge of edges.values()) {
      const parent = edge.dataset.parentId;
      if (!children.has(parent)) children.set(parent,[]);
      children.get(parent).push(edge.dataset.childId);
    }
    function show() {
      const {x,y,width,height} = view;
      svg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
      const screen=svg.getBoundingClientRect();
      const fitScale=Math.min(screen.width/full.width,screen.height/full.height);
      const currentScale=Math.min(screen.width/width,screen.height/height);
      byId('zoom').textContent = `${Math.round(currentScale/fitScale*100)}%`;
    }
    function zoom(factor, centerX = view.x + view.width / 2, centerY = view.y + view.height / 2) {
      const screen=svg.getBoundingClientRect();
      const effective=Math.min(screen.width,screen.height*view.width/view.height);
      const smallest=Math.min(...index.map(({node})=>Number(node.querySelector('text').getAttribute('font-size'))));
      const minimumWidth=Math.min(full.width/16,effective*smallest/64);
      const next = Math.max(minimumWidth, Math.min(full.width * 1.5, view.width / factor));
      const ratio = next / view.width;
      view = { x:centerX-(centerX-view.x)*ratio, y:centerY-(centerY-view.y)*ratio, width:next, height:view.height*ratio };
      show();
    }
    function clear() {
      trace.replaceChildren();
      for (const node of svg.querySelectorAll('.review-active')) node.classList.remove('review-active');
      svg.classList.remove('review-selection');
      byId('person').hidden = true;
    }
    function focusPerson(id, move) {
      const node = people.get(id);
      if (!node) return;
      clear();
      for (let current = id; people.has(current);) {
        people.get(current).classList.add('review-active');
        const edge = edges.get(current);
        if (!edge) break;
        edge.classList.add('review-active');
        const path = edge.querySelector('path').cloneNode(false);
        path.setAttribute('fill','#b67829');
        path.setAttribute('stroke','#fff1cf');
        path.setAttribute('stroke-width','1.4');
        trace.append(path);
        current = edge.dataset.parentId;
      }
      svg.classList.add('review-selection');
      byId('person').hidden = false;
      byId('personName').textContent = name(node);
      const parent = edges.get(id)?.dataset.parentId;
      byId('generation').textContent = `الجيل ${Number(node.dataset.generation)+1} · ${children.get(id)?.length || 0} أبناء ظاهرين`;
      byId('relatives').replaceChildren();
      const add = (personId,prefix) => {
        const relative = people.get(personId);
        if (!relative) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = prefix + name(relative);
        button.onclick = () => { focusPerson(personId,true); byId('personName').focus(); };
        byId('relatives').append(button);
      };
      if (parent) add(parent,'الأب · ');
      for (const child of children.get(id) || []) add(child,'');
      if (move) {
        const transform = node.transform.baseVal.getItem(0).matrix;
        const screen=svg.getBoundingClientRect(),bounds=node.getBBox();
        const effective=screen.width;
        const font=Number(node.querySelector('text').getAttribute('font-size'));
        // Prefer a little context, but never shrink lettering just to fit an
        // unusually wide leaf. Its full name is also available in the card.
        const width = Math.min(view.width,Math.min(font*effective/19,Math.max(bounds.width*1.1,font*effective/20)));
        const height = width * screen.height / screen.width;
        view = { x: transform.e-width/2, y: transform.f-height/2, width,height };
        show();
      }
    }
    function search() {
      const query = searchable(byId('query').value.trim());
      const matches = query ? index.filter(item => item.key.includes(query)) : [];
      const list = byId('matches');
      list.replaceChildren();
      byId('searchStatus').textContent = query ? `${matches.length} نتيجة` : '';
      for (const match of matches.slice(0,30)) {
        const button = document.createElement('button');
        const parent = people.get(edges.get(match.id)?.dataset.parentId);
        button.type = 'button';
        button.textContent = parent ? `${match.label} · الأب ${name(parent)}` : match.label;
        button.onclick = () => { focusPerson(match.id,true); list.hidden = true; byId('personName').focus(); };
        list.append(button);
      }
      list.hidden = !matches.length;
      return matches;
    }
    byId('query').oninput = search;
    byId('query').onkeydown = event => {
      if (event.key === 'Enter') {
        const matches = search();
        if (matches.length === 1) {
          focusPerson(matches[0].id,true);
          byId('matches').hidden = true;
          byId('personName').focus();
        } else if (matches.length) byId('matches').firstElementChild.focus();
      } else if (event.key === 'Escape') byId('matches').hidden = true;
    };
    byId('zoomIn').onclick = () => zoom(1.35);
    byId('zoomOut').onclick = () => zoom(1/1.35);
    byId('fit').onclick = () => { clear(); view = { ...full }; show(); };
    byId('clearPerson').onclick = () => { clear(); byId('query').focus(); };
    for (const {id,node,label} of index) {
      node.setAttribute('tabindex','0');
      node.setAttribute('role','button');
      node.setAttribute('aria-label',label);
      node.addEventListener('keydown',event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          focusPerson(id,false);
          byId('personName').focus();
        }
      });
    }
    svg.addEventListener('wheel',event => {
      event.preventDefault();
      const p = new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());
      zoom(event.deltaY < 0 ? 1.14 : 1/1.14,p.x,p.y);
    },{passive:false});
    svg.addEventListener('pointerdown',event => {
      if (event.button !== 0 || gesture) return;
      const inverse = svg.getScreenCTM().inverse();
      gesture = { id:event.pointerId, x:event.clientX, y:event.clientY, view:{...view}, inverse,
        person:event.target.closest('[data-person-id]')?.dataset.personId, moved:false };
      svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener('pointermove',event => {
      if (gesture?.id !== event.pointerId) return;
      const dx = event.clientX-gesture.x, dy = event.clientY-gesture.y;
      if (Math.hypot(dx,dy) < 4 && !gesture.moved) return;
      gesture.moved = true;
      const {a,b,c,d} = gesture.inverse;
      view = {...gesture.view, x:gesture.view.x-a*dx-c*dy, y:gesture.view.y-b*dx-d*dy};
      show();
    });
    function finish(event) {
      if (gesture?.id !== event.pointerId) return;
      const selection = gesture;
      gesture = null;
      if (event.type === 'pointerup' && !selection.moved && selection.person) focusPerson(selection.person,false);
    }
    svg.addEventListener('pointerup',finish);
    svg.addEventListener('pointercancel',finish);
    svg.addEventListener('lostpointercapture',finish);
    let printView;
    window.addEventListener('beforeprint', () => {
      printView = svg.getAttribute('viewBox');
      svg.setAttribute('viewBox', `${full.x} ${full.y} ${full.width} ${full.height}`);
    });
    window.addEventListener('afterprint', () => {
      if (printView) svg.setAttribute('viewBox', printView);
      printView = null;
    });
    show();
  }

  function html(title, svg) {
    const safeTitle = String(title).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${safeTitle}</title><style>
*{box-sizing:border-box}body{margin:0;background:#24352e;color:#f7edcf;font:15px Tahoma,Arial,sans-serif;display:grid;grid-template-rows:auto minmax(0,1fr);height:100vh;height:100dvh}header{display:flex;gap:9px;flex-wrap:wrap;align-items:center;padding:10px 14px;background:#192923;border-bottom:1px solid #ac8f55}h1{font-size:16px;margin:0 0 0 12px}button,input{font:inherit;border:1px solid #8f815c;border-radius:7px;padding:8px 10px}button{cursor:pointer;background:#f3e6c6;color:#26352e}input{background:#fffdf5;color:#1c2b24;width:min(260px,70vw)}button:focus-visible,input:focus-visible,svg [tabindex]:focus-visible{outline:3px solid #db9b35;outline-offset:2px}.search{position:relative}#matches{position:absolute;inset-inline-start:0;top:100%;width:min(340px,85vw);max-height:45vh;overflow:auto;background:#f7edcf;z-index:3;padding:6px;border-radius:8px}#matches button,#relatives button{display:block;width:100%;text-align:start;margin:3px 0}main{min-height:0;display:grid;position:relative}#art{min-height:0;overflow:hidden}#art>svg{width:100%;height:100%;display:block;touch-action:none;cursor:grab;user-select:none}#art>svg:active{cursor:grabbing}[data-person-id]{cursor:pointer}.review-selection [data-person-id]:not(.review-active),.review-selection [data-child-id]:not(.review-active){opacity:.27}.review-active[data-person-id]{filter:drop-shadow(0 0 2px #f3ab23)}.review-active[data-child-id]>path:first-child{fill:#b67829}aside{position:absolute;inset-inline-end:12px;bottom:12px;max-width:min(340px,92vw);max-height:37vh;overflow:auto;padding:12px;border:1px solid #ac8f55;border-radius:10px;background:#fff8e8;color:#26352e}aside h2{font-size:16px;margin:0 0 7px}aside p{margin:5px 0 9px}#clearPerson{margin-top:8px}[hidden]{display:none!important}@media(max-width:600px){header{padding:8px;gap:6px}h1{flex-basis:100%}button,input{padding:8px}}
@media print{header,aside,#lineageTrace{display:none!important}body{display:block;height:auto;background:white}main{display:block}#art{overflow:visible;print-color-adjust:exact;-webkit-print-color-adjust:exact}#art>svg{width:100%;height:auto}.review-selection [data-person-id],.review-selection [data-child-id]{opacity:1!important}.review-active[data-person-id]{filter:none}.review-active[data-child-id]>path:first-child{fill:#513221}}
</style></head><body><header><h1>${safeTitle}</h1><div class="search"><input id="query" type="search" aria-label="ابحث عن اسم" placeholder="ابحث عن اسم" autocomplete="off"><div id="matches" hidden></div></div><span id="searchStatus" role="status"></span><button id="zoomIn" aria-label="تكبير">+</button><button id="zoomOut" aria-label="تصغير">−</button><output id="zoom"></output><button id="fit">عرض كامل</button></header><main><div id="art">${svg}</div><aside id="person" hidden aria-label="تفاصيل الشخص"><h2 id="personName" tabindex="-1"></h2><p id="generation"></p><div id="relatives"></div><button id="clearPerson">إخفاء التفاصيل</button></aside></main><script>(${initialize.toString()})();</script></body></html>`;
  }
  scope.HeritageReview = Object.freeze({html});
})(globalThis);
