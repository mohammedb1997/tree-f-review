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

test('large mobile tree keeps readable labels and offers the radial and entire-tree views',{timeout:30000},async()=>{
  const port=4195,origin='http://127.0.0.1:'+port;
  const portal=createPortal({filename:':memory:',origin});
  const password='Radial-Preview-Test-2026';
  const fixture=core.fixture(137);
  fixture.persons[22].fullName='عبدالرحمن بن عبدالله بن عبدالرحمن التجريبي الطويل';
  await portal.initialize({login:'admin@example.test',password,document:fixture});
  let browser;
  try{
    await once(portal.server.listen(port,'127.0.0.1'),'listening');
    browser=await chromium.launch({channel:'chrome',chromiumSandbox:true});
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    page.setDefaultTimeout(5000);
    await page.goto(origin+'/?tree=full&layout=classic');
    await page.locator('#identifier').fill('admin@example.test');
    await page.locator('#password').fill(password);
    await page.locator('#login-form button[type=submit]').tap();
    const layout=page.locator('#tree-drawing');
    await layout.waitFor();
    const canvas=page.locator('#tree-view');
    const svg=canvas.locator('svg');
    const scale=()=>svg.evaluate(node=>node.clientWidth/node.viewBox.baseVal.width);
    const links=()=>canvas.locator('[data-parent-id][data-child-id]').evaluateAll(paths=>paths.map(path=>[path.dataset.parentId,path.dataset.childId]));
    assert.equal(await layout.inputValue(),'classic');
    assert(await scale()>=0.79);
    const originalLinks=await links();
    await layout.selectOption('radial');
    assert.equal(await canvas.getAttribute('data-drawing'),'radial');
    assert.equal(await canvas.locator('[data-person-id]').count(),137);
    assert.deepEqual(await links(),originalLinks);
    assert.equal(originalLinks.length,136);
    assert(await svg.evaluate(node=>node.viewBox.baseVal.width<2450));
    const overlaps=await canvas.locator('.tree-person').evaluateAll(nodes=>{
      const boxes=nodes.map(node=>node.querySelector('rect').getBoundingClientRect());
      return boxes.some((a,i)=>boxes.slice(i+1).some(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top));
    });
    assert.equal(overlaps,false);
    await page.locator('#tree-overview').tap();
    assert(await scale()<0.79);
    assert((await svg.boundingBox()).width<=(await canvas.boundingBox()).width);
    assert.equal(await page.locator('#tree-node-actions').isVisible(),false);
    await page.locator('#botanical-fit').tap();
    assert(await scale()>=0.79);
    const reading=await scale();
    await page.locator('#botanical-zoom-out').tap();
    assert((await scale())<reading*0.85);
    await page.locator('#botanical-fit').tap();
    const session=await page.context().newCDPSession(page);
    const frame=await canvas.boundingBox();
    const x=Math.round(frame.x+frame.width/2),y=Math.round(frame.y+frame.height/2);
    const touchPoints=spread=>[{x:x-spread,y,id:1},{x:x+spread,y,id:2}];
    const pinch=async(start,end)=>{
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touchPoints(start).slice(0,1)});
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touchPoints(start)});
      await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touchPoints((start+end)/2)});
      await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touchPoints(end)});
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    };
    const graphPoint=()=>svg.evaluate((node,[x,y])=>{
      const bounds=node.getBoundingClientRect();
      return [(x-bounds.left)/bounds.width,(y-bounds.top)/bounds.height];
    },[x,y]);
    const anchor=await graphPoint();
    await pinch(42,76);
    const enlarged=await scale();
    assert(enlarged>reading*1.6);
    const anchored=await graphPoint();
    assert(anchor.every((coordinate,index)=>Math.abs(coordinate-anchored[index])<0.03));
    await pinch(76,34);
    assert((await scale())<reading*0.9);
    await page.locator('#botanical-fit').tap();
    const beforePan=await canvas.evaluate(node=>node.scrollLeft);
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:3}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-45,y,id:3}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-100,y,id:3}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(left=>document.getElementById('tree-view').scrollLeft>left+10,beforePan);
    await session.detach();
    await page.locator('#botanical-fit').tap();
    await canvas.locator('[data-person-id="test-0"]').tap();
    await page.locator('#tree-node-actions').waitFor();
    await layout.selectOption('classic');
    assert.equal(await canvas.locator('[data-person-id="test-0"]').getAttribute('aria-pressed'),'true');
  }finally{
    await browser?.close();
    await new Promise(resolve=>portal.server.close(resolve));
  }
});

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
    await page.locator('#live-tree.is-focused #tree-view svg').waitFor();
    assert.equal(await page.locator('#tree-focus-toggle').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#tree-drawing').inputValue(),'folded');
    const treeFrame=await page.locator('#tree-stage').boundingBox();
    assert(treeFrame.width>=370&&treeFrame.height>=670,JSON.stringify(treeFrame));
    const graphWidth=await page.locator('#tree-view svg').evaluate(svg=>svg.clientWidth);
    const parentId='test-1';
    const parentNode=page.locator(`#tree-view [data-person-id="${parentId}"]`);
    await parentNode.tap();
    const inline=page.locator('#tree-node-actions');
    assert.equal(await inline.locator('#tree-node-name').textContent(),await parentNode.getAttribute('aria-label'));
    assert((await inline.boundingBox()).y>=(await page.locator('#tree-view').boundingBox()).y+(await page.locator('#tree-view').boundingBox()).height-1);
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
    await page.locator('#tree-scope').selectOption('all');
    await page.locator('#tree-search-open').tap();
    await page.locator('#search').fill('ابنة تجريبية سريعة');
    const daughter=page.locator('#people').getByRole('button',{name:/ابنة تجريبية سريعة/});
    const daughterId=await daughter.getAttribute('data-person-id');
    await daughter.tap();
    await inline.getByRole('button',{name:'تعديل'}).tap();
    await page.locator('#person-photo-preview').waitFor();
    assert.equal(await page.locator('#person-birth').inputValue(),'2015-06-20');
    await page.locator('#person-name').fill('ابنة بعد تعديل الملف');
    await page.locator('#person-life').selectOption('deceased');
    await page.locator('#person-phone').fill('0501234567');
    await page.locator('#person-email').fill('person@example.test');
    await page.locator('#edit-form button[type=submit]').tap();
    await dialog.waitFor({state:'hidden'});
    await inline.getByText('ابنة بعد تعديل الملف',{exact:true}).waitFor();
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
    await page.locator('#tree-focus-toggle').tap();
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
    const classicInvitation=new URL(invitationUrl);
    classicInvitation.searchParams.set('layout','classic');
    await invited.goto(classicInvitation.href);
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
    assert.match(await invited.locator('#member-inviter').textContent(),/الدعوة من والدك/);
    await invited.locator('#member-lineage').getByRole('button',{name:/^الأب/}).waitFor();
    await invited.locator('#member-lineage').getByRole('button',{name:/^الجد/}).waitFor();
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

    const viewerAddition=await sibling.request.post(origin+'/api/people',{
      ...includeOrigin,data:{parentId:'test-2',gender:'f',name:'ابنة للمشاهدة فقط'}
    });
    assert.equal(viewerAddition.status(),200);
    const {id:viewerId}=await viewerAddition.json();
    await sibling.locator('#person-action-close').click();
    await sibling.locator('#people').getByRole('button',{name:/ابنة للمشاهدة فقط/}).click();
    await sibling.locator('#person-edit').click();
    await sibling.locator('#invite-allow-add').uncheck();
    await sibling.locator('#invite-allow-edit').uncheck();
    await sibling.locator('#invite-selected-person').click();
    await sharedLink.waitFor();
    const viewer=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await viewer.goto(await sharedLink.inputValue());
    await viewer.locator('#initial-password').fill(await sibling.locator('#selected-invitation-password').inputValue());
    await viewer.locator('#new-password').fill('Invited-Read-Only-2026');
    await viewer.locator('#activate-form button[type=submit]').tap();
    const sender=viewer.locator('#member-inviter');
    await sender.filter({hasText:'مشاهدة فقط'}).waitFor();
    assert.match(await sender.textContent(),/الدعوة من والدك/);
    const {permissions,lineage,invitedBy}=await (await viewer.request.get(origin+'/api/me')).json();
    assert.deepEqual(permissions,{add:false,edit:false});
    assert.equal(invitedBy.personId,'test-2');
    assert.deepEqual(lineage.map(row=>[row.id,row.relationship]),[['test-2','father'],['test-0','grandfather']]);
    await viewer.locator('#tree-view [data-person-id="'+viewerId+'"]').tap();
    const viewerActions=viewer.locator('#tree-node-actions');
    await viewerActions.waitFor();
    assert.equal(await viewerActions.locator('button:visible').count(),0);
    assert.equal((await viewer.request.patch(origin+'/api/people/'+viewerId+'/profile',{
      ...includeOrigin,data:{name:'تعديل ممنوع'}
    })).status(),403);
    assert.equal((await viewer.request.post(origin+'/api/people',{
      ...includeOrigin,data:{parentId:'test-2',gender:'m',name:'إضافة ممنوعة'}
    })).status(),403);
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
    await member.locator('#tree-focus-toggle').click();
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
    await page.goto(preview+'?tree=page');
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

test('folded tree shows authorized descendant counts and opens one generation at a time',{timeout:30000},async()=>{
  const preview=process.env.TREEF_PREVIEW_URL || pathToFileURL(path.join(__dirname,'preview.html')).href;
  const browser=await chromium.launch({channel:'chrome',chromiumSandbox:true});
  const number=new Intl.NumberFormat('ar-u-nu-arab');
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    page.setDefaultTimeout(5000);
    const canvas=page.locator('#tree-view');
    const ids=()=>canvas.locator('[data-person-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.personId).sort());
    const toggle=id=>canvas.locator('[data-branch-id="'+id+'"]');
    for(const size of [30,150,500]){
      await page.goto(preview+'?role=admin&tree=full&layout=folded&sample='+size);
      await canvas.locator('[data-person-id="test-0"]').waitFor();
      const fixture=core.visible(core.fixture(size)).nodes;
      const children=id=>fixture.filter(row=>row.parentId===id);
      const descendants=id=>children(id).reduce((total,child)=>total+1+descendants(child.personId),0);
      const founders=children('test-0');
      const top=['test-0',...founders.map(row=>row.personId)];
      const branch=founders.find(row=>children(row.personId).some(child=>children(child.personId).length)).personId;
      const next=children(branch);
      const sub=next.find(row=>children(row.personId).length).personId;
      assert.deepEqual(await ids(),top.toSorted());
      assert.equal(await toggle(branch).locator('text').textContent(),number.format(descendants(branch)));
      await toggle(branch).tap();
      assert.equal(await toggle(branch).getAttribute('aria-expanded'),'true');
      assert.deepEqual(await ids(),top.concat(next.map(row=>row.personId)).toSorted());
      await toggle(sub).press('Enter');
      const deeper=children(sub);
      assert.deepEqual(await ids(),top.concat(next,deeper).map(entry=>entry.personId||entry).toSorted());
      const links=await canvas.locator('[data-child-id]').evaluateAll(paths=>paths.map(path=>[path.dataset.parentId,path.dataset.childId]).sort());
      const visible=new Set(await ids());
      assert.deepEqual(links,fixture.filter(row=>visible.has(row.parentId)&&visible.has(row.personId)).map(row=>[row.parentId,row.personId]).sort());
      await toggle(branch).tap();
      assert.deepEqual(await ids(),top.toSorted());
      await toggle(branch).tap();
      assert.equal(await toggle(sub).getAttribute('aria-expanded'),'false');
    }
    await page.goto(preview+'?role=admin&tree=page&layout=folded');
    await page.locator('#search').fill('يوسف');
    await page.locator('#people [data-person-id="grandson"]').tap();
    await canvas.locator('[data-person-id="grandson"]').waitFor();
    await page.goto(preview+'?role=member&layout=folded');
    await canvas.locator('[data-person-id="father"]').waitFor();
    assert.deepEqual(await ids(),['father','son']);
    assert.equal(await toggle('son').locator('text').textContent(),number.format(1));
    await toggle('son').tap();
    assert.deepEqual(await ids(),['father','grandson','son']);
  }finally{
    await browser.close();
  }
});

test('mobile defaults to expanded branches and search selects a hidden name within the tree',{timeout:20000},async()=>{
  const preview=process.env.TREEF_PREVIEW_URL || pathToFileURL(path.join(__dirname,'preview.html')).href;
  const browser=await chromium.launch({channel:'chrome',chromiumSandbox:true});
  try{
    for(const [width,height] of [[360,800],[844,390],[820,1180]]){
      const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true});
      await page.goto(preview+'?role=admin&sample=500');
      const canvas=page.locator('#live-tree.is-focused #tree-view');
      await canvas.locator('svg').waitFor();
      assert.equal(await canvas.getAttribute('data-drawing'),'folded');
      assert(await canvas.locator('[data-person-id]').count()<20);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.locator('#tree-search-open').tap();
      const search=page.locator('#tree-search-dialog');
      const last=core.visible(core.fixture(500)).nodes.at(-1);
      await search.locator('#search').fill(last.fullName);
      await search.locator('[data-person-id="'+last.personId+'"]').tap();
      await search.waitFor({state:'hidden'});
      assert.equal(await canvas.locator('[data-person-id="'+last.personId+'"]').getAttribute('aria-pressed'),'true');
      await page.locator('#tree-node-actions').waitFor();
      assert.equal(await page.locator('#tree-node-name').textContent(),last.fullName);
      assert.equal(await page.locator('#tree-node-actions button[data-action="person-edit"]').isVisible(),true);
      await page.locator('#tree-focus-toggle').tap();
      await page.locator('.family-panel #search').waitFor();
      await page.close();
    }
  }finally{
    await browser.close();
  }
});

test('branch browser separates navigation from person actions on large mobile trees',{timeout:30000},async()=>{
  const preview=process.env.TREEF_PREVIEW_URL || pathToFileURL(path.join(__dirname,'preview.html')).href;
  const browser=await chromium.launch({channel:'chrome',chromiumSandbox:true});
  try{
    const page=await browser.newPage({viewport:{width:360,height:800},isMobile:true,hasTouch:true});
    const canvas=page.locator('#tree-view');
    const summary=canvas.locator('.branch-summary button');
    const names=()=>canvas.locator('li [data-person-id]').evaluateAll(rows=>rows.map(row=>row.dataset.personId));
    const actions=page.locator('#tree-node-actions');
    const parent=page.locator('#branch-parent');
    const home=page.locator('#branch-home');
    for(const size of [30,150,500]){
      await page.goto(preview+'?role=admin&layout=browse&sample='+size);
      await summary.waitFor();
      const fixture=core.visible(core.fixture(size)).nodes;
      const children=id=>fixture.filter(row=>row.parentId===id).map(row=>row.personId);
      const top=children('test-0');
      assert.equal(await summary.getAttribute('data-person-id'),'test-0');
      assert.deepEqual(await names(),top);
      const branch=top.find(id=>children(id).some(child=>children(child).length));
      await canvas.locator('[data-person-id="'+branch+'"]').tap();
      assert.equal(await summary.getAttribute('data-person-id'),'test-0');
      await actions.waitFor();
      await canvas.locator('[data-open-branch="'+branch+'"]').tap();
      assert.deepEqual(await names(),children(branch));
      assert.equal(await actions.isVisible(),false);
      const next=children(branch).find(id=>children(id).length);
      await canvas.locator('[data-open-branch="'+next+'"]').tap();
      assert.deepEqual(await names(),children(next));
      await parent.tap();
      assert.equal(await summary.getAttribute('data-person-id'),branch);
      await home.tap();
      assert.equal(await summary.getAttribute('data-person-id'),'test-0');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    const target=core.visible(core.fixture(500)).nodes.at(-1);
    await page.locator('#tree-search-open').tap();
    await page.locator('#search').fill(target.fullName);
    await page.locator('#people [data-person-id="'+target.personId+'"]').tap();
    assert.equal(await summary.getAttribute('data-person-id'),target.parentId);
    assert.equal(await canvas.locator('[data-person-id="'+target.personId+'"]').getAttribute('aria-pressed'),'true');
    await actions.locator('[data-action=person-add]').tap();
    await page.locator('#person-action-dialog').waitFor();
    assert.equal(await page.locator('#parent').inputValue(),target.personId);

    await page.goto(preview+'?role=member&access=view&layout=generations');
    assert.equal(await summary.getAttribute('data-person-id'),'son');
    await summary.tap();
    assert.equal(await actions.locator('button:visible').count(),0);
    assert.equal(await canvas.locator('[data-person-id="uncle"]').count(),0);

    await page.addInitScript(()=>{
      let preview;
      Object.defineProperty(globalThis,'familyPortalPreview',{get:()=>preview,set(adapter){
        preview={request:async(url,...args)=>{
          const result=await adapter.request(url,...args);
          if(url==='/api/tree')result.people.forEach(person=>{
            if(person.id!=='test-0')person.parentId='test-0';
          });
          return result;
        }};
      }});
    });
    await page.goto(preview+'?role=admin&layout=browse&sample=500');
    await summary.waitFor();
    assert.equal((await names()).length,30);
    await canvas.locator('.branch-more').tap();
    assert.equal((await names()).length,60);
    await page.locator('#tree-search-open').tap();
    await page.locator('#search').fill(target.fullName);
    await page.locator('#people [data-person-id="'+target.personId+'"]').tap();
    assert.equal(await canvas.locator('[data-person-id="'+target.personId+'"]').getAttribute('aria-pressed'),'true');
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
    await page.goto(preview+'?tree=page');
    await page.getByRole('link',{name:'جرّب كعضو'}).tap();
    await page.locator('#tree-view [data-person-id="father"]').waitFor({state:'attached'});
    await page.locator('#tree-focus-toggle').tap();
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
    await page.locator('#live-tree.is-focused #tree-view svg').waitFor();
    await page.locator('#tree-focus-toggle').tap();
    await page.locator('#administration').waitFor();
    assert.equal(await page.locator('#tree-scope').inputValue(),'shared');
    assert.deepEqual(requests,[]);
  }finally{
    await browser.close();
  }
});
