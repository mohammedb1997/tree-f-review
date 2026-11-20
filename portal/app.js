'use strict';

const byId = id => document.getElementById(id);
let user = null;
let people = [];
let selectedId = null;
let treeSnapshot = null;
let beforeSnapshot = null;
let liveConnection = null;
let connectionGeneration = 0;

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

function drawTree(container, snapshot) {
  container.replaceChildren();
  if (!snapshot?.people.length) return;
  const source = snapshot.people;
  if(byId('tree-scope').value==='branch' && selectedId &&
      !source.some(person=>person.id===selectedId)){
    const empty = document.createElement('p');
    empty.className = 'tree-empty';
    empty.textContent = 'هذا الشخص أُضيف بعد النسخة السابقة، ويظهر فرعه في الرسم بعد التعديل.';
    container.append(empty);
    return;
  }
  const family = descendants(source, selectedId);
  const shown = byId('tree-scope').value === 'branch' && family.size
    ? source.filter(person => family.has(person.id)) : source;
  const map = new Map(shown.map(person => [person.id, person]));
  const children = new Map();
  for (const person of shown) {
    const parentId = map.has(person.parentId) ? person.parentId : null;
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(person);
  }
  const context = document.createElement('canvas').getContext('2d');
  context.font = '15px Tahoma,Arial,sans-serif';
  const positions = new Map();
  let cursor = 25;
  let maximumDepth = 0;
  const gap = 32;
  function place(person, depth) {
    if (positions.has(person.id)) return;
    const width = Math.max(150, Math.ceil(context.measureText(person.name).width + 38));
    const position = {x:0, y:depth * 120 + 65, width};
    positions.set(person.id, position);
    maximumDepth = Math.max(maximumDepth, depth);
    const start = cursor;
    const childrenHere = children.get(person.id) || [];
    for (const child of childrenHere) place(child, depth + 1);
    const subtreeWidth = Math.max(width, cursor - start - (childrenHere.length ? gap : 0));
    position.x = start + subtreeWidth / 2;
    cursor = start + subtreeWidth + gap;
  }
  for (const root of children.get(null) || []) place(root, 0);
  const width = Math.max(650, cursor + 25);
  const height = maximumDepth * 120 + 140;
  const svg = svgElement('svg', {width, height, viewBox:`0 0 ${width} ${height}`, role:'group', 'aria-label':snapshot.title || 'شجرة العائلة'});
  for (const person of shown) {
    const child = positions.get(person.id);
    const parent = positions.get(person.parentId);
    if (!parent || !child) continue;
    const path = svgElement('path', {
      d:`M${width-parent.x} ${parent.y+25}C${width-parent.x} ${parent.y+77} ${width-child.x} ${child.y-77} ${width-child.x} ${child.y-25}`,
      class:'tree-branch' + (family.has(person.id) && family.has(person.parentId) ? ' is-related' : ''),
      'data-parent-id':person.parentId, 'data-child-id':person.id
    });
    svg.append(path);
  }
  for (const person of shown) {
    const position = positions.get(person.id);
    if (!position) continue;
    const previous = beforeSnapshot?.people.find(candidate=>candidate.id===person.id);
    const change = snapshot===treeSnapshot && beforeSnapshot
      ? !previous ? 'added' : previous.name!==person.name ? 'renamed' : null
      : null;
    const className = ['tree-person',family.has(person.id)?'is-related':'',person.id===user?.personId?'is-self':'',person.id===selectedId?'is-selected':'',change?'is-changed':''].filter(Boolean).join(' ');
    const group = svgElement('g', {transform:`translate(${width-position.x} ${position.y})`, class:className,
      tabindex:0, role:'button','aria-label':person.name, 'aria-pressed':String(person.id===selectedId), 'data-person-id':person.id});
    if(change){
      group.dataset.change=change;
      group.append(svgElement('title',{},change==='added'?'أُضيف في آخر تعديل':'تغيّر الاسم في آخر تعديل'));
    }
    group.append(svgElement('rect',{x:-position.width/2,y:-25,width:position.width,height:50,rx:23}));
    group.append(svgElement('text',{'text-anchor':'middle',y:5,direction:'rtl'},person.name));
    group.addEventListener('click',()=>selectPerson(person.id));
    group.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();selectPerson(person.id);}
    });
    svg.append(group);
  }
  container.append(svg);
}

function renderTrees() {
  const active = document.activeElement;
  const focusPersonId = active?.dataset?.personId;
  const focusContainer = active?.closest('.tree-canvas')?.id;
  drawTree(byId('tree-view'), treeSnapshot);
  const comparison = byId('comparison');
  comparison.hidden = !beforeSnapshot;
  if (beforeSnapshot) {
    drawTree(byId('before-tree'), beforeSnapshot);
    drawTree(byId('after-tree'), treeSnapshot);
    byId('comparison-description').textContent = 'من النسخة ' + beforeSnapshot.revision + ' إلى النسخة ' + treeSnapshot.revision;
  }
  if(focusPersonId && focusContainer){
    const replacement=[...byId(focusContainer).querySelectorAll('[data-person-id]')]
      .find(element=>element.dataset.personId===focusPersonId);
    replacement?.focus({preventScroll:true});
  }
}

function locatePerson(id) {
  const container = byId('tree-view');
  const node = [...container.querySelectorAll('[data-person-id]')].find(element=>element.dataset.personId===id);
  if (!node) return;
  const bounds = node.getBoundingClientRect();
  const parent = container.getBoundingClientRect();
  container.scrollLeft += bounds.left - parent.left - (parent.width - bounds.width)/2;
  container.scrollTop += bounds.top - parent.top - (parent.height - bounds.height)/2;
}

function stopLive() {
  connectionGeneration++;
  liveConnection?.close();
  liveConnection = null;
}

function startLive() {
  stopLive();
  const generation = connectionGeneration;
  const connection = new EventSource('/api/live');
  liveConnection = connection;
  connection.addEventListener('open',()=>{
    if(generation===connectionGeneration)byId('live-status').textContent='متصل · التحديثات تصل مباشرة';
  });
  connection.addEventListener('tree',event=>{
    if(generation!==connectionGeneration || !user)return;
    try { applyTree(JSON.parse(event.data)); }
    catch { byId('live-status').textContent='تعذر عرض التحديث. جارٍ إعادة المزامنة…'; }
  });
  connection.addEventListener('session-expired',()=>{
    if(generation===connectionGeneration){showSignedOut();notify('انتهت الجلسة. سجّل الدخول مجددًا.');}
  });
  connection.addEventListener('error',()=>{
    if(generation===connectionGeneration)byId('live-status').textContent='انقطع الاتصال · جارٍ إعادة الاتصال';
  });
}

function notify(message, error = false) {
  const notice = byId('notice');
  notice.textContent = message;
  notice.dataset.error = String(error);
}

async function api(url, data, method = 'POST') {
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
  buttons.forEach(button => { button.disabled = true; });
  notify('');
  try {
    await action();
  } catch (error) {
    notify(error.message, true);
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

function showSignedOut() {
  stopLive();
  user = null;
  people = [];
  selectedId = null;
  treeSnapshot = null;
  beforeSnapshot = null;
  byId('tree-view').replaceChildren();
  byId('before-tree').replaceChildren();
  byId('after-tree').replaceChildren();
  byId('comparison').hidden = true;
  byId('live-status').textContent = '';
  byId('workspace').hidden = true;
  byId('administration').hidden = true;
  byId('session').hidden = true;
  byId('access').hidden = false;
  byId('people').replaceChildren();
  byId('accounts').replaceChildren();
  byId('parent').replaceChildren();
  byId('invite-person').replaceChildren();
  for(const id of ['identity','person-title','person-parent','person-access','person-lineage','person-descendants','family-title','tree-count']){
    byId(id).textContent='';
  }
  for(const id of ['person-name','child-name','tree-title','invite-identifier','search']){
    byId(id).value='';
  }
  byId('invitation-code').value = '';
  byId('invitation').hidden = true;
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
  item.textContent = person.name + (parent ? ' — ابن ' + parent.name : ' — أصل الشجرة');
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
  byId('person-access').textContent = person.writable
    ? 'يمكنك تعديل هذا الاسم وإضافة الأبناء لهذا الفرع.'
    : 'يمكنك الاطلاع على هذا الفرع. التعديل متاح لصاحب الفرع والمدير.';
  byId('edit-form').hidden = !person.writable;
  byId('person-name').value = person.name;
  byId('add-form').hidden = !people.some(candidate => candidate.writable);
  if (person.writable) byId('parent').value = person.id;
  for (const button of byId('people').querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.personId === id));
  }
  renderTrees();
}

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
  const shown = ordered.filter(person => !search || person.name.includes(search));
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
    name.className = 'person-name';
    name.textContent = person.name;
    button.append(name);
    if (person.writable) {
      const access = document.createElement('small');
      access.textContent = 'متاح للتعديل';
      button.append(access);
    }
    button.addEventListener('click', () => selectPerson(person.id));
    list.append(button);
  }
  byId('tree-count').textContent = search
    ? shown.length + ' نتيجة من ' + people.length + ' فردًا'
    : people.length + ' فردًا في الشجرة';
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

function applyTree(result) {
  if(!user || !Array.isArray(result.people))return false;
  if(treeSnapshot && Number.isFinite(result.revision) && result.revision<=treeSnapshot.revision)return false;
  const firstSnapshot = !treeSnapshot;
  const editing = document.activeElement?.closest('#edit-form, #add-form, #title-form');
  const draft = editing ? [...editing.querySelectorAll('input,select')].map(input=>[input,input.value]) : [];
  beforeSnapshot = result.before || treeSnapshot;
  treeSnapshot = {title:result.title,people:result.people,revision:result.revision};
  people = result.people;
  byId('tree-title').value = result.title || 'شجرة العائلة';
  byId('family-title').textContent = byId('tree-title').value;
  const writable = people.filter(person => person.writable);
  byId('parent').replaceChildren(...writable.map(option));
  byId('invite-person').replaceChildren(...people.map(option));
  renderPeople();
  const current = people.find(person => person.id === selectedId);
  const initial = current || people.find(person => person.id === user.personId) || writable[0] || people[0];
  if (initial) selectPerson(initial.id);
  byId('add-form').hidden = writable.length === 0;
  for(const [input,value] of draft){
    if(input.tagName!=='SELECT' || [...input.options].some(option=>option.value===value))input.value=value;
  }
  if (firstSnapshot) locatePerson(initial?.id);
  return true;
}

async function loadTree() {
  const account = user;
  const result = await api('/api/tree');
  if(!account || user!==account)return;
  applyTree(result);
  if (account.role === 'admin') await loadAccounts();
}

async function enter() {
  user = await api('/api/me');
  byId('access').hidden = true;
  byId('workspace').hidden = false;
  byId('session').hidden = false;
  byId('identity').textContent = user.identifier;
  byId('permission-summary').textContent = user.role === 'admin'
    ? 'أنت المدير العام. يمكنك إدارة جميع الأفراد وحسابات العائلة.'
    : 'يمكنك تعديل بياناتك وبيانات أبنائك وأحفادك، والاطلاع على شجرة العائلة.';
  byId('administration').hidden = user.role !== 'admin';
  await loadTree();
  startLive();
}

byId('show-login').addEventListener('click', () => setAccessMode(false));
byId('show-activate').addEventListener('click', () => setAccessMode(true));
byId('search').addEventListener('input', renderPeople);
byId('tree-scope').addEventListener('change',()=>{renderTrees();locatePerson(selectedId);});
byId('locate-me').addEventListener('click',()=>{
  const id=user?.personId || people.find(person=>!person.parentId)?.id;
  if(id){byId('tree-scope').value='all';selectPerson(id);locatePerson(id);}
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
    await api('/api/activate', {code:byId('code').value.trim(), password:byId('new-password').value});
    byId('activate-form').reset();
    setAccessMode(false);
    await enter();
    notify('تم تفعيل حسابك.');
  });
});

byId('logout').addEventListener('click', () => submit(byId('session'), async () => {
  await api('/api/logout', {});
  showSignedOut();
  byId('identifier').focus();
}));

byId('refresh').addEventListener('click', () => submit(byId('workspace'), async () => {
  await loadTree();
  notify('حُدّثت الشجرة.');
}));

byId('edit-form').addEventListener('submit', event => {
  event.preventDefault();
  submit(event.currentTarget, async () => {
    await api('/api/people/' + encodeURIComponent(selectedId), {name:byId('person-name').value.trim()}, 'PATCH');
    await loadTree();
    notify('حُفظ الاسم.');
  });
});

byId('add-form').addEventListener('submit', event => {
  event.preventDefault();
  submit(event.currentTarget, async () => {
    await api('/api/people', {parentId:byId('parent').value, name:byId('child-name').value.trim()});
    byId('child-name').value = '';
    await loadTree();
    notify('أُضيف الابن إلى الشجرة.');
  });
});

byId('invite-form').addEventListener('submit', event => {
  event.preventDefault();
  submit(event.currentTarget, async () => {
    const invitation = await api('/api/invites', {
      identifier:byId('invite-identifier').value.trim(),
      personId:byId('invite-person').value
    });
    byId('invitation-code').value = invitation.code;
    byId('invitation').hidden = false;
    await loadAccounts();
    notify('أُنشئت الدعوة. سلّم رمز التفعيل لصاحب الحساب.');
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
    await navigator.clipboard.writeText(input.value);
    notify('نُسخ رمز الدعوة.');
  } catch {
    input.focus();
    input.select();
    notify('حُدد الرمز. يمكنك نسخه الآن.');
  }
});

enter().catch(error => {
  showSignedOut();
  if (!/الدخول|دخول|session|authenticated|unauthorized/i.test(error.message)) notify(error.message, true);
});
