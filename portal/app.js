'use strict';

const byId = id => document.getElementById(id);
let user = null;
let people = [];
let selectedId = null;
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

function drawTree(container, snapshot) {
  container.replaceChildren();
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
  const shown = anchor && family.size
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
    const change = (snapshot===treeSnapshot || container.id==='tree-view') && beforeSnapshot && person.gender!=='f'
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
}

function locatePerson(id, container = byId('tree-view')) {
  const node = [...container.querySelectorAll('[data-person-id]')].find(element=>element.dataset.personId===id);
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
  if (!locatePerson(personId, tree)) locatePerson(selectedId, tree);
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
  people = [];
  privatePeople = [];
  treeRequest++;
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

function setChildForm(){
  const daughter=byId('child-gender').value==='f';
  const parent=byId('parent');
  const chooseFather=daughter&&user?.role==='admin';
  if(daughter&&!chooseFather&&user?.personId)parent.value=user.personId;
  parent.disabled=daughter&&!chooseFather;
  byId('child-name-label').textContent=daughter?'اسم الابنة الكامل':'اسم الابن الكامل';
  byId('private-child-hint').hidden=!daughter;
  byId('add-child-button').textContent=daughter
    ? chooseFather?'حفظ الابنة في فرع الأب':'إضافة إلى بناتي'
    : 'إضافة إلى الشجرة';
}

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
    invite.textContent=recover?'استعادة الدخول':daughter.accountStatus==='invited'?'تجديد الدعوة':'إنشاء دعوة';
    invite.setAttribute('aria-label',(recover?'استعادة دخول ':'دعوة ')+daughter.name);
    invite.addEventListener('click',()=>submit(item,async()=>{
      if(recover&&!window.confirm('ستُنهى الجلسات الحالية وتُصدر كلمة مرور مؤقتة جديدة. هل تريد المتابعة؟'))return;
      byId('daughter-invitation').hidden=true;
      byId('daughter-invitation-code').value='';
      byId('daughter-invitation-password').value='';
      const invitation=await api(endpoint+(recover?'/recover':'/invite'),{});
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
  byId('person-access').textContent = person.gender==='f'
    ? 'اسم ظاهر لأفراد العائلة المسجّلين عند اختيار «الكل».'
    : person.writable
    ? 'يمكنك تعديل هذا الاسم وإضافة الأبناء لهذا الفرع.'
    : 'يمكنك الاطلاع على هذا الفرع. التعديل متاح لصاحب الفرع والمدير.';
  byId('edit-form').hidden = !person.writable;
  byId('person-name').value = person.name;
  byId('add-form').hidden = !people.some(candidate => candidate.writable);
  if (person.writable && (user?.role==='admin'||byId('child-gender').value==='m')) byId('parent').value = person.id;
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
  const ownBranch=byId('tree-scope').value==='mine'?descendants(people,user?.personId):null;
  const shown = ordered.filter(person => (!ownBranch||ownBranch.has(person.id)) &&
    (!search||person.name.includes(search)));
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
  const editing = document.activeElement?.closest('#edit-form, #add-form, #title-form');
  const draft = editing ? [...editing.querySelectorAll('input,select')].map(input=>[input,input.value]) : [];
  if(newer){
    beforeSnapshot = result.before || treeSnapshot;
    treeSnapshot = {title:result.title,people:result.people,revision:result.revision};
  }
  privatePeople = nextPrivate;
  people = [...treeSnapshot.people,...privatePeople];
  byId('tree-title').value = result.title || 'شجرة العائلة';
  byId('family-title').textContent = byId('tree-title').value;
  const writable = people.filter(person => person.writable);
  const oldBatchParent=byId('batch-parent').value;
  byId('batch-parent').replaceChildren(...treeSnapshot.people.filter(person=>person.writable).map(option));
  if([...byId('batch-parent').options].some(item=>item.value===oldBatchParent))byId('batch-parent').value=oldBatchParent;
  byId('batch-section').hidden=!writable.length;
  refreshCorrectionChoices();
  byId('parent').replaceChildren(...writable.map(option));
  byId('invite-person').replaceChildren(...treeSnapshot.people.map(option));
  renderPeople();
  const current = people.find(person => person.id === selectedId);
  const initial = current || people.find(person => person.id === user.personId) || writable[0] || people[0];
  if (initial) selectPerson(initial.id);
  if(writable.some(person=>person.id===currentParent))byId('parent').value=currentParent;
  byId('add-form').hidden = writable.length === 0;
  for(const [input,value] of draft){
    if(input.tagName!=='SELECT' || [...input.options].some(option=>option.value===value))input.value=value;
  }
  setChildForm();
  if (firstSnapshot) locatePerson(initial?.id);
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

async function enter() {
  user = await api('/api/me');
  const scope=byId('tree-scope');
  scope.querySelector('option[value="mine"]').hidden=!user.personId;
  scope.value=user.personId?'mine':'shared';
  byId('access').hidden = true;
  byId('workspace').hidden = false;
  byId('session').hidden = false;
  byId('identity').textContent = user.identifier;
  byId('permission-summary').textContent = user.role === 'admin'
    ? 'أنت المدير العام. يمكنك إدارة جميع الأفراد وحسابات العائلة.'
    : user.canAddDaughter
      ? 'يمكنك تعديل بياناتك وبيانات أبنائك وأحفادك، والاطلاع على شجرة العائلة.'
      : 'يظهر حسابك عند موقعك في الشجرة. اختر «الكل» للاطلاع على أفراد العائلة المسجّلين.';
  byId('administration').hidden = user.role !== 'admin';
  byId('child-gender').querySelector('option[value="f"]').disabled=!(user.role==='admin'||user.canAddDaughter);
  await loadTree();
  await loadPrivateDaughters();
  startLive();
}

byId('show-login').addEventListener('click', () => setAccessMode(false));
byId('show-activate').addEventListener('click', () => setAccessMode(true));
byId('search').addEventListener('input', renderPeople);
byId('child-gender').addEventListener('change',setChildForm);
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
    locatePerson(id);
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
  await loadPrivateDaughters();
  showTreeChange(lastChangedPerson());
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
    const gender=byId('child-gender').value;
    const parentId=byId('parent').value;
    const result=await api('/api/people', {parentId, gender, name:byId('child-name').value.trim()});
    byId('child-name').value = '';
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
      personId
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
  const parent=people.find(person=>person.id===parentId&&person.writable);
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
  try { drawTree(fragment,{title:root.name,people:rows.filter(person=>kept.has(person.id))}); }
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
  if (!/الدخول|دخول|session|authenticated|unauthorized/i.test(error.message)) notify(error.message, true);
});
