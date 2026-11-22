'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {mkdir}=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright-core');
const {createDemoServer}=require('./serve.cjs');
const core=require('../../Claud/botanical-core.js');

const root=path.resolve(__dirname,'../..');

test('3D tour opens 50, 150 and 500 people with Arabic search and lineage',{timeout:45000},async()=>{
  const server=createDemoServer();
  await once(server.listen(0,'127.0.0.1'),'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({channel:'chrome',chromiumSandbox:true});
    const errors=[];
    const evidence=path.join(root,'evidence','family-portal');
    await mkdir(evidence,{recursive:true});
    for(const width of [1280,390]){
      const page=await browser.newPage({viewport:{width,height:900},hasTouch:width===390,isMobile:width===390});
      page.on('pageerror',error=>errors.push(error.message));
      page.on('request',request=>assert.equal(new URL(request.url()).origin,origin));
      await page.goto(origin+'/portal/preview.html');
      await page.getByRole('link',{name:'استكشف الشجرة ثلاثية الأبعاد'}).click();
      await page.locator('#viewport canvas').waitFor();
      assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
      for(const count of [50,150,500]){
        const started=Date.now();
        await page.locator('#size').selectOption(String(count));
        assert.equal(await page.locator('#people option').count(),count+1);
        await page.locator('#people').selectOption('test-'+(count-1));
        const fullName=await page.locator('#person-name').textContent();
        assert(fullName.endsWith(' '+(count-1)));
        assert(await page.locator('#lineage button').count()>=3);
        await page.locator('#search').fill(fullName);
        assert.equal(await page.locator('#people option').count(),2);
        await page.locator('#search').press('Enter');
        const selected=page.locator('#labels [aria-current=true]');
        await selected.waitFor();
        await page.locator('#color-mode').selectOption('generation');
        await selected.and(page.locator('[data-category^="الجيل"]')).waitFor();
        assert((await page.locator('#legend').textContent()).includes('الجيل'));
        await page.locator('#color-mode').selectOption('gender');
        await selected.and(page.locator('[data-category="ذكر"]')).waitFor();
        const maleColor=await selected.evaluate(node=>getComputedStyle(node).color);
        await page.locator('#search').fill('مريم التجريبية '+(count-5));
        await page.locator('#search').press('Enter');
        await selected.and(page.locator('[data-category="أنثى"]')).waitFor();
        assert.equal(await page.locator('#person-gender').textContent(),'أنثى');
        assert.notEqual(await selected.evaluate(node=>getComputedStyle(node).color),maleColor);
        await page.locator('#color-mode').selectOption('kinship');
        await selected.and(page.locator('[data-category="الشخص المحدد"]')).waitFor();
        assert((await page.locator('#legend').textContent()).includes('الأحفاد والذرية'));
        await page.locator('#lineage button').first().click();
        assert.notEqual(await page.locator('#person-name').textContent(),fullName);
        await page.locator('#overview').click();
        console.log(width+'px / '+count+' people: '+(Date.now()-started)+' ms including interaction');
      }
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const name=page.locator('#person-name');
      const initial=await name.textContent();
      const labels=page.locator('.node-label[aria-current=false]');
      const box=await labels.first().boundingBox();
      const x=Math.round(box.x+box.width/2),y=Math.round(box.y+box.height/2);
      const scene=page.locator('#viewport');
      const before=await scene.screenshot();
      if(width===390){
        const cdp=await page.context().newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+35,y:y+20}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await cdp.detach();
      }else{
        await page.mouse.move(x,y);
        await page.mouse.down();
        await page.mouse.move(x+45,y+22,{steps:5});
        await page.mouse.up();
      }
      assert.equal(await name.textContent(),initial);
      assert(!(await scene.screenshot()).equals(before),'Dragging a label should rotate the view');
      await page.locator('#overview').click();
      const target=labels.first();
      const targetName=await target.textContent();
      if(width===390)await target.tap();
      else await target.click();
      assert.equal(await name.textContent(),targetName);
      await page.locator('#focus-person').click();
      await page.locator('.node-label[aria-current=true]').waitFor();
      await page.locator('#toggle-labels').click();
      assert.equal(await page.locator('#labels').isVisible(),false);
      await page.locator('#zoom-out').click();
      await page.locator('#zoom-in').click();
      await page.locator('#toggle-labels').click();
      await page.locator('#overview').click();
      await page.screenshot({path:path.join(evidence,'world-'+width+'.png'),fullPage:true});
      await page.locator('#search').fill('');
      await page.locator('#people').selectOption('test-1');
      await page.locator('#pin-person').click();
      const panel=page.locator('#pinned-branch');
      const list=page.locator('#pinned-people button');
      const expected=new Set(['test-1']);
      const {nodes}=core.visible(core.fixture(500));
      for(const node of nodes)if(expected.has(node.parentId))expected.add(node.personId);
      const ids=await list.evaluateAll(items=>items.map(item=>item.dataset.personId));
      assert.deepEqual(ids,[...expected]);
      assert(await panel.isVisible());
      const labelsAfterPin=await page.locator('.node-label').evaluateAll(items=>items.map(item=>item.dataset.personId));
      assert(labelsAfterPin.length&&labelsAfterPin.every(id=>expected.has(id)));
      assert(await page.locator('#pinned-people').evaluate(list=>{
        const rows=[...list.children].slice(0,4).map(row=>row.getBoundingClientRect());
        return rows.every((row,i)=>i===0||row.top>=rows[i-1].bottom);
      }));
      await page.locator('#people').selectOption('test-2');
      assert.equal(await page.locator('#focus-person').isDisabled(),true);
      await page.locator('#overview').click();
      await page.locator('#zoom-out').click();
      assert.deepEqual(await list.evaluateAll(items=>items.map(item=>item.dataset.personId)),ids);
      await page.locator('#scope-branch').click();
      assert.equal(await page.locator('#focus-person').isEnabled(),true);
      await page.locator('#scope-branch').click();
      await list.first().click();
      assert.equal(await page.locator('#focus-person').isEnabled(),true);
      await page.screenshot({path:path.join(evidence,'world-pinned-'+width+'.png'),fullPage:true});
      await page.locator('#clear-pin').click();
      assert.equal(await panel.isVisible(),false);
      await page.close();
    }
    const fallback=await browser.newPage();
    await fallback.addInitScript(()=>{
      const getContext=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...options){
        if(type.startsWith('webgl'))return null;
        return getContext.call(this,type,...options);
      };
    });
    await fallback.goto(origin+'/portal/world/index.html');
    await fallback.locator('#fallback').waitFor();
    await fallback.locator('#people').selectOption('test-49');
    assert((await fallback.locator('#person-name').textContent()).endsWith(' 49'));
    await fallback.locator('#pin-person').click();
    assert.equal(await fallback.locator('#pinned-people li').count(),1);
    assert.deepEqual(errors,[]);
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
