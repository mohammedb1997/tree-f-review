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
