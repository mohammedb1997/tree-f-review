import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';

const el=id=>document.getElementById(id);
const viewport=el('viewport');
const colors={selected:0xffc054,ancestor:0xbe95e7,descendant:0x70c994,other:0x376449};
const format=new Intl.NumberFormat('ar-SA');
const normalize=value=>value.normalize('NFKD').replace(/[\p{M}ـ]/gu,'').replace(/ى/g,'ي').trim();
let nodes,index,selection;
let renderer,camera,controls,scene,tree,markers,lineagePaths;
let curves;
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
    const radius=12*Math.pow(level,.72)*(1+variation*.18*level);
    const height=node.depth===0?2.8:3.8+level*11+Math.cos(angle*3)*.48+variation*level*1.65;
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

function select(node,visit){
  selection=node;
  el('person-name').textContent=node.name;
  el('generation').textContent='الجيل '+format.format(node.depth+1);
  const descendants=new Set();
  const pending=[...node.children];
  while(pending.length){
    const child=pending.pop();
    descendants.add(child.id);
    pending.push(...child.children);
  }
  el('details').textContent='الأبناء المباشرون: '+format.format(node.children.length)+' · الذرية: '+format.format(descendants.size);
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
  if(renderer){
    const ancestorIds=new Set(parents.map(parent=>parent.id));
    nodes.forEach((person,i)=>{
      const tone=person===node?'selected':ancestorIds.has(person.id)?'ancestor':descendants.has(person.id)?'descendant':'other';
      person.tone=tone;
      markers.setColorAt(i,new THREE.Color(colors[tone]));
    });
    markers.instanceColor.needsUpdate=true;
    const pathPoints=[];
    for(const person of [node,...parents]){
      const points=curves.get(person.id)?.getPoints(12) || [];
      for(let i=1;i<points.length;i++)pathPoints.push(...points[i-1].toArray(),...points[i].toArray());
    }
    lineagePaths.geometry.dispose();
    lineagePaths.geometry=new THREE.BufferGeometry();
    lineagePaths.geometry.setAttribute('position',new THREE.Float32BufferAttribute(pathPoints,3));
    if(visit){
      controls.target.copy(placements.get(node.id));
      const direction=new THREE.Vector3().subVectors(camera.position,controls.target).normalize();
      camera.position.copy(controls.target).addScaledVector(direction,8);
      controls.update();
    }
    queueRender();
  }
  updateChoices();
}

function overview(){
  if(!renderer)return;
  controls.target.set(0,7,0);
  const fit=Math.min(1.7,Math.max(1,viewport.clientHeight/viewport.clientWidth*1.2));
  camera.position.set(23*fit,7+11*fit,28*fit);
  controls.update();
  queueRender();
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
  curves=new Map();
  tree=new THREE.Group();
  scene.add(tree);
  labels.clear();
  el('labels').replaceChildren();
  const wood=new THREE.MeshStandardMaterial({color:0x69472c,roughness:1});
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.43,1.1,2.8,12),wood);
  trunk.position.y=1.4;
  tree.add(trunk);
  const lines=[];
  for(const node of nodes){
    if(!node.parent)continue;
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
  markers=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,8),new THREE.MeshStandardMaterial(),nodes.length);
  tree.add(markers);
  const transform=new THREE.Object3D();
  nodes.forEach((node,i)=>{
    transform.position.copy(placements.get(node.id));
    transform.scale.setScalar(node.depth===0?.46:node.children.length?.25:.16);
    transform.updateMatrix();
    markers.setMatrixAt(i,transform.matrix);
  });
}

function drawLabels(width,height){
  const projected=new THREE.Vector3();
  const ranked=nodes.map(node=>{
    const point=placements.get(node.id);
    projected.copy(point).project(camera);
    return {node,x:(projected.x+1)*width/2,y:(1-projected.y)*height/2,z:projected.z,
      priority:node===selection?-10000:(node.tone==='ancestor'?-100:0)+camera.position.distanceTo(point)+node.depth};
  }).sort((a,b)=>a.priority-b.priority);
  const shown=[];
  const active=new Set();
  for(const item of ranked){
    if(shown.length>=Math.min(28,Math.ceil(width/24)))break;
    if(item.z>1||item.z< -1||item.x<65||item.x>width-65||item.y<38||item.y>height-55)continue;
    if(shown.some(other=>Math.abs(other.x-item.x)<138&&Math.abs(other.y-item.y)<36))continue;
    const {node,x,y}=item;
    let button=labels.get(node.id);
    if(!button){
      button=Object.assign(document.createElement('button'),{type:'button',className:'node-label',textContent:node.name,tabIndex:-1,title:node.name});
      button.onclick=()=>select(node,true);
      labels.set(node.id,button);
    }
    button.style.left=x+'px';
    button.style.top=y+'px';
    button.setAttribute('aria-current',String(node===selection));
    if(!button.isConnected)el('labels').append(button);
    shown.push(item);
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
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
  viewport.prepend(renderer.domElement);
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0xc5dacc);
  scene.fog=new THREE.Fog(0xc5dacc,38,100);
  camera=new THREE.PerspectiveCamera(42,1,.15,150);
  controls=new OrbitControls(camera,renderer.domElement);
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
  if(renderer)buildTree();
  select(nodes[0],false);
  overview();
}

el('size').onchange=reset;
el('overview').onclick=overview;
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
