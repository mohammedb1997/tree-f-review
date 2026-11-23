'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright-core');
const {createPortal}=require('./server.cjs');
const core=require('../Claud/botanical-core.js');

test('mobile person actions lock the father and save private profiles and confirmed removals',{timeout:45000},async()=>{
  const port=4196,origin='http://127.0.0.1:'+port;
  const portal=createPortal({filename:':memory:',origin});
  const password='Mobile-Actions-Test-2026';
  await portal.initialize({login:'admin@example.test',password,document:core.fixture(10)});
  let browser;
  try{
    await once(portal.server.listen(port,'127.0.0.1'),'listening');
    browser=await chromium.launch({channel:'chrome',chromiumSandbox:true});
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    page.setDefaultTimeout(5000);
    await page.goto(origin);
    await page.locator('#identifier').fill('admin@example.test');
    await page.locator('#password').fill(password);
    await page.locator('#login-form button[type=submit]').tap();
    await page.locator('#tree-focus-toggle').tap();
    assert.equal(await page.locator('#tree-focus-toggle').getAttribute('aria-pressed'),'true');
    const treeFrame=await page.locator('#tree-stage').boundingBox();
    assert(treeFrame.width>=370&&treeFrame.height>=690,JSON.stringify(treeFrame));
    const graphWidth=await page.locator('#tree-view svg').evaluate(svg=>svg.clientWidth);
    const parentId='test-1';
    const parentNode=page.locator(`#tree-view [data-person-id="${parentId}"]`);
    await parentNode.tap();
    const inline=page.locator('#tree-node-actions');
    assert((await inline.boundingBox()).y>=(await parentNode.boundingBox()).y+(await parentNode.boundingBox()).height);
    await page.locator('#botanical-zoom-in').tap();
    assert(await page.locator('#tree-view svg').evaluate(svg=>svg.clientWidth)>graphWidth);
    await page.locator('#tree-node-detail').waitFor();
    await inline.getByRole('button',{name:'إضافة'}).tap();
    const dialog=page.locator('#person-action-dialog');
    assert.equal(await page.locator('#parent').isDisabled(),true);
    assert.equal(await page.locator('#parent').inputValue(),parentId);
    const bounds=await dialog.boundingBox();
    assert(bounds.width<=390&&bounds.y+bounds.height<=845);
    await page.locator('#child-gender').selectOption('f');
    await page.locator('#child-name').fill('ابنة تجريبية سريعة');
    await page.locator('#child-birth').fill('2015-06-20');
    assert.match(await page.locator('#child-age').textContent(),/العمر/);
    const png=await page.evaluate(()=>document.createElement('canvas').toDataURL().split(',')[1]);
    const photo={name:'sample.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')};
    await page.locator('#child-photo').setInputFiles(photo);
    await page.locator('#add-child-button').tap();
    await dialog.waitFor({state:'hidden'});
    await page.locator('#tree-focus-toggle').tap();
    await page.locator('#tree-scope').selectOption('all');
    const daughter=page.locator('#people').getByRole('button',{name:/ابنة تجريبية سريعة/});
    const daughterId=await daughter.getAttribute('data-person-id');
    await daughter.tap();
    await page.locator('#person-edit').tap();
    await page.locator('#person-photo-preview').waitFor();
    assert.equal(await page.locator('#person-birth').inputValue(),'2015-06-20');
    await page.locator('#person-name').fill('ابنة بعد تعديل الملف');
    await page.locator('#person-life').selectOption('deceased');
    await page.locator('#person-phone').fill('0501234567');
    await page.locator('#person-email').fill('person@example.test');
    await page.locator('#edit-form button[type=submit]').tap();
    await dialog.waitFor({state:'hidden'});
    await page.locator('#person-title').getByText('ابنة بعد تعديل الملف',{exact:true}).waitFor();
    const profileRoute=origin+'/api/people/'+daughterId+'/profile';
    const profile=await (await page.request.get(profileRoute)).json();
    assert.equal(profile.lifeStatus,'deceased');
    assert.equal(profile.phone,'0501234567');
    assert.equal(profile.email,'person@example.test');
    assert.equal(profile.birthDate,'2015-06-20');
    assert.match(profile.photo,/^data:image\/jpeg;base64,/);
    const shared=await (await page.request.get(origin+'/api/tree?scope=all')).text();
    assert(!shared.includes(profile.phone)&&!shared.includes(profile.email)&&!shared.includes(profile.photo));
    const sibling=await browser.newPage();
    const invite=await page.request.post(origin+'/api/invites',{headers:{origin},data:{personId:'test-2'}});
    const {code,initialPassword}=await invite.json();
    const activation=await sibling.request.post(origin+'/api/activate',{headers:{origin},data:{code,initialPassword,password}});
    assert.equal(activation.status(),200);
    assert.equal((await sibling.request.get(profileRoute)).status(),403);
    assert.equal((await sibling.request.delete(origin+'/api/people/'+daughterId,{headers:{origin},data:{anchor:parentId}})).status(),403);
    assert.equal((await page.request.delete(origin+'/api/people/test-0',{headers:{origin},data:{anchor:'test-0'}})).status(),409);
    await page.locator('#person-edit').tap();
    await page.locator('#person-photo-preview').waitFor();
    assert.equal(await page.locator('#person-life').inputValue(),'deceased');
    await page.locator('#person-action-close').tap();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'person-edit');
    await page.locator(`#tree-view [data-person-id="${parentId}"]`).tap();
    await page.locator('#person-delete').tap();
    await page.locator('#person-delete-target').selectOption(daughterId);
    await page.locator('#person-delete-form button[type=submit]').tap();
    assert.equal(await dialog.isVisible(),true);
    await page.locator('#person-delete-confirm').check();
    await page.locator('#person-delete-form button[type=submit]').tap();
    await dialog.waitFor({state:'hidden'});
    await page.locator('#people').getByRole('button',{name:/ابنة بعد تعديل الملف/}).waitFor({state:'detached'});
    assert.equal((await page.request.get(profileRoute)).status(),403);
    await page.locator('#person-add').tap();
    await page.locator('#child-gender').selectOption('m');
    await page.locator('#child-name').fill('ابن تجريبي سريع');
    await page.locator('#add-child-button').tap();
    const son=page.locator('#people').getByRole('button',{name:/ابن تجريبي سريع/});
    const sonId=await son.getAttribute('data-person-id');
    await son.tap();
    await page.locator('#person-edit').tap();
    await page.locator('#person-gender').selectOption('f');
    await page.locator('#edit-form button[type=submit]').tap();
    await dialog.waitFor({state:'hidden'});
    const revised=await (await page.request.get(origin+'/api/tree?scope=all')).json();
    assert.equal(revised.privatePeople.find(person=>person.id===sonId).parentId,parentId);
    assert.equal(revised.people.some(person=>person.id===sonId),false);
    assert.equal(revised.before?.people.some(person=>person.id===sonId)||false,false);
    await son.tap();
    await page.locator('#person-delete').tap();
    await page.locator('#person-delete-target').selectOption(sonId);
    await page.locator('#person-delete-confirm').check();
    await page.locator('#person-delete-form button[type=submit]').tap();
    await son.waitFor({state:'detached'});
    const includeOrigin={headers:{origin}};
    const addition=await sibling.request.post(origin+'/api/people',{
      ...includeOrigin,data:{parentId:'test-2',gender:'m',name:'ابن بدعوة مباشرة'}
    });
    assert.equal(addition.status(),200);
    const {id:invitedId}=await addition.json();
    const denied=await sibling.request.post(origin+'/api/people/test-1/invite',{...includeOrigin,data:{}});
    assert.equal(denied.status(),403);
    await sibling.goto(origin);
    await sibling.locator('#people').getByRole('button',{name:/ابن بدعوة مباشرة/}).click();
    await sibling.locator('#person-edit').click();
    await sibling.locator('#invite-selected-person').click();
    const sharedLink=sibling.locator('#selected-invitation-link');
    await sharedLink.waitFor();
    const invitationUrl=await sharedLink.inputValue();
    const temporary=await sibling.locator('#selected-invitation-password').inputValue();
    assert(!invitationUrl.includes(temporary));
    assert(!decodeURIComponent(await sibling.locator('#selected-invitation-mail').getAttribute('href')).includes(temporary));
    const invited=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await invited.goto(invitationUrl);
    const childInviteCode=new URLSearchParams(new URL(invitationUrl).hash.slice(1)).get('invite');
    await invited.locator('#code').waitFor();
    assert.equal(await invited.locator('#code').inputValue(),childInviteCode);
    await invited.locator('#initial-password').fill(temporary);
    await invited.locator('#new-password').fill('Invited-Family-Member-2026');
    await invited.locator('#activate-form button[type=submit]').tap();
    const color=invited.locator('#tree-color-mode');
    await color.waitFor();
    assert.equal(await color.inputValue(),'membership');
    assert.equal(await invited.locator('#tree-scope').inputValue(),'family');
    const visibleTree=invited.locator('#tree-view');
    const own=visibleTree.locator('[data-person-id="'+invitedId+'"]');
    assert.equal(await own.getAttribute('data-membership'),'mine');
    assert.equal(await visibleTree.locator('[data-person-id="test-1"]').getAttribute('data-membership'),'muted');
    const linkedDaughter=await invited.request.post(origin+'/api/people',{
      ...includeOrigin,data:{parentId:invitedId,gender:'f',name:'ابنة فرع العضو التجريبي'}
    });
    assert.equal(linkedDaughter.status(),200);
    const {id:linkedDaughterId}=await linkedDaughter.json();
    const daughterNode=visibleTree.locator('[data-person-id="'+linkedDaughterId+'"]');
    assert.equal(await daughterNode.getAttribute('data-membership'),'mine');
    await color.selectOption('generation');
    assert.equal(await own.getAttribute('data-tone'),'generation');
    await color.selectOption('gender');
    assert.equal(await own.getAttribute('data-tone'),'gender');
  }finally{
    await browser?.close();
    await new Promise(resolve=>portal.server.close(resolve));
  }
});

test('batch entry, review workflow, audit and branch export in Chrome',{timeout:35000},async()=>{
  const port=4188;
  const origin='http://127.0.0.1:'+port;
  const portal=createPortal({filename:':memory:',origin});
  const password='Workflow-Test-2026';
  const fixture=core.fixture(10);
  for(const person of fixture.persons.filter(item=>['test-5','test-6'].includes(item.personId))){
    person.fullName='اسم أخ مكرر في بيانات الاختبار';
    if('name' in person)person.name=person.fullName;
  }
  await portal.initialize({login:'admin@example.test',password,document:fixture});
  let browser;
  try{
    await once(portal.server.listen(port,'127.0.0.1'),'listening');
    browser=await chromium.launch({channel:'chrome',chromiumSandbox:true});
    const admin=await browser.newPage({viewport:{width:1366,height:960}});
    const member=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
    const errors=[];
    for(const page of [admin,member]){
      page.setDefaultTimeout(5000);
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin);
    }
    await admin.locator('#identifier').fill('admin@example.test');
    await admin.locator('#password').fill(password);
    await admin.locator('#login-form button[type=submit]').click();
    await admin.locator('#invite-person').selectOption('test-1');
    await admin.locator('#invite-form button[type=submit]').click();
    await admin.locator('#invitation').waitFor();
    await member.locator('#show-activate').click();
    await member.locator('#code').fill(await admin.locator('#invitation-code').inputValue());
    await member.locator('#initial-password').fill(await admin.locator('#invitation-password').inputValue());
    await member.locator('#new-password').fill(password);
    await member.locator('#activate-form button[type=submit]').click();
    await member.locator('#tree-view .is-self').waitFor();
    await member.locator('.display-options summary').click();
    await member.locator('#tree-drawing').selectOption('botanical');
    const drawing=member.locator('#tree-view[data-drawing="botanical"] svg');
    try{await drawing.waitFor();}
    catch(error){assert.deepEqual(errors,[]);throw error;}
    const fitWidth=Number(await drawing.getAttribute('width'));
    await member.locator('#botanical-zoom-in').click();
    assert(Number(await drawing.getAttribute('width'))>fitWidth);
    await member.locator('#botanical-fit').click();
    const owner=drawing.locator('[data-person-id="test-1"]');
    await owner.focus();
    await owner.press('Enter');
    await member.locator('#botanical-add').click();
    assert.equal(await member.locator('#parent').inputValue(),'test-1');
    await member.locator('#child-name').fill('ابن من طريقة العرض النباتية');
    await member.locator('#add-child-button').click();
    const child=drawing.getByText('ابن من طريقة العرض النباتية',{exact:true});
    await child.waitFor();
    const childID=await child.locator('..').getAttribute('data-person-id');
    assert.equal(await drawing.locator(`[data-parent-id="test-1"][data-child-id="${childID}"]`).count(),1);
    await member.locator('#tree-drawing').selectOption('classic');
    for(const id of ['batch','correction','history','export'])await member.locator(`#${id}-section summary`).click();
    await admin.locator('#correction-section summary').click();
    // All writes below go through the application's visible workflow.
    const names=['حفيد من الدفعة الأولى','حفيد من الدفعة الثانية'];
    await member.locator('#batch-parent').selectOption('test-1');
    await member.locator('#batch-names').fill(names.join('\n'));
    await member.locator('#batch-preview-button').click();
    await member.locator('#batch-preview').getByText(names[0],{exact:true}).waitFor();
    assert(!(await member.locator('#tree-view').textContent()).includes(names[0]));
    await member.locator('#batch-save').click();
    await member.locator('#tree-view').getByText(names[0],{exact:true}).waitFor();
    await member.locator('#tree-view').getByText(names[1],{exact:true}).waitFor();
    const newId=await member.locator('#tree-view').getByRole('button',{name:names[0],exact:true}).getAttribute('data-person-id');
    await member.locator('#correction-person').selectOption(newId);
    await member.locator('#correction-parent').selectOption('test-4');
    await member.locator('#correction-note').fill('تصحيح نسب تجريبي');
    await member.locator('#correction-form button[type=submit]').click();
    await admin.locator('#corrections-list').getByText('تصحيح نسب تجريبي').waitFor();
    const approve=async()=>{
      admin.once('dialog',dialog=>dialog.accept());
      const [response]=await Promise.all([
        admin.waitForResponse(item=>item.request().method()==='POST'&&item.url().endsWith('/decision')),
        admin.locator('#corrections-list button[data-decision="approve"]').click()
      ]);
      assert.equal(response.status(),200,await response.text());
    };
    await approve();
    await member.locator('#tree-view').locator(`[data-child-id="${newId}"][data-parent-id="test-4"]`).waitFor({state:'attached'});
    await member.locator('#history-list').getByText(/دفعة/).waitFor();
    await member.locator('#correction-kind').selectOption('merge');
    await member.locator('#correction-person').selectOption('test-5');
    await member.locator('#correction-parent').selectOption('test-6');
    await member.locator('#correction-note').fill('مراجعة تكرار تجريبية');
    await member.locator('#correction-form button[type=submit]').click();
    await admin.locator('#corrections-list').getByText('مراجعة تكرار تجريبية').waitFor();
    await approve();
    await member.locator('#tree-view [data-person-id="test-5"]').waitFor({state:'detached'});
    await member.locator('#tree-view [data-person-id="test-6"]').waitFor();
    const downloadEvent=member.waitForEvent('download');
    await member.locator('#branch-svg-export').click();
    const download=await downloadEvent;
    assert.match(download.suggestedFilename(),/\.svg$/i);
    const svg=readFileSync(await download.path(),'utf8');
    assert(svg.includes(names[0])&&svg.includes(names[1]));
    assert(!svg.includes('عبدالرحمن 2'));
    const [htmlExport]=await Promise.all([member.waitForEvent('download'),member.locator('#branch-export').click()]);
    assert.match(htmlExport.suggestedFilename(),/\.html$/i);
    const html=readFileSync(await htmlExport.path(),'utf8');
    assert.match(html,/<html[^>]+dir=["']rtl["']/i);
    assert(html.includes(names[0])&&html.includes(names[1])&&!html.includes('عبدالرحمن 2'));
    assert.deepEqual(errors,[]);
  }finally{
    if(browser)await browser.close();
    if(portal.server.listening)await new Promise(resolve=>portal.server.close(resolve));
  }
});

test('public Chrome preview is interactive and resets to synthetic data',{timeout:20000},async()=>{
  const preview=process.env.TREEF_PREVIEW_URL || pathToFileURL(path.join(__dirname,'preview.html')).href;
  const browser=await chromium.launch({channel:'chrome',chromiumSandbox:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    page.setDefaultTimeout(6000);
    const apiRequests=[];
    page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))apiRequests.push(request.url());});
    await page.goto(preview);
    await page.locator('#workspace').waitFor();
    const name='عضو وهمي لمعاينة النشر';
    await page.locator('#batch-section summary').click();
    await page.locator('#batch-parent').selectOption({index:1});
    await page.locator('#batch-names').fill(name);
    await page.locator('#batch-preview-button').click();
    await page.locator('#batch-preview').getByText(name,{exact:true}).waitFor();
    await page.locator('#batch-save').click();
    await page.locator('#tree-view').getByRole('button',{name,exact:true}).waitFor({state:'attached'});
    await page.reload();
    await page.locator('#tree-view .tree-person').first().waitFor({state:'attached'});
    assert.equal(await page.locator('#tree-view').getByRole('button',{name,exact:true}).count(),0);
    assert.deepEqual(apiRequests,[]);
  }finally{
    await browser.close();
  }
});

test('public review: member mode, scoped search and admin switch',{timeout:20000},async()=>{
  const preview=process.env.TREEF_PREVIEW_URL || pathToFileURL(path.join(__dirname,'preview.html')).href;
  const browser=await chromium.launch({channel:'chrome',chromiumSandbox:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    page.setDefaultTimeout(6000);
    const requests=[];
    page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))requests.push(request.url());});
    await page.goto(preview);
    await page.getByRole('link',{name:'جرّب كعضو'}).tap();
    await page.locator('#tree-view [data-person-id="father"]').waitFor({state:'attached'});
    assert.equal(await page.locator('#tree-scope').inputValue(),'mine');
    assert.equal(await page.locator('#administration').isVisible(),false);
    assert.equal(await page.locator('#tree-view [data-person-id="uncle"]').count(),0);
    await page.locator('.workspace-shortcut').tap();
    await page.locator('#search').fill('إبراهيم');
    await page.locator('#search-empty').waitFor();
    await page.locator('#search-main-tree').tap();
    await page.locator('#people [data-person-id="uncle"]').waitFor();
    assert.equal(await page.locator('#tree-scope').inputValue(),'shared');
    await page.locator('#people [data-person-id="uncle"]').tap();
    assert.match(await page.locator('#person-title').textContent(),/إبراهيم/);
    await page.locator('#return-to-results').tap();
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.personId),'uncle');
    assert.equal(await page.locator('#search').inputValue(),'إبراهيم');
    await page.locator('#clear-search').tap();
    assert.equal(await page.locator('#search').inputValue(),'');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'search');
    await page.getByRole('link',{name:'جرّب كمدير'}).tap();
    await page.locator('#administration').waitFor();
    assert.equal(await page.locator('#tree-scope').inputValue(),'shared');
    assert.deepEqual(requests,[]);
  }finally{
    await browser.close();
  }
});
