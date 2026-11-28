'use strict';

const byId = id => document.getElementById(id);
let user = null;
let people = [];
let selectedId = null;
let searchReturnId = null;
let treeSnapshot = null;
let beforeSnapshot = null;
let liveConnection = null;
let connectionGeneration = 0;
let privatePeople = [];
let treeRequest = 0;
let batchDraft = null;

function visiblePrivatePeople(rows){
  const scope=byId('tree-scope').value;
  if(scope==='shared')return [];
  return scope==='all'?rows:rows.filter(person=>person.id===user?.personId || person.parentId===user?.personId);
}

function descendants(rows, id) {
  const children = new Map();
  for (const person of rows) {
    if (!children.has(person.parentId)) children.set(person.parentId, []);
    children.get(person.parentId).push(person.id);
  }
  const found = new Set();
  const pending = id ? [id] : [];
  while (pending.length) {
    const current = pending.pop();
    if (found.has(current)) continue;
    found.add(current);
    pending.push(...children.get(current) || []);
  }
  return found;
}

function svgElement(tag, attributes = {}, text) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}

const treeColors={
  male:{label:'ذكر',fill:'#e0eef9',stroke:'#245b81'},
  female:{label:'أنثى',fill:'#f6e4ee',stroke:'#874269'},
  ancestor:{label:'الأب والأجداد',fill:'#eee7fa',stroke:'#64418a'},
  selected:{label:'الشخص المحدد',fill:'#ffefbf',stroke:'#865711'},
  child:{label:'الأبناء المباشرون',fill:'#dceee3',stroke:'#31694d'},
  descendant:{label:'الأحفاد والذرية',fill:'#dceef0',stroke:'#30636c'},
  other:{label:'بقية العائلة',fill:'#fffdf6',stroke:'#796b53'},
  mine:{label:'فرعي',fill:'#dceee3',stroke:'#31694d'},
  muted:{label:'الفروع الأخرى',fill:'#ebece9',stroke:'#707771'}
};
const legendColors=mode=>(mode==='gender'?['male','female']:mode==='membership'?['mine','muted']:
  ['selected','ancestor','child','descendant','other']).map(key=>treeColors[key]);
const generationColors=['male','ancestor','child','selected','female','descendant'].map(key=>treeColors[key]);
const arabicNumber=new Intl.NumberFormat('ar-SA');
let botanicalZoom=1;
let overviewMode=false;
let treePinch=null;
let radialCache=null;
const branchExpansion=new Map();
const detailZoomThreshold=1.24;
const minimumReadingScale=0.8;
let inlineSelection=null;
let inlineAge='';
let focusReturn=null;
const mobileTree=matchMedia('(max-width:760px), (pointer:coarse) and (max-width:900px)');

function drawBotanical(container,snapshot,shown,allPeople,relationship,colorMode,membership,accountAncestors){
  const core=globalThis.BotanicalCore;
  if(!core)return false;
  const botanicalNodes=new Map(shown.map(person=>[person.id,{
    personId:person.id,fullName:person.name,parentId:person.parentId,children:[],generation:0,descendantCount:0
  }]));
  const roots=[];
  for(const node of botanicalNodes.values()){
    const parent=botanicalNodes.get(node.parentId);
    if(parent)parent.children.push(node);
    else{node.parentId=null;roots.push(node);}
  }
  if(roots.length!==1)return false;
  const [root]=roots,nodes=[];
  const pending=[root];
  while(pending.length){
    const person=pending.pop();
    nodes.push(person);
    for(const child of person.children.slice().reverse()){
      child.generation=person.generation+1;
      pending.push(child);
    }
  }
  if(nodes.length!==shown.length)return false;
  for(const node of nodes.slice().reverse()){
    node.descendantCount=node.children.reduce((sum,child)=>sum+child.descendantCount+1,0);
  }
  const source={title:snapshot.title,presentation:core.defaults()};
  const offset=ancestorIds(allPeople,root.personId).size;
  for(const generation of new Set(nodes.map(node=>node.generation))){
    source.presentation.generationPalette[generation]=core.color(core.defaults(),generation+offset);
  }
  const context=document.createElement('canvas').getContext('2d');
  context.font='18px Tahoma,Arial,sans-serif';
  const geometry=core.layout(source,name=>context.measureText(name).width,{root,nodes,excluded:0});
  const parsed=new DOMParser().parseFromString(core.svgMarkup(source,geometry),'image/svg+xml');
  if(parsed.querySelector('parsererror'))return false;
  const svg=document.importNode(parsed.documentElement,true);
  svg.setAttribute('role','group');
  svg.setAttribute('aria-label',snapshot.title||'الشجرة النباتية');
  for(const el of svg.querySelectorAll('[id]'))el.removeAttribute('id');
  const box=svg.getAttribute('viewBox').split(/\s+/).map(Number);
  const scale=treeScale(container,box[2],box[3]);
  svg.setAttribute('width',Math.round(box[2]*scale));
  svg.setAttribute('height',Math.round(box[3]*scale));
  const legend=svg.querySelector(':scope > g:last-child');
  if(colorMode==='generation'){
    [...legend.querySelectorAll('text')].forEach((item,i)=>{item.textContent='الجيل '+arabicNumber.format(i+1+offset);});
  }else legend.remove();
  const previous=new Map(beforeSnapshot?.people.map(person=>[person.id,person.name]));
  for(const item of svg.querySelectorAll('[data-person-id]')){
    const id=item.dataset.personId;
    const person=allPeople.get(id),level=botanicalNodes.get(id).generation+offset+1;
    const category=relationship(person),gender=person.gender==='f'?'female':'male';
    const tone=colorMode==='gender'?treeColors[gender]:colorMode==='relationship'?treeColors[category]:
      membership?treeColors[membership.has(id)?'mine':'muted']:null;
    const label=item.querySelector(':scope > rect');
    const outline=item.querySelector(':scope > g');
    if(tone){
      label.setAttribute('stroke',tone.stroke);
      outline.setAttribute('stroke',tone.stroke);
      outline.setAttribute('fill',tone.fill);
    }
    item.classList.toggle('is-selected',selectedId===id);
    item.classList.toggle('is-self',user?.personId===id);
    item.setAttribute('aria-pressed',String(selectedId===id));
    item.setAttribute('aria-label',person.name+'، الجيل '+arabicNumber.format(level));
    item.dataset.relationship=category;
    item.dataset.generation=level;
    item.dataset.gender=gender;
    if(membership)item.dataset.membership=membership.has(id)?'mine':'muted';
    if(accountAncestors.has(id))item.dataset.myAncestor='';
    item.querySelector(':scope > text:last-child').textContent=arabicNumber.format(level);
    if(beforeSnapshot&&container.id!=='before-tree'&&person.gender!=='f'){
      if(!previous.has(id))item.dataset.change='added';
      else if(previous.get(id)!==person.name)item.dataset.change='renamed';
    }
    item.onclick=()=>openPersonCard(id,false,container.id==='tree-view');
    item.onkeydown=event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();openPersonCard(id,false,container.id==='tree-view',true);}
    };
  }
  if(membership)for(const edge of svg.querySelectorAll('[data-child-id]')){
    edge.setAttribute('stroke',treeColors[membership.has(edge.dataset.parentId)&&membership.has(edge.dataset.childId)?'mine':'muted'].stroke);
  }
  for(const edge of svg.querySelectorAll('[data-child-id]')){
    if(accountAncestors.has(edge.dataset.parentId)&&(accountAncestors.has(edge.dataset.childId)||edge.dataset.childId===user?.personId))edge.dataset.myLineage='';
  }
  if(container.id==='tree-view'){
    const generationKeys=new Set(nodes.map(node=>node.generation));
    const colors=colorMode==='generation'?[...generationKeys].sort((a,b)=>a-b).map(level=>({
      label:'الجيل '+arabicNumber.format(level+offset+1),
      fill:source.presentation.generationPalette[level],
      stroke:source.presentation.generationPalette[level]
    })):legendColors(colorMode);
    renderTreeLegend(colors);
    byId('tree-ancestor-hint').hidden=colorMode!=='relationship'||offset===0;
  }
  container.dataset.drawing='botanical';
  container.append(svg);
  return true;
}

function ancestorIds(map,id){
  const ancestors=new Set();
  let parent=map.get(id)?.parentId;
  while(parent && parent!==id && map.has(parent) && !ancestors.has(parent)){
    ancestors.add(parent);
    parent=map.get(parent).parentId;
  }
  return ancestors;
}

function renderTreeLegend(entries){
  const legend=byId('tree-color-legend');
  legend.replaceChildren(...entries.map(({label,fill,stroke})=>{
    const item=document.createElement('li');
    const icon=svgElement('svg',{width:16,height:16,viewBox:'0 0 16 16','aria-hidden':'true'});
    icon.append(svgElement('circle',{cx:8,cy:8,r:6,fill,stroke,'stroke-width':2}));
    item.append(icon,document.createTextNode(label));
    return item;
  }));
}

function fitTreeScale(container,width,height){
  return Math.min(container.clientWidth/width,container.clientHeight/height,1.35);
}

function showScaleControls(fit,scale){
  const help=byId('tree-scale-help');
  help.hidden=fit>=minimumReadingScale&&scale>=minimumReadingScale;
  help.textContent=scale<minimumReadingScale-0.001
    ? 'كبّر بإصبعين أو اختر «ملاءمة» لقراءة الأسماء.'
    : 'اسحب بإصبع واحد للتنقل، أو كبّر بإصبعين لقراءة الأسماء.';
  byId('tree-overview').setAttribute('aria-pressed',String(overviewMode));
}

function treeScale(container,width,height,fitToViewport=true){
  const fit=fitTreeScale(container,width,height);
  if(container.id!=='tree-view')return fit*botanicalZoom;
  const base=fitToViewport?Math.max(minimumReadingScale,fit):1;
  const scale=overviewMode?fit:base*botanicalZoom;
  if(fitToViewport||botanicalZoom!==1)showScaleControls(fit,scale);
  return scale;
}

function radialLayout(roots,children,measure,allPeople){
  const positions=new Map(),rings=[];
  const weights=new Map();
  function weight(person){
    const result=(children.get(person.id)||[]).reduce((sum,child)=>sum+weight(child),0)||1;
    weights.set(person.id,result);
    return result;
  }
  function place(person,depth,generation,start,span,parentId=null){
    const angle=start+span/2;
    const position={angle,ux:Math.cos(angle),uy:Math.sin(angle),width:measure(person),generation,parentId,id:person.id};
    positions.set(person.id,position);
    (rings[depth]??=[]).push(position);
    let cursor=start;
    for(const child of children.get(person.id)||[]){
      const share=span*weights.get(child.id)/weights.get(person.id);
      place(child,depth+1,generation+1,cursor,share,person.id);
      cursor+=share;
    }
  }
  const fullTurn=2*Math.PI;
  const total=roots.reduce((sum,root)=>sum+weight(root),0);
  let cursor=-Math.PI/2;
  for(const root of roots){
    const span=fullTurn*weights.get(root.id)/total;
    const generation=ancestorIds(allPeople,root.id).size+1;
    place(root,roots.length===1?0:1,generation,cursor,span);
    cursor+=span;
  }
  function axisInterval(direction,center,clearance){
    if(Math.abs(direction)<1e-10)return Math.abs(center)<clearance?[-Infinity,Infinity]:null;
    const ends=[(center-clearance)/direction,(center+clearance)/direction];
    return ends[0]<ends[1]?ends:[ends[1],ends[0]];
  }
  function pack(tracks){
    const placed=new Map(),radii=[];
    let outerRadius=0;
    for(const [depth,ring] of rings.entries()){
      if(!ring)continue;
      // Change the packing order to stagger nearby labels without changing their angles.
      for(let track=0;track<tracks;track++)for(let index=track;index<ring.length;index+=tracks){
        const source=ring[index];
        const node={...source};
        const parent=placed.get(node.parentId);
        let radius=parent?parent.radius+90:depth?128:0;
        const blocked=[];
        for(const previous of placed.values()){
          const horizontal=axisInterval(node.ux,previous.x,(node.width+previous.width)/2+14);
          const vertical=axisInterval(node.uy,previous.y,64);
          if(!horizontal||!vertical)continue;
          const start=Math.max(horizontal[0],vertical[0]);
          const end=Math.min(horizontal[1],vertical[1]);
          if(start<end&&end>radius)blocked.push([start,end]);
        }
        blocked.sort((a,b)=>a[0]-b[0]);
        for(const [start,end] of blocked){
          if(start>radius)break;
          radius=Math.max(radius,end+0.01);
        }
        node.radius=radius;
        node.x=node.ux*radius;
        node.y=node.uy*radius;
        placed.set(node.id,node);
        outerRadius=Math.max(outerRadius,radius);
      }
      if(depth)radii.push(outerRadius);
    }
    return {placed,radii,outerRadius};
  }
  const candidates=[1,2,3,4].map(pack);
  candidates.sort((a,b)=>a.outerRadius-b.outerRadius);
  const best=candidates[0];
  // Return the original traversal order used by callers and exports.
  for(const id of positions.keys())positions.set(id,best.placed.get(id));
  return {positions,radii:best.radii};
}

function drawTree(container, snapshot, colored = true) {
  container.replaceChildren();
  delete container.dataset.drawing;
  if(container.id==='tree-view')byId('tree-scale-help').hidden=true;
  if (!snapshot?.people.length) return;
  const source = snapshot.people;
  const scope=byId('tree-scope').value;
  const anchor=scope==='mine'?user?.personId:scope==='branch'?selectedId:null;
  if(anchor&&!source.some(person=>person.id===anchor)){
    const empty = document.createElement('p');
    empty.className = 'tree-empty';
    empty.textContent = 'هذا الشخص أُضيف بعد النسخة السابقة، ويظهر فرعه في الرسم بعد التعديل.';
    container.append(empty);
    return;
  }
  const family = descendants(source, anchor||selectedId);
  const relatives = anchor && anchor!==selectedId ? descendants(source,selectedId) : family;
  const allPeople = new Map(source.map(person=>[person.id,person]));
  const folded=container.id==='tree-view'&&byId('tree-drawing').value==='folded';
  const ancestors = ancestorIds(allPeople,selectedId);
  const accountAncestors=ancestorIds(allPeople,user?.personId);
  const colorMode = colored ? byId('tree-color-mode').value : '';
  const membership=colorMode==='membership'?descendants(source,user?.personId):null;
  function relationship(person){
    if(person.id===selectedId)return 'selected';
    if(ancestors.has(person.id))return 'ancestor';
    if(selectedId&&person.parentId===selectedId)return 'child';
    return relatives.has(person.id)?'descendant':'other';
  }
  const shown = anchor && family.size
    ? source.filter(person => family.has(person.id)) : source;
  if(colored&&byId('tree-drawing').value==='botanical'&&drawBotanical(container,snapshot,shown,allPeople,relationship,colorMode,membership,accountAncestors))return;
  const map = new Map(shown.map(person => [person.id, person]));
  const children = new Map();
  for (const person of shown) {
    const parentId = map.has(person.parentId) ? person.parentId : null;
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(person);
  }
  const context = document.createElement('canvas').getContext('2d');
  context.font = (folded&&mobileTree.matches?'17':'15')+'px Tahoma,Arial,sans-serif';
  const radial=container.id==='tree-view'&&byId('tree-drawing').value==='radial';
  const roots=children.get(null)||[];
  const rootIds=new Set(roots.map(person=>person.id));
  const isExpanded=id=>branchExpansion.get(id)??rootIds.has(id);
  const descendantCounts=new Map();
  if(folded){
    // Count only people the current view is allowed to display.
    function count(person){
      const total=(children.get(person.id)||[]).reduce((sum,child)=>sum+1+count(child),0);
      descendantCounts.set(person.id,total);
      return total;
    }
    roots.forEach(count);
    container.dataset.drawing='folded';
  }
  const measure=person=>Math.max(folded?124:radial?126:150,Math.ceil(context.measureText(person.name).width+(folded?28:38)));
  if(radial&&(radialCache?.source!==source||radialCache.anchor!==anchor)){
    radialCache={source,anchor,layout:radialLayout(roots,children,measure,allPeople)};
  }
  const {positions,radii}=radial?radialCache.layout:{positions:new Map(),radii:[]};
  let cursor = 25;
  let maximumDepth = 0;
  const gap = folded?22:32;
  const rowHeight=folded?154:120;
  function place(person, depth, generation) {
    if (positions.has(person.id)) return;
    const width = measure(person);
    const position = {x:0, y:depth * rowHeight + 65, width, generation};
    positions.set(person.id, position);
    maximumDepth = Math.max(maximumDepth, depth);
    const start = cursor;
    const childrenHere = !folded||isExpanded(person.id)?children.get(person.id)||[]:[];
    for (const child of childrenHere) place(child, depth + 1, generation + 1);
    const subtreeWidth = Math.max(width, cursor - start - (childrenHere.length ? gap : 0));
    position.x = start + subtreeWidth / 2;
    cursor = start + subtreeWidth + gap;
  }
  if(!radial)for (const root of roots) place(root, 0, ancestorIds(allPeople,root.id).size + 1);
  if(container.id==='tree-view'){
    const generations=[...new Set([...positions.values()].map(({generation})=>generation))].sort((a,b)=>a-b);
    const entries=colorMode==='generation'
      ? generationColors.flatMap((color,index)=>{
        const numbers=generations.filter(generation=>(generation-1)%generationColors.length===index);
        return numbers.length?[{...color,label:'الجيل '+numbers.map(n=>arabicNumber.format(n)).join('، ')}]:[];
      })
      : legendColors(colorMode);
    renderTreeLegend(entries);
    byId('tree-ancestor-hint').hidden=colorMode!=='relationship'||![...ancestors].some(id=>!map.has(id));
  }
  const width = Math.max(650, cursor + 25);
  let height = maximumDepth * rowHeight + (folded?158:140);
  const fit=folded||radial||container.id==='tree-view'&&byId('live-tree').classList.contains('is-focused');
  const screenX=position=>radial?position.x:width-position.x;
  let left=0,top=0,viewWidth=width;
  if(fit){
    let right=-Infinity;
    left=Infinity;
    for(const position of positions.values()){
      left=Math.min(left,screenX(position)-position.width/2-18);
      right=Math.max(right,screenX(position)+position.width/2+18);
    }
    viewWidth=right-left;
  }
  if(radial){
    const radius=radii.at(-1)||0;
    top=-radius-54;
    height=-2*top;
    const extent=Math.max(-left,left+viewWidth,radius+28);
    left=-extent;
    viewWidth=2*extent;
    container.dataset.drawing='radial';
  }
  const scale=container.id==='tree-view'?treeScale(container,viewWidth,height,fit):1;
  const renderedHeight=Math.ceil(height*scale);
  const svg = svgElement('svg', {width:Math.ceil(viewWidth*scale), height:renderedHeight, viewBox:`${left} ${top} ${viewWidth} ${height}`, role:'group', 'aria-label':snapshot.title || 'شجرة العائلة'});
  if(fit)svg.style.marginBlockStart=Math.max(0,(container.clientHeight-renderedHeight)/2)+'px';
  for(const radius of new Set(radii))svg.append(svgElement('circle',{cx:0,cy:0,r:radius,class:'radial-guide','aria-hidden':'true'}));
  for (const person of shown) {
    const child = positions.get(person.id);
    const parent = positions.get(person.parentId);
    if (!parent || !child) continue;
    const middle=radial?(parent.radius+child.radius)/2:0;
    const branch=radial?`M${parent.x} ${parent.y}C${parent.ux*middle} ${parent.uy*middle} ${child.ux*middle} ${child.uy*middle} ${child.x} ${child.y}`:folded?
      `M${screenX(parent)} ${parent.y+73}C${screenX(parent)} ${parent.y+100} ${screenX(child)} ${child.y-50} ${screenX(child)} ${child.y-25}`:
      `M${screenX(parent)} ${parent.y+25}C${screenX(parent)} ${parent.y+77} ${screenX(child)} ${child.y-77} ${screenX(child)} ${child.y-25}`;
    const path = svgElement('path', {
      d:branch,
      class:'tree-branch' + (family.has(person.id) && family.has(person.parentId) ? ' is-related' : ''),
      'data-parent-id':person.parentId, 'data-child-id':person.id
    });
    const relation=relationship(person);
    if(membership)path.dataset.membership=membership.has(person.id)&&membership.has(person.parentId)?'mine':'muted';
    if(accountAncestors.has(person.parentId)&&(accountAncestors.has(person.id)||person.id===user?.personId))path.dataset.myLineage='';
    if(colorMode==='relationship'&&(relation==='child'||relation==='descendant'||
       ((relation==='selected'||relation==='ancestor')&&ancestors.has(person.parentId)))){
      path.setAttribute('data-kinship-path','');
      path.setAttribute('stroke',treeColors[relation==='selected'?'ancestor':relation].stroke);
    }
    svg.append(path);
  }
  for (const person of shown) {
    const position = positions.get(person.id);
    if (!position) continue;
    const previous = beforeSnapshot?.people.find(candidate=>candidate.id===person.id);
    const change = (snapshot===treeSnapshot || container.id==='tree-view') && beforeSnapshot && person.gender!=='f'
      ? !previous ? 'added' : previous.name!==person.name ? 'renamed' : null
      : null;
    const className = ['tree-person',family.has(person.id)?'is-related':'',person.id===user?.personId?'is-self':'',person.id===selectedId?'is-selected':'',change?'is-changed':''].filter(Boolean).join(' ');
    const group = svgElement('g', {transform:`translate(${screenX(position)} ${position.y})`, class:className,
      tabindex:0, role:'button','aria-label':person.name, 'aria-pressed':String(person.id===selectedId), 'data-person-id':person.id});
    const relation=relationship(person);
    const gender=person.gender==='f'?'female':'male'; // Shared paternal rows come from the male-only tree.
    const generationLabel='الجيل '+arabicNumber.format(position.generation);
    const color=colorMode==='generation'?generationColors[(position.generation-1)%generationColors.length]:
      colorMode==='gender'?treeColors[gender]:colorMode==='relationship'?treeColors[relation]:
      membership?treeColors[membership.has(person.id)?'mine':'muted']:null;
    if(membership)group.dataset.membership=membership.has(person.id)?'mine':'muted';
    if(accountAncestors.has(person.id))group.dataset.myAncestor='';
    const description=[colorMode==='generation'?generationLabel:color?.label,
      change==='added'?'أُضيف في آخر تعديل':change==='renamed'?'تغيّر الاسم في آخر تعديل':''].filter(Boolean).join(' · ');
    if(change)group.dataset.change=change;
    if(description){
      group.setAttribute('aria-description',description);
      group.append(svgElement('title',{},description));
    }
    const rectangle={x:-position.width/2,y:-25,width:position.width,height:50,rx:23};
    if(color){
      group.dataset.tone=colorMode;
      group.dataset.relationship=relation;
      group.dataset.generation=position.generation;
      group.dataset.gender=gender;
      Object.assign(rectangle,{fill:color.fill,stroke:color.stroke});
    }
    group.append(svgElement('rect',rectangle));
    group.append(svgElement('text',{'text-anchor':'middle',y:colorMode==='generation'?12:5,direction:'rtl'},person.name));
    if(colorMode==='generation')
      group.append(svgElement('text',{'class':'generation-number','text-anchor':'middle',y:-8,'aria-hidden':'true'},generationLabel));
    group.addEventListener('click',()=>openPersonCard(person.id,false,container.id==='tree-view'));
    group.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();openPersonCard(person.id,false,container.id==='tree-view',true);}
    });
    svg.append(group);
    const count=descendantCounts.get(person.id);
    if(count){
      const expanded=isExpanded(person.id);
      const x=screenX(position),y=position.y;
      svg.append(svgElement('path',{d:`M${x} ${y+25}v48`,class:'branch-toggle-stem','aria-hidden':'true'}));
      const toggle=svgElement('g',{class:'branch-toggle',transform:`translate(${x} ${y+53})`,tabindex:0,role:'button',
        'data-branch-id':person.id,'aria-expanded':String(expanded),
        'aria-label':`${expanded?'طي':'توسيع'} فرع ${person.name}، عدد الذرية ${arabicNumber.format(count)}`});
      toggle.append(svgElement('circle',{r:28,class:'branch-toggle-target'}));
      toggle.append(svgElement('circle',{r:20,class:'branch-toggle-ring'}));
      toggle.append(svgElement('text',{'text-anchor':'middle',y:5,'aria-hidden':'true'},expanded?'−':arabicNumber.format(count)));
      function toggleBranch(){
        const previous=toggle.getBoundingClientRect();
        if(expanded){
          const stack=[...(children.get(person.id)||[])];
          while(stack.length){
            const child=stack.pop();
            branchExpansion.delete(child.id);
            stack.push(...(children.get(child.id)||[]));
          }
        }
        branchExpansion.set(person.id,!expanded);
        renderTrees();
        const replacement=container.querySelector('[data-branch-id="'+CSS.escape(person.id)+'"]');
        const current=replacement.getBoundingClientRect();
        container.scrollLeft+=current.left-previous.left;
        container.scrollTop+=current.top-previous.top;
        replacement.focus({preventScroll:true});
      }
      toggle.addEventListener('click',toggleBranch);
      toggle.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleBranch();}
      });
      svg.append(toggle);
    }
  }
  container.append(svg);
}

byId('tree-color-mode').addEventListener('change',renderTrees);

function renderTrees() {
  const botanical=byId('tree-drawing').value==='botanical';
  const radial=byId('tree-drawing').value==='radial';
  const folded=byId('tree-drawing').value==='folded';
  const focused=byId('live-tree').classList.contains('is-focused');
  byId('botanical-zoom').hidden=!botanical&&!radial&&!folded&&!focused;
  byId('tree-overview').setAttribute('aria-pressed',String(overviewMode));
  byId('botanical-add').hidden=!botanical||!people.some(person=>person.id===selectedId&&canAddPerson(person));
  const scroll=Array.from(document.querySelectorAll('.tree-canvas'),node=>[node,node.scrollLeft,node.scrollTop]);
  const active = document.activeElement;
  const focusPersonId = active?.dataset?.personId;
  const focusBranchId = active?.dataset?.branchId;
  const focusContainer = active?.closest('.tree-canvas')?.id;
  drawTree(byId('tree-view'), treeSnapshot && {...treeSnapshot,people});
  const comparison = byId('comparison');
  const scope=byId('tree-scope').value;
  const anchor=scope==='mine'?user?.personId:scope==='branch'?selectedId:null;
  comparison.hidden = !beforeSnapshot || !!anchor && !treeSnapshot?.people.some(person=>person.id===anchor);
  if (!comparison.hidden) {
    drawTree(byId('before-tree'), beforeSnapshot);
    drawTree(byId('after-tree'), treeSnapshot);
    byId('comparison-description').textContent = 'من النسخة ' + beforeSnapshot.revision + ' إلى النسخة ' + treeSnapshot.revision;
  }
  if(focusPersonId && focusContainer){
    const replacement=[...byId(focusContainer).querySelectorAll('[data-person-id]')]
      .find(element=>element.dataset.personId===focusPersonId);
    replacement?.focus({preventScroll:true});
  }
  if(focusBranchId&&folded)byId('tree-view').querySelector('[data-branch-id="'+CSS.escape(focusBranchId)+'"]')?.focus({preventScroll:true});
  if(botanical||radial||folded||focused||inlineSelection)for(const [node,x,y] of scroll){node.scrollLeft=x;node.scrollTop=y;}
  positionTreeActions();
}

function positionTreeActions(){
  const actions=byId('tree-node-actions');
  const canvas=byId('tree-view');
  const drawing=canvas.querySelector('svg');
  if(overviewMode||treePinch||drawing&&currentDrawingScale(drawing)<0.55){actions.hidden=true;return;}
  const person=inlineSelection===selectedId&&people.find(row=>row.id===inlineSelection);
  const node=person&&canvas.querySelector('[data-person-id="'+CSS.escape(person.id)+'"]');
  if(!node){actions.hidden=true;return;}
  const buttons=actions.querySelector('.tree-node-buttons');
  buttons.hidden=!hasPersonActions(person);
  const add=actions.querySelector('[data-action="person-add"]');
  add.hidden=!canAddPerson(person);
  actions.querySelector('[data-action="person-delete"]').hidden=!managesPerson(person);
  const edit=actions.querySelector('[data-action="person-edit"]');
  edit.hidden=!managesPerson(person)&&!canInvitePerson(person);
  edit.textContent=managesPerson(person)?'تعديل':'دعوة';
  const parent=people.find(row=>row.id===person.parentId);
  const detail=byId('tree-node-detail');
  const compact=mobileTree.matches&&byId('live-tree').classList.contains('is-focused');
  byId('tree-node-name').textContent=person.name;
  detail.hidden=!compact&&botanicalZoom<detailZoomThreshold;
  detail.textContent=[parent?'الأب: '+parent.name:'أصل الشجرة',inlineAge].filter(Boolean).join(' · ');
  if(compact){
    actions.hidden=false;
    actions.style.removeProperty('left');
    actions.style.removeProperty('top');
    return;
  }
  const bounds=node.getBoundingClientRect(), frame=canvas.getBoundingClientRect();
  actions.hidden=buttons.hidden&&detail.hidden||bounds.bottom<=frame.top||bounds.top>=frame.bottom||bounds.right<=frame.left||bounds.left>=frame.right;
  if(actions.hidden)return;
  const left=(bounds.left+bounds.right)/2-frame.left-actions.offsetWidth/2;
  const top=bounds.bottom-frame.top+7;
  actions.style.left=Math.max(4,Math.min(left,frame.width-actions.offsetWidth-4))+'px';
  actions.style.top=Math.max(4,top+actions.offsetHeight<=frame.height?top:bounds.top-frame.top-actions.offsetHeight-7)+'px';
}

function refreshInlineAge(){
  const person=people.find(row=>row.id===inlineSelection);
  inlineAge='';
  positionTreeActions();
  if(!person||botanicalZoom<detailZoomThreshold||!managesPerson(person))return;
  const account=user;
  api('/api/people/'+encodeURIComponent(person.id)+'/profile').then(profile=>{
    if(user!==account||inlineSelection!==person.id)return;
    inlineAge=ageLabel(profile.birthDate,profile.lifeStatus);
    positionTreeActions();
  }).catch(()=>{});
}

function setTreeFocus(active,{moveFocus=true}={}){
  const panel=byId('live-tree'),toggle=byId('tree-focus-toggle');
  if(active&&moveFocus)focusReturn=document.activeElement;
  panel.classList.toggle('is-focused',active);
  document.body.classList.toggle('tree-focus-open',active);
  toggle.setAttribute('aria-pressed',String(active));
  toggle.textContent=active?'القائمة':'ملء الشاشة';
  toggle.setAttribute('aria-label',active?'القائمة وإنهاء ملء الشاشة':'ملء الشاشة');
  byId('botanical-fit').textContent=active?'ملاءمة':'ملاءمة الشاشة';
  byId('botanical-zoom-in').textContent=active?'+':'تكبير +';
  byId('botanical-zoom-out').textContent=active?'−':'تصغير −';
  byId('tree-overview').textContent=active?'كامل':'نظرة كاملة';
  byId('tree-overview').setAttribute('aria-label','نظرة كاملة');
  byId(active?'focused-color-slot':'standard-color-slot').append(byId('tree-color-tools'));
  byId(active?'focused-drawing-slot':'standard-drawing-slot').append(byId('tree-drawing-tools'));
  const compactOptions={
    'tree-scope':{mine:'فرعي',family:'العائلة وفرعي',shared:'الرئيسية',all:'الكل',branch:'الفرع المحدد'},
    'tree-color-mode':{relationship:'القرابة',membership:'تمييز فرعي',generation:'الأجيال',gender:'الجنس'},
    'tree-drawing':{classic:'المخطط الأصلي',folded:'الفروع',radial:'شعاعي',botanical:'نباتي'}
  };
  for(const [id,labels] of Object.entries(compactOptions))for(const option of byId(id).options){
    if(active)option.label=labels[option.value];else option.removeAttribute('label');
  }
  botanicalZoom=1;
  overviewMode=false;
  if(treeSnapshot){renderTrees();if(active)locatePerson(selectedId);}
  if(!moveFocus)return;
  if(active)toggle.focus({preventScroll:true});
  else if(user)(focusReturn?.isConnected&&byId('workspace').contains(focusReturn)&&focusReturn!==document.body?focusReturn:toggle).focus({preventScroll:true});
}

byId('tree-focus-toggle').addEventListener('click',()=>setTreeFocus(!byId('live-tree').classList.contains('is-focused')));
const treeSearchDialog=byId('tree-search-dialog');
const peoplePanel=byId('search').closest('.family-panel');
const peoplePanelHome=peoplePanel.parentElement;
byId('tree-search-open').addEventListener('click',()=>{
  treeSearchDialog.append(peoplePanel);
  treeSearchDialog.showModal();
  byId('search').focus();
});
byId('tree-search-close').addEventListener('click',()=>treeSearchDialog.close());
treeSearchDialog.addEventListener('close',()=>peoplePanelHome.prepend(peoplePanel));
byId('tree-locate').addEventListener('click',()=>byId('locate-me').click());
document.addEventListener('keydown',event=>{
  const panel=byId('live-tree');
  if(document.querySelector('dialog[open]')||!panel.classList.contains('is-focused'))return;
  if(event.key==='Escape')setTreeFocus(false);
  if(event.key==='Tab'){
    const focusable=[...panel.querySelectorAll('button:not([disabled]),select:not([disabled]),[tabindex="0"]')].filter(node=>node.getClientRects().length);
    const boundary=event.shiftKey?focusable.at(-1):focusable[0];
    if(!panel.contains(document.activeElement)||document.activeElement===(event.shiftKey?focusable[0]:focusable.at(-1))){
      event.preventDefault();
      boundary?.focus();
    }
  }
});
byId('tree-view').addEventListener('scroll',positionTreeActions,{passive:true});
byId('tree-node-actions').addEventListener('click',event=>{
  const button=event.target.closest('button[data-action]');
  if(button&&inlineSelection===selectedId)byId(button.dataset.action).click();
});

byId('tree-drawing').addEventListener('change',()=>{
  botanicalZoom=1;
  overviewMode=false;
  renderTrees();
  locatePerson(selectedId);
});
byId('tree-overview').addEventListener('click',()=>{
  overviewMode=!overviewMode;
  botanicalZoom=1;
  renderTrees();
  if(!overviewMode)locatePerson(selectedId);
});

function currentDrawingScale(svg){
  return svg.getBoundingClientRect().width/svg.viewBox.baseVal.width;
}

function drawingAnchor(svg,point){
  const bounds=svg.getBoundingClientRect();
  return {x:(point.x-bounds.left)/bounds.width,y:(point.y-bounds.top)/bounds.height};
}

function zoomDrawing(scale,point,anchor){
  const canvas=byId('tree-view'),svg=canvas.querySelector('svg');
  if(!svg)return;
  const {width,height}=svg.viewBox.baseVal;
  const fit=fitTreeScale(canvas,width,height);
  const managed=canvas.dataset.drawing||byId('live-tree').classList.contains('is-focused');
  const next=Math.max(Math.min(fit,0.35),Math.min(3,scale));
  botanicalZoom=next/(managed?Math.max(minimumReadingScale,fit):1);
  overviewMode=false;
  svg.setAttribute('width',Math.ceil(width*next));
  svg.setAttribute('height',Math.ceil(height*next));
  if(managed)svg.style.marginBlockStart=Math.max(0,(canvas.clientHeight-height*next)/2)+'px';
  const bounds=svg.getBoundingClientRect();
  canvas.scrollLeft+=bounds.left+bounds.width*anchor.x-point.x;
  canvas.scrollTop+=bounds.top+bounds.height*anchor.y-point.y;
  showScaleControls(fit,next);
  positionTreeActions();
}

for(const [id,factor] of [['botanical-zoom-in',1.25],['botanical-zoom-out',1/1.25]]){
  byId(id).addEventListener('click',()=>{
    const canvas=byId('tree-view'),svg=canvas.querySelector('svg');
    if(!svg)return;
    const frame=canvas.getBoundingClientRect();
    const selected=inlineSelection&&canvas.querySelector('[data-person-id="'+CSS.escape(inlineSelection)+'"]')?.getBoundingClientRect();
    const visible=selected&&selected.left>=frame.left&&selected.right<=frame.right&&selected.top>=frame.top&&selected.bottom<=frame.bottom;
    const bounds=visible?selected:frame;
    const point={x:(bounds.left+bounds.right)/2,y:(bounds.top+bounds.bottom)/2};
    zoomDrawing(currentDrawingScale(svg)*factor,point,drawingAnchor(svg,point));
    refreshInlineAge();
  });
}
byId('botanical-fit').addEventListener('click',()=>{
  overviewMode=false;
  botanicalZoom=1;
  renderTrees();
  locatePerson(selectedId);
  refreshInlineAge();
});

function pinchPosition(touches){
  const first=touches[0],second=touches[1];
  return {x:(first.clientX+second.clientX)/2,y:(first.clientY+second.clientY)/2,
    distance:Math.hypot(second.clientX-first.clientX,second.clientY-first.clientY)};
}

const mainTreeCanvas=byId('tree-view');
mainTreeCanvas.addEventListener('touchstart',event=>{
  if(event.touches.length!==2||treePinch)return;
  const svg=mainTreeCanvas.querySelector('svg');
  if(!svg)return;
  const point=pinchPosition(event.touches);
  if(!point.distance)return;
  if(event.cancelable)event.preventDefault();
  treePinch={distance:point.distance,scale:currentDrawingScale(svg),anchor:drawingAnchor(svg,point)};
  positionTreeActions();
},{passive:false});
mainTreeCanvas.addEventListener('touchmove',event=>{
  if(!treePinch||event.touches.length!==2)return;
  if(event.cancelable)event.preventDefault();
  const point=pinchPosition(event.touches);
  zoomDrawing(treePinch.scale*point.distance/treePinch.distance,point,treePinch.anchor);
},{passive:false});
for(const type of ['touchend','touchcancel'])mainTreeCanvas.addEventListener(type,event=>{
  if(!treePinch)return;
  if(event.cancelable)event.preventDefault();
  if(type==='touchend'&&event.touches.length)return;
  treePinch=null;
  refreshInlineAge();
},{passive:false});
byId('botanical-add').addEventListener('click',()=>{
  if(!people.some(person=>person.id===selectedId&&canAddPerson(person)))return;
  byId('child-gender').value='m';
  openAddPanel(selectedId);
});

for(const canvas of document.querySelectorAll('.tree-canvas')){
  let drag;
  let suppressClick=false;
  canvas.addEventListener('pointerdown',event=>{
    if((!canvas.dataset.drawing&&!(canvas.id==='tree-view'&&byId('live-tree').classList.contains('is-focused')))||event.pointerType!=='mouse'||event.button!==0)return;
    suppressClick=false;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:canvas.scrollLeft,top:canvas.scrollTop};
  });
  canvas.addEventListener('pointermove',event=>{
    if(drag?.id!==event.pointerId)return;
    if(!(event.buttons&1)){drag=null;return;}
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(!suppressClick&&Math.hypot(dx,dy)<8)return;
    if(!suppressClick)canvas.setPointerCapture(event.pointerId);
    suppressClick=true;
    canvas.scrollLeft=drag.left-dx;
    canvas.scrollTop=drag.top-dy;
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{drag=null;});
  canvas.addEventListener('click',event=>{
    if(suppressClick&&event.detail>0){suppressClick=false;event.stopImmediatePropagation();}
  },true);
}
window.addEventListener('resize',()=>{
  if(treeSnapshot&&(byId('tree-drawing').value!=='classic'||byId('live-tree').classList.contains('is-focused')))renderTrees();
  else positionTreeActions();
});

function locatePerson(id, container = byId('tree-view'), revealBranch = false) {
  if(!id)return false;
  const selector='[data-person-id="'+CSS.escape(id)+'"]';
  let node=container.querySelector(selector);
  if(!node&&revealBranch&&container.dataset.drawing==='folded'){
    const map=new Map(people.map(person=>[person.id,person]));
    if(!map.has(id))return false;
    const ancestry=ancestorIds(map,id);
    const scope=byId('tree-scope').value;
    const anchor=scope==='mine'?user?.personId:scope==='branch'?selectedId:null;
    if(anchor&&id!==anchor&&!ancestry.has(anchor))return false;
    if(![...container.querySelectorAll('[data-person-id]')].some(element=>ancestry.has(element.dataset.personId)))return false;
    for(const ancestor of ancestry)branchExpansion.set(ancestor,true);
    renderTrees();
    node=container.querySelector(selector);
  }
  if (!node) return false;
  const bounds = node.getBoundingClientRect();
  const parent = container.getBoundingClientRect();
  container.scrollLeft += bounds.left - parent.left - (parent.width - bounds.width)/2;
  container.scrollTop += bounds.top - parent.top - (parent.height - bounds.height)/2;
  return true;
}

function showTreeChange(personId) {
  const person = people.find(candidate => candidate.id === personId);
  const tree = byId('tree-view');
  if (!locatePerson(personId, tree, true)) locatePerson(selectedId, tree);
  if (beforeSnapshot) {
    const before = byId('before-tree');
    const after = byId('after-tree');
    if (!locatePerson(personId, before) && !locatePerson(person?.parentId, before))
      locatePerson(selectedId, before);
    if (!locatePerson(personId, after)) locatePerson(selectedId, after);
  }
  tree.scrollIntoView({block:'center',inline:'nearest'});
}

function lastChangedPerson() {
  if (!beforeSnapshot) return selectedId;
  const previous = new Map(beforeSnapshot.people.map(person => [person.id, person.name]));
  return treeSnapshot.people.find(person => !previous.has(person.id))?.id ||
    treeSnapshot.people.find(person => previous.get(person.id) !== person.name)?.id || selectedId;
}

function stopLive() {
  connectionGeneration++;
  liveConnection?.close();
  liveConnection = null;
}

function startLive() {
  stopLive();
  if(globalThis.familyPortalPreview){
    byId('live-status').textContent='تجربة محلية في هذا التبويب';
    return;
  }
  const generation = connectionGeneration;
  const connection = new EventSource('/api/live');
  liveConnection = connection;
  connection.addEventListener('open',()=>{
    if(generation===connectionGeneration)byId('live-status').textContent='متصل · التحديثات تصل مباشرة';
  });
  connection.addEventListener('tree',event=>{
    if(generation!==connectionGeneration || !user)return;
    try {
      const snapshot=JSON.parse(event.data);
      if(byId('tree-scope').value==='all')loadTree().catch(error=>notify(error.message,true));
      else applyTree(snapshot);
    }
    catch { byId('live-status').textContent='تعذر عرض التحديث. جارٍ إعادة المزامنة…'; }
  });
  connection.addEventListener('private-people',()=>{
    if(generation!==connectionGeneration || !user)return;
    Promise.all([loadTree(),loadPrivateDaughters()]).catch(error=>notify(error.message,true));
  });
  connection.addEventListener('session-expired',()=>{
    if(generation===connectionGeneration){showSignedOut();notify('انتهت الجلسة. سجّل الدخول مجددًا.');}
  });
  connection.addEventListener('error',()=>{
    if(generation===connectionGeneration)byId('live-status').textContent='انقطع الاتصال · جارٍ إعادة الاتصال';
  });
  connection.addEventListener('corrections',()=>{
    if(generation!==connectionGeneration || !user)return;
    if(byId('correction-section').open)loadCorrections().catch(error=>notify(error.message,true));
    if(byId('history-section').open)loadHistory().catch(error=>notify(error.message,true));
  });
}

function notify(message, error = false) {
  const notice = byId('notice');
  notice.textContent = message;
  notice.dataset.error = String(error);
  byId('tree-focus-status').textContent=message;
}

async function api(url, data, method = 'POST') {
  if(globalThis.familyPortalPreview)return globalThis.familyPortalPreview.request(url,data,method);
  const response = await fetch(url, data === undefined
    ? {credentials:'same-origin'}
    : {method, credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && user) showSignedOut();
    throw new Error(result.error || 'تعذّر تنفيذ الطلب. حاول مجددًا.');
  }
  return result;
}

async function submit(form, action) {
  const buttons = [...form.querySelectorAll('button')];
  const status = form.querySelector('[data-form-status]');
  buttons.forEach(button => { button.disabled = true; });
  notify('');
  if (status) status.textContent = '';
  try {
    await action();
  } catch (error) {
    if (status && user) status.textContent = error.message;
    else notify(error.message, true);
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

function showSignedOut() {
  if(treeSearchDialog.open)treeSearchDialog.close();
  branchExpansion.clear();
  radialCache=null;
  treePinch=null;
  if(byId('person-action-dialog').open)byId('person-action-dialog').close();
  batchDraft=null;
  byId('batch-preview').replaceChildren();
  byId('batch-preview').hidden=true;
  byId('batch-save').disabled=true;
  byId('history-list').replaceChildren();
  byId('corrections-list').replaceChildren();
  byId('batch-names').value='';
  byId('correction-note').value='';
  stopLive();
  user = null;
  byId('member-context').hidden=true;
  byId('member-inviter').textContent='';
  byId('member-lineage').replaceChildren();
  people = [];
  privatePeople = [];
  treeRequest++;
  selectedId = null;
  inlineSelection=null;
  inlineAge='';
  searchReturnId = null;
  treeSnapshot = null;
  beforeSnapshot = null;
  setTreeFocus(false);
  byId('tree-node-actions').hidden=true;
  byId('tree-view').replaceChildren();
  byId('before-tree').replaceChildren();
  byId('after-tree').replaceChildren();
  byId('comparison').hidden = true;
  byId('live-status').textContent = '';
  byId('workspace').hidden = true;
  byId('administration').hidden = true;
  byId('admin-link').hidden = true;
  byId('quick-add').hidden = true;
  byId('show-person-branch').hidden = true;
  byId('return-to-results').hidden = true;
  byId('edit-form').reset();
  byId('person-photo-preview').removeAttribute('src');
  byId('add-form').querySelector('[data-form-status]').textContent = '';
  byId('session').hidden = true;
  byId('access').hidden = false;
  byId('people').replaceChildren();
  byId('clear-search').hidden = true;
  byId('search-empty').hidden = true;
  byId('search-main-tree').hidden = true;
  byId('accounts').replaceChildren();
  byId('parent').replaceChildren();
  byId('invite-person').replaceChildren();
  for(const id of ['identity','person-title','person-parent','person-access','person-lineage','person-descendants','family-title','tree-count','invitation-person','daughter-invitation-person']){
    byId(id).textContent='';
  }
  for(const id of ['person-name','child-name','tree-title','search']){
    byId(id).value='';
  }
  byId('invitation-code').value = '';
  byId('invitation-password').value = '';
  byId('invitation').hidden = true;
  byId('daughter-invitation').hidden=true;
  byId('daughter-invitation-code').value='';
  byId('daughter-invitation-password').value='';
  byId('private-daughters').hidden = true;
  byId('private-daughters-list').replaceChildren();
  byId('child-gender').value='m';
  setChildForm();
}

let personAction=null;
const personDialog=byId('person-action-dialog');
const actionForms={add:'add-form',edit:'edit-form',remove:'person-delete-form'};

function resetSelectedInvitation(){
  byId('selected-invitation').hidden=true;
  byId('selected-invitation-status').textContent='';
  byId('selected-invitation-link').value='';
  byId('selected-invitation-password').value='';
  byId('selected-invitation-mail').removeAttribute('href');
}

function invitedCode(){
  const code=new URLSearchParams(location.hash.slice(1)).get('invite');
  return /^FAM-[0-9A-F]{16}$/i.test(code||'')?code.toUpperCase():'';
}

function openInvitationForm(){
  const code=invitedCode();
  if(!code)return false;
  setAccessMode(true);
  byId('code').value=code;
  byId('initial-password').focus();
  return true;
}

function setChildForm(){
  const daughter=byId('child-gender').value==='f';
  const parent=byId('parent');
  const chooseFather=daughter&&user?.role==='admin';
  const locked=personAction?.kind==='add'&&personAction.locked;
  if(locked)parent.value=personAction.id;
  else if(daughter&&!chooseFather&&user?.personId)parent.value=user.personId;
  parent.disabled=locked||(daughter&&!chooseFather);
  if(personAction?.kind==='add')byId('person-action-target').textContent=parent.selectedOptions[0]?.textContent||'';
  byId('child-name-label').textContent=daughter?'اسم الابنة الكامل':'اسم الابن الكامل';
  byId('private-child-hint').hidden=!daughter;
  byId('add-child-button').textContent=daughter
    ? chooseFather?'حفظ الابنة في فرع الأب':'إضافة إلى بناتي'
    : 'إضافة إلى الشجرة';
}

function openAction(kind,person,locked=false){
  if(personDialog.open)return null;
  const action={kind,id:person.id,locked,trigger:document.activeElement};
  personAction=action;
  resetSelectedInvitation();
  for(const id of Object.values(actionForms)){
    const form=byId(id);
    form.hidden=true;
    form.querySelector('[data-form-status]').textContent='';
  }
  byId('person-invite-panel').hidden=true;
  byId('person-action-title').textContent={add:'إضافة ابن أو ابنة',edit:'تعديل بيانات الشخص',remove:'حذف شخص',invite:'دعوة لهذا الشخص'}[kind];
  byId('person-action-target').textContent=person.name;
  byId('person-action-status').textContent='';
  personDialog.showModal();
  byId('person-action-title').focus();
  return action;
}

function openAddPanel(parentId,locked=false) {
  const person=people.find(person=>person.id===parentId&&canAddPerson(person));
  if(!person||!openAction('add',person,locked))return;
  byId('add-form').hidden=false;
  const gender=byId('child-gender');
  const daughterAllowed=user.role==='admin'||user.canAddDaughter&&(!locked||user.personId===parentId);
  gender.querySelector('option[value="f"]').disabled=!daughterAllowed;
  if(!daughterAllowed)gender.value='m';
  byId('parent').value = parentId;
  setChildForm();
  byId('child-name').focus();
}

personDialog.addEventListener('close',()=>{
  if(personDialog.open)return;
  const trigger=personAction?.trigger;
  personAction=null;
  resetSelectedInvitation();
  byId('person-invite-panel').hidden=true;
  for(const id of Object.values(actionForms))byId(id).hidden=true;
  byId('child-name').value='';
  byId('child-birth').value='';
  byId('child-photo').value='';
  byId('child-age').textContent='';
  byId('edit-form').reset();
  byId('person-photo-preview').removeAttribute('src');
  byId('person-delete-target').replaceChildren();
  if(!user)return;
  if(trigger?.isConnected&&!trigger.closest('[hidden]'))trigger.focus({preventScroll:true});
  else byId('person-title').focus({preventScroll:true});
});
byId('person-action-close').addEventListener('click',()=>personDialog.close());

function hasPermission(kind){
  return !!user&&(user.role==='admin'||user.permissions?.[kind]!==false);
}

function canAddPerson(person){
  return hasPermission('add')&&(person.addable??person.writable);
}

function managesPerson(person){
  return hasPermission('edit')&&(person.writable||person.gender==='f'&&
    (user?.role==='admin'||[person.id,person.parentId].includes(user?.personId)));
}

function canInvitePerson(person){
  return user?.role==='admin'||(hasPermission('edit')||hasPermission('add'))&&!!user.personId&&person.parentId===user.personId;
}

function hasPersonActions(person){
  return canAddPerson(person)||managesPerson(person)||canInvitePerson(person);
}

function setupInvitationPanel(person){
  byId('person-invite-panel').hidden=!canInvitePerson(person);
  configureInviteGrants('invite');
}

function configureInviteGrants(prefix){
  for(const kind of ['add','edit']){
    const box=byId(prefix+'-allow-'+kind);
    box.checked=hasPermission(kind);
    box.disabled=!hasPermission(kind);
  }
}

function inviteGrants(prefix){
  return {add:byId(prefix+'-allow-add').checked,edit:byId(prefix+'-allow-edit').checked};
}

byId('invite-selected-person').addEventListener('click',async event=>{
  const button=event.currentTarget;
  const action=personAction;
  const person=people.find(row=>row.id===action?.id);
  if(!['edit','invite'].includes(action?.kind)||!person||!canInvitePerson(person))return;
  resetSelectedInvitation();
  button.disabled=true;
  const status=byId('selected-invitation-status');
  status.textContent='جارٍ إنشاء الدعوة…';
  try{
    const permissions=inviteGrants('invite');
    const {code,initialPassword}=await api('/api/people/'+encodeURIComponent(person.id)+'/invite',{permissions});
    if(personAction!==action||!personDialog.open)return;
    const preview=!!globalThis.familyPortalPreview;
    const url=new URL(location.href);
    url.search='?welcome=family&tree=full';
    url.hash=new URLSearchParams({invite:code});
    const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    const link=byId('selected-invitation-link');
    link.value=preview?code:url.href;
    link.previousElementSibling.textContent=preview?'رمز الدعوة التجريبية':'رابط التفعيل';
    byId('selected-invitation-password').value=initialPassword;
    byId('selected-invitation-info').textContent=preview?'الدعوة التجريبية محفوظة في هذا التبويب فقط.':local
      ? 'عنوان هذا الخادم محلي. افتح البوابة من عنوان يستطيع المدعو الوصول إليه لمشاركة الدعوة.'
      : 'شارك الرابط، ثم أرسل كلمة المرور المؤقتة على انفراد خلال ٢٤ ساعة.';
    const mail=byId('selected-invitation-mail');
    mail.hidden=preview||local;
    if(!preview){
      const greeting=user?.personId&&user.personId===person.parentId?'دعوة من والدك للاطلاع على شجرة العائلة.':'دعوة للاطلاع على شجرة العائلة.';
      const body=greeting+' افتح رابط التفعيل، وسأرسل لك كلمة المرور المؤقتة على انفراد.\n\n'+url.href;
      mail.href='mailto:?subject='+encodeURIComponent('دعوة إلى شجرة العائلة')+'&body='+encodeURIComponent(body);
    }
    byId('selected-invitation').hidden=false;
    status.textContent='أُنشئت الدعوة.';
  }catch(error){
    if(personAction===action&&personDialog.open)status.textContent=error.message;
  }finally{button.disabled=false;}
});

byId('copy-selected-invitation').addEventListener('click',async()=>{
  const input=byId('selected-invitation-link');
  const status=byId('selected-invitation-status');
  try{
    await navigator.clipboard.writeText(input.value);
    status.textContent='تم النسخ.';
  }catch{
    input.focus();
    input.select();
    status.textContent='حدّدت النص. يمكنك نسخه الآن.';
  }
});

byId('person-add').addEventListener('click',()=>openAddPanel(selectedId,true));
for(const [button,kind,endpoint] of [['person-edit','edit','profile'],['person-delete','remove','remove-options']]){
  byId(button).addEventListener('click',async()=>{
    const person=people.find(row=>row.id===selectedId);
    if(!person)return;
    if(kind==='edit'&&!managesPerson(person)&&canInvitePerson(person)){
      if(openAction('invite',person))setupInvitationPanel(person);
      return;
    }
    if(!managesPerson(person))return;
    const action=openAction(kind,person);
    if(!action)return;
    const status=byId('person-action-status');
    status.textContent='جارٍ التحميل…';
    try{
      const result=await api('/api/people/'+encodeURIComponent(action.id)+'/'+endpoint);
      if(!personDialog.open||personAction!==action)return;
      status.textContent='';
      const form=byId(actionForms[kind]);
      form.reset();
      if(kind==='edit'){
        setupInvitationPanel(person);
        for(const [id,key] of [['person-name','name'],['person-life','lifeStatus'],['person-phone','phone'],['person-email','email'],['person-birth','birthDate']]){
          byId(id).value=result[key]||'';
        }
        action.gender=result.gender||person.gender||'m';
        byId('person-gender').value=action.gender;
        byId('person-gender').disabled=!result.canChangeGender;
        byId('person-gender-hint').hidden=false;
        byId('person-gender-hint').textContent=result.canChangeGender
          ? 'تغيير الجنس يغيّر نطاق ظهور الاسم في الشجرة.' : (result.genderChangeReason||'تعديل الجنس متاح للمدير للسجلات غير المرتبطة.');
        updateAgeOutputs();
        const image=byId('person-photo-preview');
        if(result.photo)image.src=result.photo;
        image.hidden=!result.photo;
        byId('person-photo-remove-label').hidden=!result.photo;
      }else{
        if(!result.options.length){
          status.textContent='لا توجد سجلات قابلة للحذف هنا. يُحمى أصل الشجرة ومن له أبناء أو حساب مرتبط.';
          return;
        }
        const select=byId('person-delete-target');
        select.replaceChildren(new Option('اختر اسمًا',''),...result.options.map(row=>
          new Option((row.id===action.id?'الشخص المحدد':row.gender==='f'?'ابنة':'ابن')+' · '+row.name,row.id)));
        if(result.options.some(row=>row.id===action.id))select.value=action.id;
      }
      form.hidden=false;
    }catch(error){
      if(personDialog.open&&personAction===action)status.textContent=error.message;
    }
  });
}

byId('quick-add').addEventListener('click', () => {
  const parent = people.find(person => canAddPerson(person) && person.id === selectedId)
    || people.find(person => canAddPerson(person) && person.id === user?.personId)
    || people.find(canAddPerson);
  if (!parent) return;
  selectPerson(parent.id);
  openAddPanel(parent.id);
});

byId('show-person-branch').addEventListener('click', () => {
  const scope = byId('tree-scope');
  if (scope.value !== 'branch') {
    scope.value = 'branch';
    scope.dispatchEvent(new Event('change'));
  }
  const tree = byId('tree-view');
  tree.focus({preventScroll:true});
  tree.scrollIntoView({block:'nearest'});
});

async function loadPrivateDaughters(){
  const account=user;
  if(!account?.canAddDaughter)return;
  const {daughters}=await api('/api/private-daughters');
  if(user!==account)return;
  const items=daughters.map(daughter=>{
    const item=document.createElement('li');
    const endpoint='/api/private-daughters/'+encodeURIComponent(daughter.id);
    const name=document.createElement('span');
    name.textContent=daughter.name;
    const status=document.createElement('small');
    status.className='hint';
    status.textContent={active:'حساب مفعّل',invited:'دعوة بانتظار التفعيل',inactive:'حساب بانتظار دعوة جديدة',none:'بلا حساب'}[daughter.accountStatus]||'';
    const editing=document.createElement('form');
    editing.method='post';
    editing.hidden=true;
    editing.className='daughter-rename';
    const nameInput=document.createElement('input');
    nameInput.value=daughter.name;
    nameInput.required=true;
    nameInput.maxLength=300;
    nameInput.setAttribute('aria-label','اسم الابنة الكامل');
    const save=document.createElement('button');
    save.type='submit';
    save.textContent='حفظ اسم الابنة';
    const cancel=document.createElement('button');
    cancel.type='button';
    cancel.textContent='إلغاء';
    editing.append(nameInput,save,cancel);
    const rename=document.createElement('button');
    rename.type='button';
    rename.hidden=!hasPermission('edit');
    rename.textContent='تعديل الاسم';
    rename.setAttribute('aria-label','تعديل اسم '+daughter.name);
    rename.addEventListener('click',()=>{
      editing.hidden=false;
      nameInput.focus();
    });
    cancel.addEventListener('click',()=>{
      nameInput.value=daughter.name;
      editing.hidden=true;
      rename.focus();
    });
    editing.addEventListener('submit',event=>{
      event.preventDefault();
      submit(editing,async()=>{
        await api(endpoint,{name:nameInput.value.trim()},'PATCH');
        if(user!==account)return;
        await Promise.all([loadTree(),loadPrivateDaughters()]);
        notify('حُفظ اسم الابنة.');
      });
    });
    const invite=document.createElement('button');
    invite.type='button';
    const recover=daughter.accountStatus==='active';
    invite.hidden=recover?!hasPermission('edit'):!hasPermission('edit')&&!hasPermission('add');
    invite.textContent=recover?'استعادة الدخول':daughter.accountStatus==='invited'?'تجديد الدعوة':'إنشاء دعوة';
    invite.setAttribute('aria-label',(recover?'استعادة دخول ':'دعوة ')+daughter.name);
    invite.addEventListener('click',()=>submit(item,async()=>{
      if(recover&&!window.confirm('ستُنهى الجلسات الحالية وتُصدر كلمة مرور مؤقتة جديدة. هل تريد المتابعة؟'))return;
      byId('daughter-invitation').hidden=true;
      byId('daughter-invitation-code').value='';
      byId('daughter-invitation-password').value='';
      const invitation=await api(endpoint+(recover?'/recover':'/invite'),recover?{}:{permissions:inviteGrants('daughter-invite')});
      if(user!==account)return;
      byId('daughter-invitation-person').textContent='دعوة لـ '+daughter.name;
      byId('daughter-invitation-code').value=invitation.code;
      byId('daughter-invitation-password').value=invitation.initialPassword;
      byId('daughter-invitation').hidden=false;
      await loadPrivateDaughters();
      notify('أُنشئت الدعوة. سلّمها لصاحبة الحساب على انفراد.');
    }));
    item.append(name,status,rename,invite,editing);
    return item;
  });
  byId('private-daughters-list').replaceChildren(...items);
  byId('private-daughters-empty').hidden=items.length>0;
  byId('daughter-grants').hidden=!items.length||!hasPermission('add')&&!hasPermission('edit');
  byId('private-daughters').hidden=false;
}

function setAccessMode(activate) {
  byId('login-form').hidden = activate;
  byId('activate-form').hidden = !activate;
  byId('show-login').setAttribute('aria-pressed', String(!activate));
  byId('show-activate').setAttribute('aria-pressed', String(activate));
}

function option(person) {
  const item = document.createElement('option');
  item.value = person.id;
  const parent = people.find(candidate => candidate.id === person.parentId);
  item.textContent = person.name + (parent ? (person.gender==='f'?' — ابنة ':' — ابن ') + parent.name : ' — أصل الشجرة');
  return item;
}

function selectPerson(id) {
  selectedId = id;
  const person = people.find(candidate => candidate.id === id);
  if (!person) return;
  const parent = people.find(candidate => candidate.id === person.parentId);
  byId('person-title').textContent = person.name;
  byId('person-parent').textContent = parent ? 'الأب · ' + parent.name : 'أصل الشجرة';
  const family = descendants(people,id);
  const children = people.filter(candidate=>candidate.parentId===id).length;
  byId('person-descendants').textContent = children + ' أبناء · ' + Math.max(0,family.size-1-children) + ' أحفاد وذرية';
  const lineage = [person.name];
  let ancestor = parent;
  const seen = new Set([id]);
  while(ancestor && !seen.has(ancestor.id)){
    seen.add(ancestor.id);
    lineage.push(ancestor.name);
    ancestor=people.find(candidate=>candidate.id===ancestor.parentId);
  }
  byId('person-lineage').textContent = 'النسب · ' + lineage.join(' ← ');
  byId('person-access').textContent = [managesPerson(person)?'التعديل متاح':'',canAddPerson(person)?'الإضافة متاحة':'']
    .filter(Boolean).join(' · ') || 'يمكنك الاطلاع على هذا السجل.';
  byId('person-quick-actions').hidden=!hasPersonActions(person);
  byId('person-add').hidden=!canAddPerson(person);
  byId('person-delete').hidden=!managesPerson(person);
  byId('person-edit').hidden=!managesPerson(person)&&!canInvitePerson(person);
  byId('person-edit').textContent=managesPerson(person)?'تعديل':'دعوة';
  byId('show-person-branch').hidden = !treeSnapshot?.people.some(candidate => candidate.id === id);
  if (canAddPerson(person) && (user?.role==='admin'||byId('child-gender').value==='m')) byId('parent').value = person.id;
  for (const button of byId('people').querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.personId === id));
  }
  renderTrees();
}

function openPersonCard(id, fromResults = false, inTree = false, keyboard = false) {
  const fromTreeSearch=fromResults&&treeSearchDialog.open;
  if(fromTreeSearch){
    treeSearchDialog.close();
    byId('search').value='';
    renderPeople();
    inTree=true;
    fromResults=false;
  }
  const restoreReading=inTree&&overviewMode;
  if(restoreReading){overviewMode=false;botanicalZoom=1;}
  inlineSelection=inTree?id:null;
  inlineAge='';
  searchReturnId = fromResults ? id : null;
  byId('return-to-results').hidden = !fromResults;
  selectPerson(id);
  if(inTree){
    if(restoreReading||fromTreeSearch)locatePerson(id,byId('tree-view'),fromTreeSearch);
    refreshInlineAge();
    const actions=byId('tree-node-actions');
    if(keyboard&&!actions.hidden)actions.querySelector('button:not([hidden])')?.focus({preventScroll:true});
    return;
  }
  if(fromResults&&byId('tree-view').dataset.drawing==='folded')locatePerson(id,byId('tree-view'),true);
  const title = byId('person-title');
  title.focus({preventScroll:true});
  title.scrollIntoView({block:matchMedia('(max-width:760px)').matches?'start':'nearest'});
}

byId('return-to-results').addEventListener('click', () => {
  const result = [...byId('people').querySelectorAll('button')].find(button => button.dataset.personId === searchReturnId);
  const target = result || byId('search');
  target.focus({preventScroll:true});
  byId('search').scrollIntoView({block:'nearest'});
  target.scrollIntoView({block:'nearest'});
});

function renderPeople() {
  const search = byId('search').value.trim();
  const map = new Map(people.map(person => [person.id, person]));
  const depths = new Map();
  function depth(person) {
    if (depths.has(person.id)) return depths.get(person.id);
    let current = person;
    let level = 0;
    const visited = new Set([person.id]);
    while (current.parentId && map.has(current.parentId) && !visited.has(current.parentId)) {
      visited.add(current.parentId);
      level++;
      current = map.get(current.parentId);
    }
    depths.set(person.id, level);
    return level;
  }
  const children = new Map();
  for (const person of people) {
    if (!children.has(person.parentId)) children.set(person.parentId, []);
    children.get(person.parentId).push(person);
  }
  const ordered = [];
  const visited = new Set();
  function visit(person) {
    if (visited.has(person.id)) return;
    visited.add(person.id);
    ordered.push(person);
    for (const child of children.get(person.id) || []) visit(child);
  }
  people.filter(person => !map.has(person.parentId)).forEach(visit);
  people.forEach(visit);
  const ownBranch=byId('tree-scope').value==='mine'?descendants(people,user?.personId):null;
  const shown = ordered.filter(person => (!ownBranch||ownBranch.has(person.id)) &&
    (!search||person.name.includes(search)));
  byId('clear-search').hidden = !byId('search').value;
  byId('search-empty').hidden = !search || shown.length > 0;
  byId('search-main-tree').hidden = !ownBranch;
  const list = byId('people');
  list.replaceChildren();
  for (const person of shown) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'person-row';
    button.dataset.personId = person.id;
    button.setAttribute('aria-pressed', String(selectedId === person.id));
    button.classList.add('depth-' + Math.min(depth(person), 6));
    const name = document.createElement('span');
    const label = document.createElement('span');
    label.className = 'person-result';
    name.className = 'person-name';
    name.textContent = person.name;
    label.append(name);
    const parent = map.get(person.parentId);
    if (parent) {
      const context = document.createElement('small');
      context.className = 'person-result-context';
      context.textContent = 'الأب · ' + parent.name;
      label.append(context);
    }
    button.append(label);
    if (person.writable) {
      const access = document.createElement('small');
      access.textContent = 'متاح للتعديل';
      button.append(access);
    }
    button.addEventListener('click', () => openPersonCard(person.id,true));
    list.append(button);
  }
  byId('tree-count').textContent = search
    ? shown.length + ' نتيجة'
    : shown.length + ' فردًا في العرض الحالي';
}

async function loadAccounts() {
  const {accounts} = await api('/api/accounts');
  const list = byId('accounts');
  list.replaceChildren();
  for (const account of accounts) {
    const row = document.createElement('div');
    row.className = 'account';
    const content = document.createElement('div');
    const identifier = document.createElement('p');
    identifier.textContent = account.identifier;
    const detail = document.createElement('small');
    const person = people.find(candidate => candidate.id === account.personId);
    detail.textContent = (account.role === 'admin' ? 'مدير عام' : person?.name || 'عضو') +
      ' · ' + (account.active ? 'حساب مفعّل' : 'حساب غير مفعّل');
    content.append(identifier, detail);
    row.append(content);
    if (account.role !== 'admin' && account.active) {
      const revoke = document.createElement('button');
      revoke.type = 'button';
      revoke.textContent = 'إيقاف الصلاحية';
      revoke.setAttribute('aria-label', 'إيقاف صلاحية ' + account.identifier);
      revoke.addEventListener('click', async () => {
        if (!window.confirm('إيقاف صلاحية هذا الحساب وتسجيل خروجه؟')) return;
        revoke.disabled = true;
        try {
          await api('/api/accounts/' + encodeURIComponent(account.id) + '/revoke', {});
          await loadAccounts();
          notify('أُوقفت صلاحية الحساب.');
        } catch (error) {
          notify(error.message, true);
          revoke.disabled = false;
        }
      });
      row.append(revoke);
    }
    list.append(row);
  }
}

function applyTree(result,forcePrivate=false) {
  if(!user || !Array.isArray(result.people))return false;
  if(treeSnapshot && Number.isFinite(result.revision) && result.revision<treeSnapshot.revision)return false;
  const newer=!treeSnapshot || result.revision>treeSnapshot.revision;
  if(!newer && !forcePrivate)return false;
  const nextPrivate=visiblePrivatePeople(Array.isArray(result.privatePeople)?result.privatePeople:[]);
  if(!newer && JSON.stringify(nextPrivate)===JSON.stringify(privatePeople))return false;
  const firstSnapshot = !treeSnapshot;
  const currentParent=byId('parent').value;
  const editing = document.activeElement?.closest('#add-form, #title-form');
  const draft = editing ? [...editing.querySelectorAll('input,select')].map(input=>[input,input.value]) : [];
  if(newer){
    beforeSnapshot = result.before || treeSnapshot;
    treeSnapshot = {title:result.title,people:result.people,revision:result.revision};
  }
  privatePeople = nextPrivate;
  people = [...treeSnapshot.people,...privatePeople];
  byId('tree-title').value = result.title || 'شجرة العائلة';
  byId('family-title').textContent = byId('tree-title').value;
  byId('workspace-name').textContent = byId('tree-title').value;
  const addable = people.filter(canAddPerson);
  const oldBatchParent=byId('batch-parent').value;
  byId('batch-parent').replaceChildren(...addable.map(option));
  if([...byId('batch-parent').options].some(item=>item.value===oldBatchParent))byId('batch-parent').value=oldBatchParent;
  byId('batch-section').hidden=!addable.length;
  refreshCorrectionChoices();
  byId('parent').replaceChildren(...addable.map(option));
  byId('invite-person').replaceChildren(...treeSnapshot.people.map(option));
  renderPeople();
  const current = people.find(person => person.id === selectedId);
  const initial = current || people.find(person => person.id === user.personId) || addable[0] || people[0];
  if (initial) selectPerson(initial.id);
  if(addable.some(person=>person.id===currentParent))byId('parent').value=currentParent;
  if(personAction&&!people.some(person=>person.id===personAction.id&&({add:canAddPerson,invite:canInvitePerson,
    edit:managesPerson,remove:managesPerson}[personAction.kind])(person)))personDialog.close();
  byId('quick-add').hidden = addable.length === 0;
  for(const [input,value] of draft){
    if(input.tagName!=='SELECT' || [...input.options].some(option=>option.value===value))input.value=value;
  }
  setChildForm();
  renderMemberContext();
  if (firstSnapshot) locatePerson(initial?.id,byId('tree-view'),true);
  return true;
}

async function loadTree() {
  const account = user;
  const request=++treeRequest;
  const scope=byId('tree-scope').value;
  const result = await api('/api/tree'+(scope==='all'?'?scope=all':''));
  if(!account || user!==account || request!==treeRequest || scope!==byId('tree-scope').value)return;
  applyTree(result,true);
  if (account.role === 'admin') await loadAccounts();
}

function renderMemberContext(){
  const personId=user?.personId;
  const visible=new Map(people.map(person=>[person.id,person]));
  const chain=visible.has(personId)?[...ancestorIds(visible,personId)].map((id,index)=>({id,name:visible.get(id).name,
    relationship:index===0?'father':index===1?'grandfather':'ancestor'})):user?.lineage||[];
  const sender=user?.invitedBy;
  const inviter=byId('member-inviter');
  const permissions=personId?permissionLabel():'';
  inviter.textContent=[sender?.name?(sender.relationship==='father'?'الدعوة من والدك: ':'الدعوة من ')+sender.name:'',permissions].filter(Boolean).join(' · ');
  inviter.hidden=!inviter.textContent;
  byId('member-lineage').replaceChildren(...chain.map(row=>{
    const button=document.createElement('button');
    button.type='button';
    button.textContent=({father:'الأب',grandfather:'الجد',ancestor:'من الأجداد'}[row.relationship]||'من الأجداد')+' · '+row.name;
    button.addEventListener('click',()=>{
      if(!people.some(person=>person.id===row.id))return;
      const scope=byId('tree-scope');
      if(['mine','branch'].includes(scope.value)){
        scope.value='family';
        scope.dispatchEvent(new Event('change'));
      }
      selectPerson(row.id);
      locatePerson(row.id, byId('tree-view'), true);
    });
    return button;
  }));
  byId('member-context').hidden=!personId||!chain.length&&inviter.hidden;
}

function permissionLabel(){
  if(hasPermission('add')&&hasPermission('edit'))return 'إضافة وتعديل ضمن الفرع';
  if(hasPermission('add'))return 'إضافة ضمن الفرع';
  if(hasPermission('edit'))return 'تعديل ضمن الفرع';
  return 'مشاهدة فقط';
}

async function enter() {
  user = await api('/api/me');
  const params=new URLSearchParams(location.search);
  const expanded=params.get('tree')==='full'||(params.get('tree')!=='page'&&mobileTree.matches);
  const drawing=byId('tree-drawing');
  const layout=params.get('layout');
  const requestedLayout=['browse','generations'].includes(layout)?'folded':layout;
  drawing.value=[...drawing.options].some(option=>option.value===requestedLayout)
    ? requestedLayout : expanded&&mobileTree.matches?'folded':'classic';
  const familyView=!!user.personId&&params.get('welcome')==='family';
  const scope=byId('tree-scope');
  scope.querySelector('option[value="mine"]').hidden=!user.personId;
  scope.querySelector('option[value="family"]').hidden=!user.personId;
  scope.value=familyView?'family':user.personId?'mine':'shared';
  const colorMode=byId('tree-color-mode');
  colorMode.querySelector('option[value="membership"]').hidden=!user.personId;
  colorMode.value=familyView?'membership':'relationship';
  byId('access').hidden = true;
  byId('workspace').hidden = false;
  byId('session').hidden = false;
  byId('identity').textContent = user.identifier;
  byId('workspace-role').textContent = user.role === 'admin' ? 'لوحة المدير' : 'بوابة العائلة';
  byId('live-tree-title').textContent = user.personId ? 'موقعك في شجرة العائلة' : 'شجرة العائلة';
  byId('locate-me').textContent = user.personId ? 'موقعي في الشجرة' : 'اعرض أصل الشجرة';
  byId('tree-locate').textContent=user.personId?'موقعي':'الأصل';
  byId('permission-summary').textContent = user.role === 'admin'
    ? 'أنت المدير العام. يمكنك إدارة جميع الأفراد وحسابات العائلة.'
    : permissionLabel()+'. اختر «الكل» للاطلاع على الأسماء المتاحة للعائلة.';
  byId('administration').hidden = user.role !== 'admin';
  byId('admin-link').hidden = user.role !== 'admin';
  configureInviteGrants('daughter-invite');
  configureInviteGrants('admin-invite');
  byId('child-gender').querySelector('option[value="f"]').disabled=!(user.role==='admin'||user.canAddDaughter);
  if(expanded)setTreeFocus(true,{moveFocus:false});
  await loadTree();
  await loadPrivateDaughters();
  startLive();
}

byId('show-login').addEventListener('click', () => setAccessMode(false));
byId('show-activate').addEventListener('click', () => setAccessMode(true));
byId('search').addEventListener('input', renderPeople);
byId('clear-search').addEventListener('click', () => {
  byId('search').value = '';
  renderPeople();
  byId('search').focus();
});
byId('search-main-tree').addEventListener('click', () => {
  const scope = byId('tree-scope');
  if (scope.value !== 'mine') return;
  scope.value = 'shared';
  scope.dispatchEvent(new Event('change'));
  byId('search').focus();
});
byId('child-gender').addEventListener('change',setChildForm);
byId('parent').addEventListener('change',setChildForm);
function discardOutOfScopePeople(){
  treeRequest++;
  privatePeople=visiblePrivatePeople(privatePeople.filter(person=>person.id===user?.personId || person.parentId===user?.personId));
  people=[...(treeSnapshot?.people||[]),...privatePeople];
}
byId('tree-scope').addEventListener('change',()=>{
  discardOutOfScopePeople();
  if(byId('tree-scope').value==='mine' && !descendants(people,user?.personId).has(selectedId))
    selectPerson(user.personId);
  else if(!people.some(person=>person.id===selectedId))
    selectPerson(user?.personId || people[0]?.id);
  else renderTrees();
  renderPeople();
  locatePerson(selectedId);
  loadTree().catch(error=>notify(error.message,true));
});
byId('locate-me').addEventListener('click',()=>{
  const id=user?.personId || people.find(person=>!person.parentId)?.id;
  if(id){
    byId('tree-scope').value=user?.personId?'mine':'shared';
    discardOutOfScopePeople();
    selectPerson(id);
    renderPeople();
    locatePerson(id, byId('tree-view'), true);
    loadTree().catch(error=>notify(error.message,true));
  }
});

byId('login-form').addEventListener('submit', event => {
  event.preventDefault();
  submit(event.currentTarget, async () => {
    await api('/api/login', {identifier:byId('identifier').value.trim(), password:byId('password').value});
    byId('password').value = '';
    await enter();
  });
});

byId('activate-form').addEventListener('submit', event => {
  event.preventDefault();
  submit(event.currentTarget, async () => {
    await api('/api/activate', {
      code:byId('code').value.trim(), initialPassword:byId('initial-password').value.trim(),
      password:byId('new-password').value
    });
    byId('activate-form').reset();
    if(invitedCode())history.replaceState(null,'',location.pathname+location.search);
    setAccessMode(false);
    await enter();
    notify('تم تفعيل حسابك.');
  });
});

byId('logout').addEventListener('click', () => submit(byId('session'), async () => {
  await api('/api/logout', {});
  showSignedOut();
  if(!openInvitationForm())byId('identifier').focus();
}));

byId('refresh').addEventListener('click', () => submit(byId('workspace'), async () => {
  await loadTree();
  await loadPrivateDaughters();
  showTreeChange(lastChangedPerson());
  notify('حُدّثت الشجرة.');
}));

async function profilePhoto(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024)
    throw Error('اختر صورة JPEG أو PNG أو WebP بحجم لا يزيد على ١٥ ميغابايت.');
  let bitmap;
  try{bitmap=await createImageBitmap(file);}catch{throw Error('تعذر قراءة الصورة المختارة.');}
  try{
    const canvas=document.createElement('canvas');
    const scale=Math.min(1,360/Math.max(bitmap.width,bitmap.height));
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const context=canvas.getContext('2d');
    context.fillStyle='#fff';
    context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',0.78);
  }finally{bitmap.close();}
}

function dateParts(date){
  return [date.getFullYear(),date.getMonth()+1,date.getDate()];
}

function ageLabel(birthDate,lifeStatus){
  if(!birthDate||lifeStatus==='deceased')return '';
  const [year,month,day]=birthDate.split('-').map(Number);
  const [currentYear,currentMonth,currentDay]=dateParts(new Date());
  const age=currentYear-year-Number(month>currentMonth||month===currentMonth&&day>currentDay);
  return age>=0?'العمر: '+arabicNumber.format(age)+' سنة':'';
}

function updateAgeOutputs(){
  byId('person-age').textContent=ageLabel(byId('person-birth').value,byId('person-life').value);
  byId('child-age').textContent=ageLabel(byId('child-birth').value);
}

const maxBirthDate=dateParts(new Date()).map(part=>String(part).padStart(2,'0')).join('-');
for(const id of ['person-birth','child-birth']){
  byId(id).max=maxBirthDate;
  byId(id).addEventListener('input',updateAgeOutputs);
}
byId('person-life').addEventListener('change',updateAgeOutputs);

byId('edit-form').addEventListener('submit', event => {
  event.preventDefault();
  const action=personAction;
  if(action?.kind!=='edit')return;
  submit(event.currentTarget, async () => {
    const data={name:byId('person-name').value.trim(),lifeStatus:byId('person-life').value,
      phone:byId('person-phone').value.trim(),email:byId('person-email').value.trim(),birthDate:byId('person-birth').value};
    if(!byId('person-gender').disabled&&byId('person-gender').value!==action.gender)data.gender=byId('person-gender').value;
    const file=byId('person-photo').files[0];
    if(file)data.photo=await profilePhoto(file);
    else if(byId('person-photo-remove').checked)data.photo='';
    if(personAction!==action||!personDialog.open)return;
    await api('/api/people/'+encodeURIComponent(action.id)+'/profile',data,'PATCH');
    if(data.gender==='f'&&user?.role==='admin')byId('tree-scope').value='all';
    if(personAction===action)personDialog.close();
    await loadTree();
    if(user?.canAddDaughter)await loadPrivateDaughters();
    refreshInlineAge();
    notify('حُفظت بيانات الشخص.');
  });
});

byId('person-delete-form').addEventListener('submit',event=>{
  event.preventDefault();
  const action=personAction;
  if(action?.kind!=='remove'||!byId('person-delete-confirm').checked)return;
  const id=byId('person-delete-target').value;
  if(!id)return;
  submit(event.currentTarget,async()=>{
    await api('/api/people/'+encodeURIComponent(id),{anchor:action.id},'DELETE');
    if(personAction===action)personDialog.close();
    await loadTree();
    if(user?.canAddDaughter)await loadPrivateDaughters();
    notify('حُذف السجل المحدد.');
  });
});

byId('add-form').addEventListener('submit', event => {
  event.preventDefault();
  const action=personAction;
  if(action?.kind!=='add')return;
  submit(event.currentTarget, async () => {
    const gender=byId('child-gender').value;
    const parentId=action.locked?action.id:byId('parent').value;
    const data={parentId,gender,name:byId('child-name').value.trim(),birthDate:byId('child-birth').value};
    const photo=byId('child-photo').files[0];
    if(photo)data.photo=await profilePhoto(photo);
    if(personAction!==action||!personDialog.open)return;
    const result=await api('/api/people',data);
    byId('child-name').value = '';
    if(personAction===action)personDialog.close();
    if(result.private){
      await loadTree();
      if(user?.canAddDaughter && user.personId===parentId){
        await loadPrivateDaughters();
        byId('private-daughters-title').focus();
        notify('حُفظ اسم الابنة في قسم بناتي.');
      }else{
        notify('حُفظت الابنة، وستظهر للأب في قسم «بناتي».');
      }
      return;
    }
    await loadTree();
    if(!user)return;
    selectPerson(parentId);
    showTreeChange(result.id);
    notify('أُضيف الابن إلى الشجرة.');
  });
});

byId('invite-form').addEventListener('submit', event => {
  event.preventDefault();
  submit(event.currentTarget, async () => {
    const personId=byId('invite-person').value;
    const person=people.find(candidate=>candidate.id===personId);
    byId('invitation').hidden=true;
    byId('invitation-code').value='';
    byId('invitation-password').value='';
    const invitation = await api('/api/invites', {
      personId,permissions:inviteGrants('admin-invite')
    });
    byId('invitation-person').textContent='دعوة لـ '+person.name;
    byId('invitation-code').value = invitation.code;
    byId('invitation-password').value = invitation.initialPassword;
    byId('invitation').hidden = false;
    await loadAccounts();
    notify('أُنشئت الدعوة. سلّم الرمز وكلمة المرور المؤقتة لصاحب الحساب.');
  });
});

byId('title-form').addEventListener('submit', event => {
  event.preventDefault();
  submit(event.currentTarget, async () => {
    await api('/api/tree', {title:byId('tree-title').value.trim()}, 'PATCH');
    await loadTree();
    notify('حُفظ عنوان الشجرة.');
  });
});

byId('copy-invitation').addEventListener('click', async () => {
  const input = byId('invitation-code');
  try {
    await navigator.clipboard.writeText('رمز الدعوة: ' + input.value +
      '\nكلمة المرور المؤقتة: ' + byId('invitation-password').value);
    notify('نُسخت بيانات الدعوة.');
  } catch {
    input.focus();
    input.select();
    notify('يمكنك نسخ الرمز وكلمة المرور المؤقتة كلًّا على حدة.');
  }
});

byId('copy-daughter-invitation').addEventListener('click',async()=>{
  const code=byId('daughter-invitation-code');
  try {
    await navigator.clipboard.writeText('رمز الدعوة: '+code.value+'\nكلمة المرور المؤقتة: '+byId('daughter-invitation-password').value);
    notify('نُسخت بيانات الدعوة.');
  } catch {
    code.focus();
    code.select();
    notify('يمكنك نسخ الرمز وكلمة المرور المؤقتة كلًّا على حدة.');
  }
});

function refreshCorrectionChoices(){
  const source=treeSnapshot?.people || [];
  const own=source.filter(person=>person.parentId && person.writable);
  const current=byId('correction-person').value;
  const chosen=own.find(person=>person.id===current)||own[0];
  const merging=byId('correction-kind').value==='merge';
  const targets=merging&&chosen
    ? source.filter(person=>person.id!==chosen.id&&person.name===chosen.name&&person.parentId===chosen.parentId)
    : source;
  for(const [id,rows] of [['correction-person',own],['correction-parent',targets]]){
    const select=byId(id),value=select.value;
    select.replaceChildren(...rows.map(option));
    if(rows.some(person=>person.id===value))select.value=value;
  }
  byId('correction-form').hidden=!own.length;
  byId('correction-parent-label').textContent=byId('correction-kind').value==='merge'?'السجل الذي سيبقى بعد الدمج':'الأب الصحيح';
}

function clearBatchPreview(){
  batchDraft=null;
  byId('batch-preview').hidden=true;
  byId('batch-save').disabled=true;
}
byId('batch-names').addEventListener('input',clearBatchPreview);
byId('batch-parent').addEventListener('change',clearBatchPreview);
byId('batch-preview-button').addEventListener('click',()=>{
  clearBatchPreview();
  const names=byId('batch-names').value.split(/\r?\n/).map(name=>name.trim()).filter(Boolean);
  if(!names.length||names.length>50||names.some(name=>name.length>300)){
    notify('أدخل من ١ إلى ٥٠ اسمًا، بحد ٣٠٠ حرف للاسم.',true);return;
  }
  if(new Set(names.map(name=>name.normalize('NFC'))).size!==names.length){notify('توجد أسماء مكررة داخل الدفعة. راجعها قبل الحفظ.',true);return;}
  const parentId=byId('batch-parent').value;
  const parent=people.find(person=>person.id===parentId&&canAddPerson(person));
  if(!parent){notify('اختر أبًا ضمن صلاحيتك.',true);return;}
  batchDraft={parentId,names,revision:treeSnapshot.revision};
  const heading=document.createElement('p');
  heading.textContent='الأب: '+parent.name+' — '+names.length+' أبناء';
  const list=document.createElement('ol');
  for(const name of names){const item=document.createElement('li');item.textContent=name;list.append(item);}
  byId('batch-preview').replaceChildren(heading,list);
  byId('batch-preview').hidden=false;
  byId('batch-save').disabled=false;
});
byId('batch-form').addEventListener('submit',event=>{
  event.preventDefault();
  const draft=batchDraft;
  submit(event.currentTarget,async()=>{
    if(!draft||draft.revision!==treeSnapshot.revision){clearBatchPreview();throw Error('تغيّرت الشجرة. أعد معاينة الدفعة قبل حفظها.');}
    await api('/api/people/batch',{parentId:draft.parentId,names:draft.names});
    byId('batch-names').value='';
    clearBatchPreview();
    await loadTree();
    notify('حُفظت دفعة الأبناء.');
  }).then(()=>{byId('batch-save').disabled=!batchDraft;});
});

function personLabel(id){return treeSnapshot?.people.find(person=>person.id===id)?.name || id;}
async function loadHistory(){
  const account=user;
  const {entries}=await api('/api/history');
  if(user!==account)return;
  const items=entries.map(entry=>{
    const item=document.createElement('li');
    const date=new Date(entry.at);
    item.textContent=(Number.isNaN(date.valueOf())?'':date.toLocaleString('ar-SA')+' · ')+
      entry.actor+' · '+entry.summary;
    return item;
  });
  byId('history-list').replaceChildren(...items);
  if(!items.length){const empty=document.createElement('li');empty.textContent='لا توجد تعديلات مسجّلة بعد.';byId('history-list').append(empty);}
}
async function loadCorrections(){
  const account=user;
  const {requests}=await api('/api/corrections');
  if(user!==account)return;
  const states={pending:'بانتظار المراجعة',approved:'معتمد',rejected:'مرفوض',stale:'تحتاج طلبًا جديدًا'};
  const items=requests.map(request=>{
    const item=document.createElement('li'),text=document.createElement('p');
    const kind=request.kind==='merge'?'دمج سجل مكرر':'تصحيح الأب';
    text.textContent=kind+' · '+(request.personName||personLabel(request.personId))+' ← '+(request.parentName||personLabel(request.parentId))+' · '+
      (states[request.status]||request.status)+' · '+request.note;
    item.append(text);
    if(user.role==='admin'&&request.status==='pending'){
      for(const [decision,label] of [['approve','اعتماد'],['reject','رفض']]){
        const button=document.createElement('button');
        button.type='button';button.dataset.decision=decision;button.textContent=label;
        button.addEventListener('click',()=>submit(item,async()=>{
          if(!window.confirm(label+' طلب '+kind+' لهذا الشخص؟'))return;
          await api('/api/corrections/'+encodeURIComponent(request.id)+'/decision',{decision});
          await loadTree();await loadCorrections();await loadHistory();
          notify('حُفظ قرار المراجعة.');
        }));
        item.append(button);
      }
    }
    return item;
  });
  byId('corrections-list').replaceChildren(...items);
  if(!items.length){const empty=document.createElement('li');empty.textContent='لا توجد طلبات.';byId('corrections-list').append(empty);}
}
byId('history-refresh').addEventListener('click',()=>submit(byId('history-section'),loadHistory));
byId('corrections-refresh').addEventListener('click',()=>submit(byId('correction-section'),loadCorrections));
byId('history-section').addEventListener('toggle',()=>{if(byId('history-section').open&&user)loadHistory().catch(error=>notify(error.message,true));});
byId('correction-section').addEventListener('toggle',()=>{if(byId('correction-section').open&&user)loadCorrections().catch(error=>notify(error.message,true));});
byId('correction-kind').addEventListener('change',refreshCorrectionChoices);
byId('correction-person').addEventListener('change',refreshCorrectionChoices);
byId('correction-form').addEventListener('submit',event=>{
  event.preventDefault();
  submit(event.currentTarget,async()=>{
    const personId=byId('correction-person').value,parentId=byId('correction-parent').value;
    if(!personId||!parentId||personId===parentId)throw Error('اختر شخصين مختلفين.');
    await api('/api/corrections',{personId,parentId,note:byId('correction-note').value.trim(),kind:byId('correction-kind').value});
    byId('correction-note').value='';await loadCorrections();notify('أُرسل الطلب للمراجعة.');
  });
});

function downloadBranch(svgOnly){
  const rows=treeSnapshot?.people || [];
  const root=rows.find(person=>person.id===selectedId);
  if(!root){notify('اختر شخصًا من الشجرة الرئيسية لتصدير فرعه.',true);return;}
  const kept=descendants(rows,root.id);
  const fragment=document.createElement('div');
  const selectedScope=byId('tree-scope').value;
  byId('tree-scope').value='all';
  try { drawTree(fragment,{title:root.name,people:rows.filter(person=>kept.has(person.id))},false); }
  finally {byId('tree-scope').value=selectedScope;}
  const svg=fragment.querySelector('svg');
  if(!svg)return;
  svg.querySelectorAll('[tabindex],[role],[aria-pressed]').forEach(element=>{
    element.removeAttribute('tabindex');element.removeAttribute('role');element.removeAttribute('aria-pressed');
  });
  const style=svgElement('style',{},'text{font-family:Tahoma,Arial,sans-serif;font-size:15px;fill:#293d30}.tree-person rect{fill:#fffdf6;stroke:#8a744c;stroke-width:1.5}.tree-branch{fill:none;stroke:#82653c;stroke-width:2.5}');
  svg.prepend(style);
  svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
  const markup=new XMLSerializer().serializeToString(svg);
  let content=markup,type='image/svg+xml',filename='family-branch.svg';
  if(!svgOnly){
    const html=document.implementation.createHTMLDocument('فرع '+root.name);
    html.documentElement.lang='ar';html.documentElement.dir='rtl';
    const meta=html.createElement('meta');meta.setAttribute('charset','utf-8');html.head.prepend(meta);
    const css=html.createElement('style');
    css.textContent='body{margin:0;padding:12mm;font-family:Tahoma,Arial,sans-serif}svg{display:block;width:100%;height:auto}h1{font-size:20px;text-align:center}@page{size:landscape;margin:5mm}';
    html.head.append(css);
    const heading=html.createElement('h1');heading.textContent='فرع '+root.name;
    html.body.append(heading,html.importNode(svg,true));
    content='<!doctype html>'+html.documentElement.outerHTML;
    type='text/html;charset=utf-8';filename='family-branch-print.html';
  }
  const link=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type}));
  link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  notify(svgOnly?'نُزّل رسم الفرع.':'نُزّلت صفحة الفرع. افتحها ثم استخدم الطباعة أو حفظ PDF.');
}
byId('branch-export').addEventListener('click',()=>downloadBranch(false));
byId('branch-svg-export').addEventListener('click',()=>downloadBranch(true));

enter().catch(error => {
  showSignedOut();
  openInvitationForm();
  if (!/الدخول|دخول|session|authenticated|unauthorized/i.test(error.message)) notify(error.message, true);
});
