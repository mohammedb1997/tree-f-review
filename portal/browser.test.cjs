'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {mkdirSync}=require('node:fs');
const {chromium}=require('playwright-core');
const {createPortal}=require('./server.cjs');
const core=require('../Claud/botanical-core.js');

test('دعوة وتحديد موقع العضو ومقارنة تعديل حي في جلستين',{timeout:30000},async()=>{
  const origin='http://127.0.0.1:4186';
  const portal=createPortal({filename:':memory:',origin});
  const password='FamilyDemo-2026';
  await portal.initialize({login:'admin@example.test',password,document:core.fixture(10)});
  let browser;
  try{
    await once(portal.server.listen(4186,'127.0.0.1'),'listening');
    browser=await chromium.launch({channel:'chrome',chromiumSandbox:true});
    const errors=[];
    const admin=await browser.newPage({viewport:{width:1280,height:950}});
    const member=await browser.newPage({viewport:{width:390,height:844}});
    for(const page of [admin,member]){
      page.setDefaultTimeout(5000);
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin);
    }
    await admin.locator('#identifier').fill('admin@example.test');
    await admin.locator('#password').fill(password);
    await admin.locator('#login-form button[type=submit]').click();
    await admin.locator('#administration').waitFor();
    await admin.locator('#tree-title').fill('شجرة العائلة التجريبية');
    await admin.locator('#title-form button[type=submit]').click();
    await admin.locator('#family-title').filter({hasText:'شجرة العائلة التجريبية'}).waitFor();
    await admin.locator('#invite-person').selectOption('test-1');
    await admin.locator('#invite-form button[type=submit]').click();
    await admin.locator('#invitation-code').waitFor();
    const code=await admin.locator('#invitation-code').inputValue();
    assert.match(code,/^FAM-[0-9A-F]{16}$/);
    const initialPassword=await admin.locator('#invitation-password').inputValue();
    assert.equal(initialPassword.length,22);
    await member.locator('#show-activate').click();
    await member.locator('#code').fill(code);
    await member.locator('#initial-password').fill(initialPassword);
    await member.locator('#new-password').fill(password);
    await member.locator('#activate-form button[type=submit]').click();
    await member.locator('#workspace').waitFor();
    assert.equal(await member.locator('#administration').isVisible(),false);
    await member.locator('#tree-view svg [data-person-id="test-1"]').waitFor();
    assert.match(await member.locator('#person-title').textContent(),/أحمد 1/);
    await member.locator('#parent').selectOption('test-1');
    assert.equal(await member.locator('#parent option[value="test-2"]').count(),0);
    await member.locator('#child-name').fill('ابن تجريبي جديد');
    await member.locator('#add-form button[type=submit]').click();
    await member.locator('#people').getByRole('button',{name:/ابن تجريبي جديد/}).waitFor();
    await admin.waitForFunction(()=>document.querySelector('#after-tree')?.textContent.includes('ابن تجريبي جديد'),
      undefined,{timeout:5000});
    assert.equal(await admin.locator('#after-tree [data-change="added"]').count(),1);
    assert(!String(await admin.locator('#before-tree').textContent()).includes('ابن تجريبي جديد'));
    assert((await admin.locator('#after-tree').textContent()).includes('ابن تجريبي جديد'));
    await member.reload();
    await member.locator('#people').getByRole('button',{name:/ابن تجريبي جديد/}).waitFor();
    assert((await member.locator('#after-tree').textContent()).includes('ابن تجريبي جديد'));
    assert(await member.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await member.locator('#tree-scope').selectOption('branch');
    await member.locator('#parent').selectOption('test-4');
    await member.locator('#child-name').fill('حفيد اختبار التحديث');
    await member.locator('#add-form button[type=submit]').click();
    const grandchild=page=>page.evaluate(()=>{
      function centered(containerId,selector){
        const canvas=document.getElementById(containerId);
        const node=canvas.querySelector(selector);
        if(!node)return false;
        const rect=node.getBoundingClientRect(),view=canvas.getBoundingClientRect();
        const x=(rect.left+rect.right)/2,y=(rect.top+rect.bottom)/2;
        return x>=view.left&&x<=view.right&&y>=view.top&&y<=view.bottom;
      }
      const view=document.getElementById('tree-view').getBoundingClientRect();
      return {openOnScreen:view.top<innerHeight&&view.bottom>0,
        tree:centered('tree-view','[data-change="added"]'),
        before:centered('before-tree','[data-person-id="test-4"]'),
        after:centered('after-tree','[data-change="added"]')};
    });
    await member.locator('#notice').filter({hasText:'أُضيف الابن إلى الشجرة.'}).waitFor();
    const visible={openOnScreen:true,tree:true,before:true,after:true};
    assert.deepEqual(await grandchild(member),visible);
    await member.locator('#refresh').click();
    await member.locator('#notice').filter({hasText:'حُدّثت الشجرة.'}).waitFor();
    assert.deepEqual(await grandchild(member),visible);
    assert((await member.locator('#after-tree [data-change="added"]').textContent()).includes('حفيد اختبار التحديث'));
    assert(!(await member.locator('#before-tree').textContent()).includes('حفيد اختبار التحديث'));
    await member.locator('#logout').click();
    await member.locator('#identifier').fill(code);
    await member.locator('#password').fill(password);
    await member.locator('#login-form button[type=submit]').click();
    await member.locator('#workspace').waitFor();
    mkdirSync('evidence/family-portal',{recursive:true});
    await member.screenshot({path:'evidence/family-portal/member-mobile.png',fullPage:true});
    assert.deepEqual(errors,[]);
  }finally{
    if(browser)await browser.close();
    if(portal.server.listening)await new Promise(resolve=>portal.server.close(resolve));
  }
});
