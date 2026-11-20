'use strict';

const byId = id => document.getElementById(id);
let user = null;
let people = [];
let selectedId = null;

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
  user = null;
  people = [];
  selectedId = null;
  byId('workspace').hidden = true;
  byId('administration').hidden = true;
  byId('session').hidden = true;
  byId('access').hidden = false;
  byId('people').replaceChildren();
  byId('accounts').replaceChildren();
  byId('parent').replaceChildren();
  byId('invite-person').replaceChildren();
  for(const id of ['identity','person-title','person-parent','person-access','family-title','tree-count']){
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

async function loadTree() {
  const result = await api('/api/tree');
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
  if (user.role === 'admin') await loadAccounts();
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
}

byId('show-login').addEventListener('click', () => setAccessMode(false));
byId('show-activate').addEventListener('click', () => setAccessMode(true));
byId('search').addEventListener('input', renderPeople);

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
