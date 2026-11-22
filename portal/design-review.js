'use strict';
const initialPeople = [
  {id:1, parent:null, name:'عبدالله التجريبي'},
  {id:2, parent:1, name:'أحمد التجريبي'},
  {id:3, parent:1, name:'يوسف التجريبي'},
  {id:4, parent:2, name:'سلمان التجريبي'},
  {id:5, parent:3, name:'سلمان التجريبي'}
];
const byId = id => document.getElementById(id);
const me = 2;
const modes = document.querySelectorAll('[data-start]');
let people, scope, selected;

function person(id) {
  return people.find(entry => entry.id === id);
}
function inBranch(id) {
  for (let current = person(id); current; current = person(current.parent)) {
    if (current.id === me) return true;
  }
  return false;
}
function svgElement(tag, attributes, content) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key,value] of Object.entries(attributes)) element.setAttribute(key,value);
  if (content !== undefined) element.textContent = content;
  return element;
}
function renderTree() {
  const svg = byId('demo-tree');
  const root = scope === 'tree' ? 1 : me;
  const levels = [[person(root)]];
  for (let current = levels[0]; current.length;) {
    const parents = new Set(current.map(item => item.id));
    current = people.filter(item => parents.has(item.parent));
    if (current.length) levels.push(current);
  }
  const width = Math.max(250,...levels.map(level => level.length * 80));
  const points = new Map();
  levels.forEach((level,depth) => level.forEach((entry,index) => {
    points.set(entry.id, {entry,x:width - width*(index+.5)/level.length,y:20+42*depth});
  }));
  svg.setAttribute('viewBox', '0 0 ' + width + ' ' + (42*levels.length));
  svg.replaceChildren();
  for (const {entry,x,y} of points.values()) {
    const parent = points.get(entry.parent);
    if (parent) {
      const mid = (parent.y+y)/2;
      svg.append(svgElement('path',{class:'demo-edge',d:`M ${parent.x} ${parent.y} C ${parent.x} ${mid} ${x} ${mid} ${x} ${y}`}));
    }
  }
  for (const {entry,x,y} of points.values()) {
    const label = entry.name.replace(/ التجريبي$/, '');
    const node = svgElement('g',{});
    node.append(svgElement('title',{},entry.name));
    node.append(svgElement('rect',{x:x-33,y:y-10,width:66,height:20,rx:9,class:entry.id===selected?'demo-node is-selected':'demo-node'}));
    node.append(svgElement('text',{x,y:y+3,'text-anchor':'middle',class:'demo-label'},label.length>11?label.slice(0,10)+'…':label));
    svg.append(node);
  }
}
function renderPeople() {
  const needle = byId('demo-search').value.trim();
  const list = byId('demo-people');
  list.replaceChildren();
  for (const entry of people.filter(item => (scope === 'tree' || inBranch(item.id)) && item.name.includes(needle))) {
    const row = document.createElement('li');
    const button = document.createElement('button');
    const parent = document.createElement('small');
    button.type = 'button';
    button.dataset.personId = entry.id;
    button.setAttribute('aria-pressed', String(selected === entry.id));
    button.textContent = entry.name;
    parent.textContent = entry.parent ? 'الأب · ' + person(entry.parent).name : 'أصل الشجرة';
    button.append(parent);
    button.addEventListener('click', () => select(entry.id, true));
    row.append(button);
    list.append(row);
  }
  if (!list.children.length) list.append(Object.assign(document.createElement('li'), {textContent:'لم نجد اسمًا مطابقًا.'}));
}
function select(id, focus = false) {
  selected = id;
  const entry = person(id);
  byId('demo-title').textContent = entry.name;
  byId('demo-lineage').textContent = entry.parent ? 'الأب · ' + person(entry.parent).name : 'أصل الشجرة';
  byId('demo-message').textContent = inBranch(id) ? '' : 'للاطلاع فقط في هذا النموذج.';
  byId('demo-add').hidden = !inBranch(id);
  byId('demo-add').reset();
  renderTree();
  renderPeople();
  if (focus) byId('demo-title').focus();
}
function show(target, id) {
  scope = target;
  byId('view-title').textContent = scope === 'tree' ? 'الشجرة كاملة' : 'فرعي';
  byId('demo-search').value = '';
  select(id);
}
function reset(target) {
  people = [...initialPeople];
  for (const button of modes) button.setAttribute('aria-pressed', String(button.dataset.start === target));
  show(target, target === 'tree' ? 1 : me);
}
for (const button of modes) button.addEventListener('click', () => reset(button.dataset.start));
byId('demo-search').addEventListener('input', renderPeople);
byId('find-me').addEventListener('click', () => { byId('demo-search').value = ''; select(me, true); });
byId('branch-view').addEventListener('click', () => show('branch', me));
byId('full-view').addEventListener('click', () => show('tree', selected));
byId('demo-add').addEventListener('submit', event => {
  event.preventDefault();
  const name = byId('demo-name').value.trim();
  if (!name || !inBranch(selected)) return;
  const child = {id:people.at(-1).id + 1, parent:selected, name, gender:byId('demo-gender').value};
  people.push(child);
  byId('demo-search').value = '';
  select(child.id, true);
  byId('demo-message').textContent = child.gender === 'f' ? 'تمت إضافة الابنة إلى الفرع.' : 'تمت إضافة الابن إلى الفرع.';
});
reset('branch');
