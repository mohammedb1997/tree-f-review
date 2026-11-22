import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';

const el=id=>document.getElementById(id);
const viewport=el('viewport');
const kinship={
  selected:['الشخص المحدد','#ffc054'],ancestor:['الأب والأجداد','#d2a3ff'],
  child:['الأبناء المباشرون','#9de185'],descendant:['الأحفاد والذرية','#78dfe8'],
  other:['بقية العائلة','#9ba9a2']
};
const genders={m:['ذكر','#85bbff'],f:['أنثى','#ffa3cf']};
const generations=['#ffd17a','#8fc2f8','#d8adfa','#9ade9f','#ffa6a6','#82e1db','#f1afe0'];
const format=new Intl.NumberFormat('ar-SA');
const normalize=value=>value.normalize('NFKD').replace(/[\p{M}ـ]/gu,'').replace(/ى/g,'ي').trim();
let nodes,index,selection;
let pinned=null,isolated=false,renderedNodes=[],renderedIds=new Set();
let renderer,camera,controls,scene,tree,markers,lineagePaths;
let curves;
const labelMeasure=document.createElement('canvas').getContext('2d');
let placements,labels=new Map(),frame=0;

function fixture(size){
  const {nodes:rows}=BotanicalCore.visible(BotanicalCore.fixture(size));
  const byId=new Map(rows.map(row=>[row.personId,{id:row.personId,parent:row.parentId,
    name:row.fullName,children:[],depth:0,weight:1}]));
  const list=[...byId.values()];
  for(const node of list){
    const parent=byId.get(node.parent);
    if(parent){node.depth=parent.depth+1;parent.children.push(node);}
  }
  for(const node of list.slice().reverse()){
    node.weight=Math.max(1,node.children.reduce((sum,child)=>sum+child.weight,0));
    // Synthetic sample only. The real portal supplies gender from authorized records.
    node.gender=node.depth && !node.children.length && Number(node.id.slice(5))%5===0?'f':'m';
    if(node.gender==='f')node.name='مريم التجريبية '+node.id.slice(5);
  }
  return {list,byId};
}

function positions(){
  const result=new Map();
  const maxDepth=nodes.reduce((max,node)=>Math.max(max,node.depth),1);
  function place(node,start,span){
    const level=node.depth/maxDepth;
    const angle=start+span/2;
    const variation=Math.sin(Number(node.id.slice(5))*29.19);
    const radius=12*Math.pow(level,.72)*(1+variation*.19*level-.13*level*level);
    const height=node.depth===0?2.8:3.8+level*11+Math.cos(angle*3)*.66+variation*level*2.05;
    result.set(node.id,new THREE.Vector3(Math.cos(angle)*radius,height,Math.sin(angle)*radius));
    let next=start;
    for(const child of node.children){
      const width=span*child.weight/node.weight;
      place(child,next,width);
      next+=width;
    }
  }
  place(nodes[0],-.15,Math.PI*2);
  return result;
}

function updateChoices(){
  const query=normalize(el('search').value);
  const rows=nodes.filter(node=>normalize(node.name).includes(query));
  const select=el('people');
  select.replaceChildren(new Option(rows.length?'اختر اسمًا من النتائج':'لا توجد أسماء مطابقة',''));
  for(const node of rows)select.add(new Option(node.name,node.id));
  select.value=rows.some(node=>node.id===selection.id)?selection.id:'';
  select.disabled=!rows.length;
  return rows;
}

function ancestry(node){
  const list=[];
  for(let parent=index.get(node.parent);parent;parent=index.get(parent.parent))list.push(parent);
  return list;
}

function branchIds(root){
  const found=new Set();
  const pending=[root];
  while(pending.length){
    const node=pending.pop();
    found.add(node.id);
    pending.push(...node.children);
  }
  return found;
}

function setPinned(root){
  pinned=root?{root,ids:branchIds(root)}:null;
  isolated=Boolean(pinned&&renderer);
  const panel=el('pinned-branch');
  panel.hidden=!pinned;
  const list=el('pinned-people');
  list.replaceChildren();
  if(pinned){
    el('pinned-heading').textContent='فرع '+root.name;
    el('pinned-count').textContent='صاحب الفرع و'+format.format(pinned.ids.size-1)+' من ذريته';
    for(const person of nodes.filter(node=>pinned.ids.has(node.id))){
      const row=document.createElement('li');
      const button=Object.assign(document.createElement('button'),{type:'button'});
      button.dataset.personId=person.id;
      const name=document.createElement('strong');
      name.textContent=person.name;
      const detail=document.createElement('span');
      detail.className='pinned-parent';
      detail.textContent=person===root?'صاحب الفرع':
        'الأب: '+index.get(person.parent).name+' · '+generationTone(person.depth)[0];
      button.append(name,detail);
      button.onclick=()=>select(person,false);
      row.append(button);
      list.append(row);
    }
  }
  refreshScope();
}

function refreshScope(){
  el('scope-branch').hidden=!renderer;
  el('scope-branch').textContent=isolated?'أظهر الشجرة كاملة':'اعزل الفرع';
  el('overview').textContent=isolated?'عرض الفرع كاملًا':'عرض الشجرة كاملة';
  if(renderer)buildTree();
  select(selection,false);
  overview();
}

function generationTone(depth){
  return ['الجيل '+format.format(depth+1),generations[depth%generations.length]];
}

function refreshColors(){
  const mode=el('color-mode').value;
  const entries=mode==='kinship'?Object.values(kinship):mode==='gender'?Object.values(genders):
    [...new Set(nodes.map(node=>node.depth))].sort((a,b)=>a-b).map(generationTone);
  el('legend').replaceChildren(...entries.map(([name,color])=>{
    const row=document.createElement('li');
    const swatch=document.createElement('span');
    swatch.className='swatch';
    swatch.style.backgroundColor=color;
    swatch.setAttribute('aria-hidden','true');
    row.append(swatch,name);
    return row;
  }));
  for(const node of nodes){
    node.appearance=mode==='kinship'?kinship[node.tone]:mode==='gender'?genders[node.gender]:generationTone(node.depth);
  }
  if(markers){
    renderedNodes.forEach((node,i)=>markers.setColorAt(i,new THREE.Color(node.appearance[1])));
    markers.instanceColor.needsUpdate=true;
  }
  queueRender();
}

function select(node,visit){
  selection=node;
  el('focus-person').disabled=!renderer||!renderedIds.has(node.id);
  el('pin-person').disabled=pinned?.root===node;
  el('pin-person').textContent=pinned?.root===node?'هذا الفرع مثبّت':'ثبّت فرع هذا الشخص';
  for(const button of el('pinned-people').querySelectorAll('button')){
    button.setAttribute('aria-current',String(button.dataset.personId===node.id));
  }
  el('person-name').textContent=node.name;
  el('generation').textContent='الجيل '+format.format(node.depth+1);
  el('person-gender').textContent=genders[node.gender][0];
  const descendants=branchIds(node);
  el('details').textContent='الأبناء المباشرون: '+format.format(node.children.length)+' · الذرية: '+format.format(descendants.size-1);
  const parents=ancestry(node);
  el('lineage').replaceChildren(...parents.map(parent=>{
    const row=document.createElement('li');
    const link=document.createElement('button');
    link.type='button';
    link.textContent=parent.name;
    link.onclick=()=>select(parent,true);
    row.append(link);
    return row;
  }));
  if(!parents.length)el('lineage').append(Object.assign(document.createElement('li'),{textContent:'أصل الشجرة'}));
  const ancestorIds=new Set(parents.map(parent=>parent.id));
  for(const person of nodes){
    person.tone=person===node?'selected':ancestorIds.has(person.id)?'ancestor':
      person.parent===node.id?'child':descendants.has(person.id)?'descendant':'other';
  }
  if(renderer){
    const pathPoints=[];
    for(const person of [node,...parents]){
      const points=curves.get(person.id)?.getPoints(12) || [];
      for(let i=1;i<points.length;i++)pathPoints.push(...points[i-1].toArray(),...points[i].toArray());
    }
    lineagePaths.geometry.dispose();
    lineagePaths.geometry=new THREE.BufferGeometry();
    lineagePaths.geometry.setAttribute('position',new THREE.Float32BufferAttribute(pathPoints,3));
    if(visit&&renderedIds.has(node.id)){
      controls.target.copy(placements.get(node.id));
      const direction=new THREE.Vector3().subVectors(camera.position,controls.target).normalize();
      camera.position.copy(controls.target).addScaledVector(direction,8);
      controls.update();
    }
    queueRender();
  }
  refreshColors();
  updateChoices();
}

function overview(){
  if(!renderer)return;
  if(isolated){
    const box=new THREE.Box3().setFromPoints(renderedNodes.map(node=>placements.get(node.id)));
    const center=box.getCenter(new THREE.Vector3());
    const radius=box.getSize(new THREE.Vector3()).length()/2+1;
    const yAngle=THREE.MathUtils.degToRad(camera.fov/2);
    const aspect=viewport.clientWidth/Math.max(1,viewport.clientHeight);
    const halfAngle=Math.min(yAngle,Math.atan(Math.tan(yAngle)*aspect));
    const distance=Math.min(controls.maxDistance,Math.max(8,radius/Math.sin(halfAngle)));
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(new THREE.Vector3(23,11,28).normalize(),distance);
    controls.update();
    queueRender();
    return;
  }
  controls.target.set(0,7,0);
  const fit=Math.min(1.7,Math.max(1,viewport.clientHeight/viewport.clientWidth*1.2));
  camera.position.set(23*fit,7+11*fit,28*fit);
  controls.update();
  queueRender();
}

function zoom(factor){
  const offset=camera.position.clone().sub(controls.target);
  offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance));
  camera.position.copy(controls.target).add(offset);
  controls.update();
  queueRender();
}

function bindNameGestures(){
  const held=new Set();
  let tap=null;
  const moved=event=>Math.hypot(event.clientX-tap.x,event.clientY-tap.y)>9;
  viewport.addEventListener('pointerdown',event=>{
    held.add(event.pointerId);
    const label=event.target.closest('.node-label');
    tap=held.size===1&&event.button===0&&label
      ?{id:event.pointerId,personId:label.dataset.personId,x:event.clientX,y:event.clientY}:null;
  },true);
  viewport.addEventListener('pointermove',event=>{
    if(tap?.id===event.pointerId&&moved(event))tap=null;
  },true);
  viewport.addEventListener('pointerup',event=>{
    held.delete(event.pointerId);
    if(tap?.id!==event.pointerId)return;
    const person=!moved(event)&&!el('labels').hidden&&index.get(tap.personId);
    tap=null;
    if(person)select(person,false);
  },true);
  for(const type of ['pointercancel','lostpointercapture']){
    viewport.addEventListener(type,event=>{
      held.delete(event.pointerId);
      if(tap?.id===event.pointerId)tap=null;
    });
  }
}

function buildTree(){
  if(tree){
    scene.remove(tree);
    tree.traverse(object=>{
      object.dispose?.();
      object.geometry?.dispose();
      object.material?.dispose();
    });
  }
  placements=positions();
  renderedNodes=isolated?nodes.filter(node=>pinned.ids.has(node.id)):nodes;
  renderedIds=new Set(renderedNodes.map(node=>node.id));
  curves=new Map();
  tree=new THREE.Group();
  scene.add(tree);
  labels.clear();
  el('labels').replaceChildren();
  const wood=new THREE.MeshStandardMaterial({color:0x69472c,roughness:1});
  if(renderedIds.has(nodes[0].id)){
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.43,1.1,2.8,12),wood);
    trunk.position.y=1.4;
    tree.add(trunk);
  }
  const lines=[];
  for(const node of renderedNodes){
    if(!renderedIds.has(node.parent))continue;
    const start=placements.get(node.parent);
    const end=placements.get(node.id);
    const bend=new THREE.Vector3().lerpVectors(start,end,.46);
    bend.x=start.x+(end.x-start.x)*.22;
    bend.z=start.z+(end.z-start.z)*.22;
    const curve=new THREE.QuadraticBezierCurve3(start,bend,end);
    curves.set(node.id,curve);
    if(node.depth<=2){
      const radius=node.depth===1?.24:.105;
      tree.add(new THREE.Mesh(new THREE.TubeGeometry(curve,12,radius,6,false),wood));
    }else{
      const points=curve.getPoints(8);
      for(let i=1;i<points.length;i++)lines.push(...points[i-1].toArray(),...points[i].toArray());
    }
  }
  const twigs=new THREE.BufferGeometry();
  twigs.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));
  tree.add(new THREE.LineSegments(twigs,new THREE.LineBasicMaterial({color:0x65492f})));
  lineagePaths=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x77389e,depthTest:false}));
  lineagePaths.renderOrder=2;
  tree.add(lineagePaths);
  markers=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,8),new THREE.MeshStandardMaterial(),renderedNodes.length);
  tree.add(markers);
  const transform=new THREE.Object3D();
  renderedNodes.forEach((node,i)=>{
    transform.position.copy(placements.get(node.id));
    transform.scale.setScalar(node.depth===0?.46:node.children.length?.25:.16);
    transform.updateMatrix();
    markers.setMatrixAt(i,transform.matrix);
  });
}

function drawLabels(width,height){
  if(el('labels').hidden)return;
  const projected=new THREE.Vector3();
  labelMeasure.font='bold 14px Tahoma,Arial,sans-serif';
  const ranked=renderedNodes.map(node=>{
    const point=placements.get(node.id);
    projected.copy(point).project(camera);
    return {node,x:(projected.x+1)*width/2,y:(1-projected.y)*height/2,z:projected.z,
      priority:node===selection?-10000:(node.tone==='ancestor'?-100:0)+camera.position.distanceTo(point)+node.depth};
  }).sort((a,b)=>a.priority-b.priority);
  const shown=[];
  const active=new Set();
  for(const item of ranked){
    if(shown.length>=Math.min(28,Math.ceil(width/24)))break;
    const labelWidth=Math.min(width<550?156:208,Math.ceil(labelMeasure.measureText(item.node.name).width)+24);
    if(item.z>1||item.z< -1||item.x<labelWidth/2+4||item.x>width-labelWidth/2-4||item.y<48||item.y>height-55)continue;
    if(shown.some(other=>Math.abs(other.x-item.x)<(other.width+labelWidth)/2+8&&Math.abs(other.y-item.y)<44))continue;
    const {node,x,y}=item;
    let button=labels.get(node.id);
    if(!button){
      button=Object.assign(document.createElement('button'),{type:'button',className:'node-label',textContent:node.name,tabIndex:-1,title:node.name});
      button.onclick=event=>{if(event.detail===0)select(node,false);};
      labels.set(node.id,button);
    }
    button.style.left=x+'px';
    button.style.top=y+'px';
    button.style.width=labelWidth+'px';
    button.style.setProperty('--label-color',node.appearance[1]);
    button.dataset.personId=node.id;
    button.dataset.category=node.appearance[0];
    button.setAttribute('aria-label',node.name+'، '+node.appearance[0]);
    button.title=node.name+' · '+node.appearance[0];
    button.setAttribute('aria-current',String(node===selection));
    if(!button.isConnected)el('labels').append(button);
    shown.push({...item,width:labelWidth});
    active.add(node.id);
  }
  for(const [id,button] of labels)if(!active.has(id))button.remove();
}

function queueRender(){
  if(!renderer||frame)return;
  frame=requestAnimationFrame(()=>{
    frame=0;
    const width=viewport.clientWidth,height=viewport.clientHeight;
    if(!width||!height)return;
    camera.aspect=width/height;
    camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);
    renderer.render(scene,camera);
    drawLabels(width,height);
  });
}

function setupScene(){
  try{renderer=new THREE.WebGLRenderer({antialias:true});}
  catch{
    el('fallback').hidden=false;
    el('hint').hidden=true;
    el('overview').disabled=true;
    el('focus-person').disabled=true;
    el('view-controls').hidden=true;
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
  viewport.prepend(renderer.domElement);
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0xc5dacc);
  scene.fog=new THREE.Fog(0xc5dacc,55,115);
  camera=new THREE.PerspectiveCamera(42,1,.15,150);
  controls=new OrbitControls(camera,viewport);
  bindNameGestures();
  el('zoom-in').onclick=()=>zoom(.78);
  el('zoom-out').onclick=()=>zoom(1/.78);
  el('focus-person').onclick=()=>select(selection,true);
  el('toggle-labels').onclick=event=>{
    const visible=el('labels').hidden;
    el('labels').hidden=!visible;
    event.currentTarget.setAttribute('aria-pressed',String(visible));
    queueRender();
  };
  controls.minDistance=3;
  controls.maxDistance=72;
  controls.maxPolarAngle=Math.PI*.49;
  controls.addEventListener('change',queueRender);
  scene.add(new THREE.HemisphereLight(0xfff6da,0x55734a,2.1));
  const grass=new THREE.Mesh(new THREE.CircleGeometry(42,64),new THREE.MeshStandardMaterial({color:0x789b6e}));
  grass.rotation.x=-Math.PI/2;
  scene.add(grass);
  const clearing=new THREE.Mesh(new THREE.RingGeometry(13.5,14.8,72),new THREE.MeshStandardMaterial({color:0xc7bb8c}));
  clearing.rotation.x=-Math.PI/2;
  clearing.position.y=.012;
  scene.add(clearing);
  new ResizeObserver(queueRender).observe(viewport);
}

function reset(){
  ({list:nodes,byId:index}=fixture(Number(el('size').value)));
  el('search').value='';
  selection=nodes[0];
  setPinned(null);
}

el('size').onchange=reset;
el('color-mode').onchange=refreshColors;
el('overview').onclick=overview;
el('pin-person').onclick=()=>{
  setPinned(selection);
  el('pinned-heading').focus();
};
el('clear-pin').onclick=()=>{
  setPinned(null);
  el('pin-person').focus();
};
el('scope-branch').onclick=()=>{
  isolated=!isolated;
  refreshScope();
};
el('search').oninput=updateChoices;
el('search').onkeydown=event=>{
  if(event.key!=='Enter')return;
  const [match]=updateChoices();
  if(match)select(match,true);
};
el('people').onchange=event=>{
  const node=index.get(event.target.value);
  if(node)select(node,true);
};
setupScene();
reset();
