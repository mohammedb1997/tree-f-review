'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright-core');
const core = require('../Claud/botanical-core.js');

const fixture = name => pathToFileURL(path.join(__dirname,name)).href;
const baselines = path.join(__dirname,'design-snapshots');
const update = process.env.TREEF_UPDATE_DESIGN_SNAPSHOTS === '1';

async function withBrowser(run) {
  const browser = await chromium.launch({channel:'chrome',chromiumSandbox:true});
  try {
    await run(browser);
  } finally {
    await browser.close();
  }
}

async function pixelDifference(page, expected, actual) {
  return page.evaluate(async ([first, second]) => {
    async function decode(encoded) {
      const image = new Image();
      image.src = 'data:image/png;base64,' + encoded;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image,0,0);
      return {width:image.width,height:image.height,pixels:context.getImageData(0,0,image.width,image.height).data};
    }
    const [reference, current] = await Promise.all([decode(first),decode(second)]);
    if (reference.width !== current.width || reference.height !== current.height) return 'dimensions changed';
    let changed = 0;
    for (let offset = 0; offset < reference.pixels.length; offset += 4) {
      if (reference.pixels.subarray(offset,offset+4).some((value,channel) => value !== current.pixels[offset+channel])) changed++;
    }
    return changed;
  },[expected.toString('base64'),actual.toString('base64')]);
}

test('gallery: both starting points, search, access, add and reset',async () => withBrowser(async browser => {
  const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const external = [];
  page.on('request',request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  await page.goto(fixture('design-review.html'));
  for (const [start,count,gender,name] of [['branch',2,'m','ابن وهمي'],['tree',5,'f','ابنة وهمية']]) {
    await page.locator(`[data-start="${start}"]`).tap();
    assert.equal(await page.locator('#demo-people button').count(),count);
    assert.equal(await page.locator('#demo-tree .demo-node').count(),count);
    if (start === 'tree') {
      assert.equal(await page.locator('#demo-add').isVisible(),false);
      await page.locator('#demo-search').fill('سلمان');
      assert.equal(await page.locator('#demo-people button').count(),2);
      assert.match(await page.locator('#demo-people').textContent(),/أحمد.*يوسف/);
    }
    await page.locator('#find-me').tap();
    assert.equal(await page.evaluate(() => document.activeElement.id),'demo-title');
    await page.locator('#branch-view').tap();
    await page.locator('#demo-gender').selectOption(gender);
    await page.locator('#demo-name').fill(name);
    await page.locator('#demo-add button').tap();
    assert.equal(await page.locator('#demo-title').textContent(),name);
    assert.match(await page.locator('#demo-lineage').textContent(),/أحمد/);
    assert.match(await page.locator('#demo-message').textContent(),/تمت إضافة/);
    assert.equal(await page.locator('#demo-tree .demo-edge').count(),2);
  }
  await page.reload();
  assert.equal(await page.locator('#demo-people button').count(),2);
  assert.deepEqual(external,[]);
}));

test('responsive portal: long Arabic names and results for 30, 150 and 500 people',async () => withBrowser(async browser => {
  for (const [count,width,height,touch] of [[30,360,800,true],[150,768,1024,true],[500,1366,900,false]]) {
    const data = core.fixture(count);
    const parents = new Map(data.relationships.map(link => [link.childId,link.parentId]));
    const name = 'عبد الرحمن بن عبد العزيز بن سليمان بن عبد الله الطويل التجريبي';
    const last = data.persons.at(-1).personId;
    const people = data.persons.map(person => ({
      id:person.personId, name:person.personId===last?name:person.fullName,
      parentId:parents.get(person.personId)??null, writable:true
    }));
    const page = await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch});
    await page.addInitScript(({people}) => {
      let preview;
      Object.defineProperty(globalThis,'familyPortalPreview',{
        get:() => preview,
        set(adapter) {
          preview = {request:(url,...args) => url==='/api/tree'
            ? Promise.resolve({title:'عينة وهمية للمراجعة',revision:0,people})
            : adapter.request(url,...args)};
        }
      });
    },{people});
    await page.goto(fixture('preview.html')+'?tree=page&layout=classic');
    await page.locator('#tree-view [data-person-id]').last().waitFor({state:'attached'});
    assert.equal(await page.locator('#tree-view [data-person-id]').count(),count);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('.workspace-shortcut').click();
    await page.locator('#search').fill(name);
    const result = page.locator('#people button');
    assert.equal(await result.count(),1);
    assert.match(await result.textContent(),/الأب/);
    await result.click();
    assert.equal(await page.locator('#person-title').textContent(),name);
    assert.equal(await page.evaluate(() => document.activeElement.id),'person-title');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.close();
  }
}));

test('visual baselines: gallery and portal at 390, 768 and 1280 CSS px',async () => withBrowser(async browser => {
  if (update) fs.mkdirSync(baselines,{recursive:true});
  const comparison = await browser.newPage();
  const failures = [];
  for (const width of [390,768,1280]) {
    const page = await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1,reducedMotion:'reduce'});
    for (const [name,file,selector] of [
      ['gallery','design-review.html','#prototype'],
      ['components','design-review.html','#components'],
      ['portal','preview.html','.live-panel']
    ]) {
      if (name !== 'components') await page.goto(fixture(file)+(name==='portal'?'?tree=page':''));
      if (name === 'portal') await page.locator('#tree-view .tree-person').first().waitFor({state:'attached'});
      await page.evaluate(() => document.fonts.ready);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),`${name} overflows at ${width}`);
      const png = await page.locator(selector).screenshot({animations:'disabled',caret:'hide'});
      const filename = `${name}-${width}.png`;
      const baseline = path.join(baselines,filename);
      if (update) {
        fs.writeFileSync(baseline,png);
      } else {
        assert(fs.existsSync(baseline),`Missing reference: ${baseline}`);
        const difference = await pixelDifference(comparison,fs.readFileSync(baseline),png);
        if (difference !== 0) {
          const folder = fs.mkdtempSync(path.join(os.tmpdir(),'treef-design-'));
          const observed = path.join(folder,filename);
          fs.writeFileSync(observed,png);
          failures.push(`${filename}: ${difference}; actual: ${observed}`);
        }
      }
    }
    await page.close();
  }
  assert.deepEqual(failures,[],failures.join('\n'));
}));
