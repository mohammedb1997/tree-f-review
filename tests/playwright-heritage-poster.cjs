'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const core = require('../Claud/botanical-core.js');

const createPdf = process.argv.includes('--pdf');
const adaptive = true; // Current screen-first layout; --pdf still enforces the 9pt print gate.
const output = path.resolve(adaptive ? 'evidence/heritage-adaptive-review' : createPdf ? 'evidence/heritage-poster' : 'evidence/heritage-branch-review');
fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'treef-heritage-'));
const compare = process.argv.includes('--compare');
const report = { samples: [], pageErrors: [], externalRequests: [], sandbox: true };

async function save(page, id, filename) {
  const pending = page.waitForEvent('download');
  await page.locator(`#${id}`).click();
  const download = await pending;
  const target = path.join(output, filename);
  await download.saveAs(target);
  return target;
}

async function capture(context, file, filename) {
  const page = await context.newPage();
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  const view=await page.locator('svg').first().evaluate(el=>({w:el.viewBox.baseVal.width,h:el.viewBox.baseVal.height}));
  const scale=Math.min(950/view.w,1345/view.h),cw=Math.round(view.w*scale),ch=Math.round(view.h*scale);
  await page.setViewportSize({ width:cw, height:ch });
  await page.addStyleTag({ content: `html,body{margin:0!important;width:${cw}px!important;height:${ch}px!important;background:#faf5e8!important}svg:root,body>svg{display:block;width:${cw}px!important;height:${ch}px!important}` });
  await page.screenshot({ path: path.join(output, filename) });
  const nodes = await page.locator('[data-person-id]').count();
  await page.close();
  return nodes;
}

async function print(context, file, count) {
  const page = await context.newPage();
  await page.goto(pathToFileURL(file).href);
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => document.fonts.ready);
  const minimumPt = await page.locator('[data-poster-name]').evaluateAll(names => Math.min(...names.map(name => {
    const m = name.getScreenCTM();
    return parseFloat(getComputedStyle(name).fontSize) * Math.hypot(m.a, m.b) * 72 / 96;
  })));
  if (!adaptive || createPdf) assert(minimumPt >= 9, `Physical print minimum ${minimumPt} pt`);
  else assert(minimumPt > 0, 'Nonpositive lettering size'); // Screen review; paper sizing explicitly deferred.
  const filename = path.resolve(`output/pdf/heritage-poster-${count}.pdf`);
  if (createPdf) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    await page.pdf({ path: filename, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
  }
  await page.close();
  return { minimumPt, pdf: createPdf ? path.relative(process.cwd(), filename) : null };
}

async function review(context, file, count) {
  const page = await context.newPage();
  await page.goto(pathToFileURL(file).href);
  const art = page.locator('#art > svg');
  const original = await art.getAttribute('viewBox');
  await page.locator('#zoomIn').click();
  assert.notEqual(await art.getAttribute('viewBox'), original);
  await page.locator('#fit').click();
  assert.equal(await art.getAttribute('viewBox'), original);
  await page.locator('#query').fill('عبد الرحمن بن سليمان');
  await page.locator('#query').press('Enter');
  assert.match(await page.locator('#personName').textContent(), /عبد الرحمن بن سليمان/);
  assert.equal(await art.locator('[data-child-id].review-active').count(), 1);
  assert.equal(await art.locator('#lineageTrace path').count(), 1);
  assert.notEqual(await art.getAttribute('viewBox'), original);
  const visibleFont=await art.locator('[data-person-id="test-1"] text').evaluate(el=>Number(el.getAttribute('font-size'))*Math.hypot(el.getScreenCTM().a,el.getScreenCTM().b));
  assert(visibleFont>=18,'Search must zoom enough to read a name on an expanding board');
  if(count===150||count===500) await page.screenshot({path:path.join(output,`${count}-branch-detail.png`)});
  await page.locator('#relatives button').first().click();
  assert.match(await page.locator('#personName').textContent(), /عبدالله التجريبي/);
  await page.locator('#fit').click();
  assert.equal(await art.locator('#lineageTrace path').count(), 0);
  assert.equal(await art.getAttribute('viewBox'), original);
  assert.equal(await art.locator('[data-person-id]').count(), count);
  const box = await art.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+50,box.y+box.height/2+35,{steps:4});
  await page.mouse.up();
  assert.notEqual(await art.getAttribute('viewBox'), original);
  await page.locator('#fit').click();
  await page.setViewportSize({width:390,height:780});
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('#query').fill('عبد الرحمن بن سليمان');
  await page.locator('#query').press('Enter');
  assert(await page.locator('#person').isVisible());
  const mobileFont=await art.locator('[data-person-id="test-1"] text').evaluate(el=>Number(el.getAttribute('font-size'))*Math.hypot(el.getScreenCTM().a,el.getScreenCTM().b));
  assert(mobileFont>=18,'Readable search result at 390px');
  if (count === 280) await page.screenshot({path:path.join(output,'280-review-mobile.png')});
  await page.close();
}

async function run() {
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, chromiumSandbox: true,
      acceptDownloads: true, viewport: { width: 1366, height: 1000 }, ignoreDefaultArgs: ['--disable-client-side-phishing-detection', '--disable-ipc-flooding-protection', '--disable-popup-blocking', '--unsafely-disable-devtools-self-xss-warnings', '--enable-unsafe-swiftshader'] });
    context.on('page', page => page.on('pageerror', error => report.pageErrors.push(error.message)));
    await context.route('**/*', route => {
      if (!/^https?:/.test(route.request().url())) return route.continue();
      report.externalRequests.push(route.request().url());
      return route.abort();
    });
    const app = await context.newPage();
    const appUrl = pathToFileURL(path.resolve('Claud/family-tree.html')).href;
    await app.goto(appUrl);
    const preferredFixture = fs.readFileSync('evidence/organic-preview/51.json','utf8');
    await app.evaluate(value => localStorage.setItem('family-tree.botanical.v2', value), preferredFixture);
    await app.reload();
    await app.waitForFunction(() => window.familyTreeDiagnostics?.snapshot().persons.length === 51);
    await app.locator('#workspaceHeritagePoster').click();
    const picker = app.locator('#posterHeritageStyle');
    const radio = value => picker.locator(`input[value="${value}"]`);
    const choose = async value => {
      await picker.locator(`label:has(input[value="${value}"])`).click();
      assert.equal(await radio(value).isChecked(),true);
    };
    assert.equal(await radio('organic-improved').isChecked(),true);
    assert.equal(await picker.getByRole('radio').count(),3);
    await app.setViewportSize({width:390,height:844});
    assert(await picker.locator('img').evaluateAll(images=>images.every(img=>img.complete && img.naturalWidth>0)));
    await radio('organic-improved').focus();
    await radio('organic-improved').press('ArrowDown');
    assert.equal(await radio('organic').isChecked(),true);
    await app.screenshot({path:path.join(output,'51-template-picker-mobile.png')});
    const preferredSvg = await save(app, 'posterSvg', '51-organic-from-app.svg');
    const preferredHtml = await save(app, 'posterReviewHtml', '51-organic-from-app.html');
    const originalSvg = fs.readFileSync('evidence/organic-preview/51.svg','utf8');
    assert.equal(fs.readFileSync(preferredSvg,'utf8'), originalSvg, 'The UI must reproduce the accepted 51-person SVG');
    assert(fs.readFileSync(preferredHtml,'utf8').includes(originalSvg));
    await app.setViewportSize({width:1366,height:1000});
    await choose('organic-improved');
    assert.doesNotMatch(await app.locator('#posterStatus').textContent(), /تقاطعات|متداخلة|تمر خلف/);
    const improved = await save(app,'posterReviewHtml','51-organic-improved.html');
    const measured = await app.evaluate(() => {
      const doc = familyTreeDiagnostics.snapshot();
      const ctx = document.createElement('canvas').getContext('2d');
      const measure = (name, font) => {
        ctx.font = font + 'px Tahoma,Arial,sans-serif';
        return ctx.measureText(name).width;
      };
      return ['organic','organic-improved'].map(style => {
        const r = HeritagePoster.layout(doc,{width:420,height:594},measure,style);
        return {style,minimumPt:r.minimumPt,branchCrossings:r.branchCrossings,
          ribbonContacts:r.ribbonContacts,collisions:r.collisions,obstructedBranches:r.obstructedBranches};
      });
    });
    assert.equal(measured[1].branchCrossings,0);
    assert(measured[1].minimumPt>=measured[0].minimumPt);
    console.log(JSON.stringify({preferred51:measured}));
    const check = await context.newPage();
    await check.goto(pathToFileURL(improved).href);
    assert.equal(await check.locator('[data-person-id]').count(),51);
    assert.equal(await check.locator('[data-child-id]').count(),50);
    await check.screenshot({path:path.join(output,'51-organic-improved.png')});
    if(process.argv.includes('--preferred-pdf')){
      const file=path.resolve('output/pdf/organic-51-improved-a2.pdf');
      fs.mkdirSync(path.dirname(file),{recursive:true});
      const svg=await check.locator('#art svg').evaluate(el=>el.outerHTML);
      await check.setContent(`<!doctype html><meta charset="utf-8"><style>@page{size:420mm 594mm;margin:0}body{margin:0}svg{display:block;width:420mm;height:594mm}</style>${svg}`);
      await check.evaluate(()=>document.fonts.ready);
      await check.pdf({path:file,preferCSSPageSize:true,printBackground:true});
      await check.goto(pathToFileURL(improved).href);
    }
    await check.locator('#zoomIn').click();
    const zoomed = await check.locator('#art svg').getAttribute('viewBox');
    await check.emulateMedia({media:'print'});
    await check.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    assert.equal(await check.locator('header').isVisible(),false);
    assert.equal(await check.locator('#art svg').getAttribute('viewBox'),'0 0 1200 1697');
    await check.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    assert.equal(await check.locator('#art svg').getAttribute('viewBox'),zoomed);
    await check.close();
    await choose('growing');
    const growingSvg = await save(app,'posterSvg','51-growing-from-app.svg');
    const growingMarkup = fs.readFileSync(growingSvg,'utf8');
    assert.notEqual(growingMarkup,originalSvg);
    assert((await app.locator('#posterFrame').getAttribute('srcdoc')).includes(growingMarkup));
    await app.locator('#posterClose').click();
    await app.locator('#workspaceHeritagePoster').click();
    assert.equal(await radio('growing').isChecked(),true);
    await app.locator('#posterClose').click();
    report.preferredStyle = { count: 51, svgMatches: true, interactiveDownload: true,
      templatePicker:{mobileKeyboard:true, thumbnails:3, reopenRetained:true}, measured };
    for (const count of [30, 150, 280, 500]) {
      const fixture = core.fixture(count);
      fixture.title = 'شجرة عائلة السند · نموذج تجريبي';
      fixture.persons[1].fullName = 'عبد الرحمن بن سليمان بن إبراهيم بن عبد العزيز';
      fixture.persons[1].displayName = 'مختصر الاختبار';
      fixture.persons[1].notes = 'PRIVATE_HERITAGE_FIXTURE';
      if (count === 280) {
        for (const [order, id] of [4, 7, 10, 279].entries()) {
          const link = fixture.relationships.find(item => item.childId === `test-${id}`);
          link.parentId = fixture.rootPersonId;
          link.siblingOrder = 280 + order;
        }
      }
      await app.evaluate(value => localStorage.setItem('family-tree.botanical.v2', value), JSON.stringify(fixture));
      await app.reload();
      await app.waitForFunction(n => window.familyTreeDiagnostics?.snapshot().persons.length === n, count);
      const variants = await app.evaluate(({compare,adaptive}) => {
        const doc = familyTreeDiagnostics.snapshot();
        const ctx = document.createElement('canvas').getContext('2d');
        const measure = (text, size) => { ctx.font = `${size}px Tahoma,Arial,sans-serif`; return ctx.measureText(text).width; };
        const styles = adaptive ? ['weighted','growing'] : compare ? ['fan', 'crown', 'grove', 'packed', 'corridors', 'clear-branches', 'refined','distributed',undefined] : doc.persons.length <= 40 ? ['crown'] : ['packed','distributed',undefined];
        return styles.map(style => {
          const start = performance.now();
          const layout = HeritagePoster.layout(doc, { width: 700, height: 1000 }, measure, style);
          const joins = layout.links.every(link => link.samples[0].x === link.parent.x && link.samples[0].y === link.parent.y &&
            link.samples.at(-1).x === link.child.x && link.samples.at(-1).y === link.child.y);
          const routeLength = layout.links.reduce((sum,link)=>sum+link.samples.reduce((length,p,i)=>i ? length+
            Math.hypot(p.x-link.samples[i-1].x,p.y-link.samples[i-1].y) : length,0),0);
          return { style:layout.style, collisions: layout.collisions, obstructedBranches: layout.obstructedBranches, branchCrossings: layout.branchCrossings,
            boardWidth:layout.boardWidth||1200,boardHeight:layout.boardHeight||1697,font:layout.font,
            joins, routeLength:Math.round(routeLength), minPt: layout.minimumPt, ms: Math.round(performance.now() - start) };
        });
      }, {compare,adaptive});
      const before = await app.evaluate(() => JSON.stringify(familyTreeDiagnostics.snapshot()));
      if(adaptive) {
        const previous=await app.evaluate(()=>{
          const ctx=document.createElement('canvas').getContext('2d');
          return HeritagePoster.render(familyTreeDiagnostics.snapshot(),700,1000,(text,size)=>{
            ctx.font=`${size}px Tahoma,Arial,sans-serif`;return ctx.measureText(text).width;
          },'weighted').svg;
        });
        const file=path.join(output,`${count}-before.html`);
        fs.writeFileSync(file,`<!doctype html><meta charset="utf-8">${previous}`);
        await capture(context,file,`${count}-before.png`);
      }
      if (compare) {
        const alternative = await app.evaluate(() => {
        const ctx = document.createElement('canvas').getContext('2d');
        return HeritagePoster.render(familyTreeDiagnostics.snapshot(), 700, 1000, (text, size) => {
          ctx.font = `${size}px Tahoma,Arial,sans-serif`;
          return ctx.measureText(text).width;
        }, 'clear-branches').svg;
        });
        const alternateFile = path.join(output, `${count}-clear-branches.html`);
        fs.writeFileSync(alternateFile, `<!doctype html><meta charset="utf-8">${alternative}`);
        await capture(context, alternateFile, `${count}-clear-branches.png`);
      }
      await app.locator('#workspacePoster').click();
      await app.waitForFunction(() => document.getElementById('posterDialog').open && !document.getElementById('posterPrintNow').disabled);
      assert.equal(await picker.isVisible(),false);
      const original = await save(app, 'posterHtml', `${count}-original.html`);
      await app.locator('#posterClose').click();
      await app.locator('#workspaceHeritagePoster').click();
      const posterStyle = count <= 80 ? 'organic-improved' : 'growing';
      assert.equal(await radio(posterStyle).isChecked(),true);
      const preview = app.locator('#heritageReviewFrame').contentFrame();
      await preview.locator('#zoom').getByText('100%').waitFor();
      await preview.locator('#zoomIn').click();
      assert.notEqual(await preview.locator('#zoom').textContent(),'100%');
      const interactive = await save(app,'posterReviewHtml',`${count}-review.html`);
      await app.locator('#posterPrintSettings summary').click();
      await app.waitForFunction(() => document.getElementById('posterDialog').open && !document.getElementById('posterPrintNow').disabled);
      const svg = await save(app, 'posterSvg', `${count}-heritage.svg`);
      const html = await save(app, 'posterHtml', `${count}-heritage.html`);
      if (count === 150 || count === 500) {
        await app.locator('#posterWidth').fill('420');
        await app.locator('#posterHeight').fill('594');
        await app.locator('#posterApplySize').click();
        const file = await save(app,'posterBranchPages',`${count}-branch-pages.html`);
        const booklet = await context.newPage();
        try {
          await booklet.goto(pathToFileURL(file).href);
          const info=await booklet.evaluate(()=>{
            const pages=[...document.querySelectorAll('section')];
            return {pages:pages.length, links:pages.flatMap(page=>[...page.querySelectorAll('[data-child-id]')]
              .map(n=>JSON.stringify([n.dataset.parentId,n.dataset.childId]))),
              ids:[...document.querySelectorAll('[id]')].map(n=>n.id),
              continued:pages.slice(1).every(page=>page.querySelector('footer').textContent.includes('متابعة'))};
          });
          const expected=core.visible(fixture).nodes.slice(1).map(n=>JSON.stringify([n.parentId,n.personId]));
          assert.deepEqual(info.links.sort(),expected.sort());
          assert.equal(new Set(info.ids).size,info.ids.length);
          assert(info.continued && info.pages>1);
          const index = booklet.getByRole('navigation', {name:'فهرس لوحات الفروع'});
          assert.equal(await index.getByRole('link').count(),info.pages);
          await index.getByRole('link').nth(1).click();
          assert.equal(new URL(booklet.url()).hash,'#branch-page-2');
          assert(await booklet.evaluate(()=>[...document.querySelectorAll('footer a')]
            .every(a=>document.getElementById(a.hash.slice(1))!==null)));
          await booklet.emulateMedia({media:'print'});
          assert.equal(await index.isVisible(),false);
          if(count===150 && process.argv.includes('--branches-pdf')){
            const target=path.resolve('output/pdf/heritage-150-branches-a2.pdf');
            fs.mkdirSync(path.dirname(target),{recursive:true});
            await booklet.evaluate(()=>document.fonts.ready);
            await booklet.pdf({path:target,preferCSSPageSize:true,printBackground:true});
          }
          report.branchPages ??= [];
          report.branchPages.push({count,pages:info.pages,status:await app.locator('#posterStatus').textContent()});
        } finally {await booklet.close();}
        await app.locator('#posterWidth').fill('700');
        await app.locator('#posterHeight').fill('1000');
        await app.locator('#posterApplySize').click();
      }
      if (count === 150) {
        await app.locator('#posterWidth').fill('850');
        await app.locator('#posterHeight').fill('1200');
        await app.locator('#posterApplySize').click();
        const otherSize = await save(app,'posterSvg','150-alternate-size.svg');
        const artwork = filename => fs.readFileSync(filename,'utf8').replace(/^<svg[^>]*>/u,'');
        assert.equal(artwork(svg),artwork(otherSize),'Paper changed the artwork geometry');
        report.paperIndependent = true;
      }
      const verified = await app.locator('#posterFrame').contentFrame().locator('svg').evaluate(el => ({
        people: Array.from(el.querySelectorAll('[data-person-id]'), node => ({ id: node.dataset.personId, name: node.querySelector('[data-poster-name]').textContent.trim() })),
        relationships: Array.from(el.querySelectorAll('[data-child-id]'), node => [node.dataset.parentId, node.dataset.childId]),
        textInsideViewport: Array.from(el.querySelectorAll('[data-person-id]'), node => {
          const text = node.querySelector('text'), box = text.getBBox(), matrix = el.getScreenCTM().inverse().multiply(text.getScreenCTM());
          return [[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]].every(([x,y]) => {
            const p = new DOMPoint(x,y).matrixTransform(matrix);
            const view=el.viewBox.baseVal;
            return p.x > view.width*.039 && p.x < view.width*.961 && p.y > view.height*.103 && p.y < view.height*.831;
          });
        }).every(Boolean)
      }));
      assert.deepEqual(verified.people, core.visible(fixture).nodes.map(p => ({ id: p.personId, name: p.fullName })));
      assert.deepEqual(verified.relationships, core.visible(fixture).nodes.flatMap(p => p.children.map(child => [p.personId, child.personId])));
      assert(verified.textInsideViewport, 'Name outside poster crown');
      assert(!/مختصر الاختبار|PRIVATE_HERITAGE_FIXTURE/.test(fs.readFileSync(svg, 'utf8')));
      assert(!/مختصر الاختبار|PRIVATE_HERITAGE_FIXTURE/.test(fs.readFileSync(interactive, 'utf8')));
      if (count === 280) {
        const png = await save(app, 'posterPng', '280-print-image.png');
        const header = fs.readFileSync(png).subarray(0, 24);
        assert.equal(header.toString('hex',0,8), '89504e470d0a1a0a');
        report.pngDownload = { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
        const board=variants.find(v=>v.style==='growing');
        assert(Math.abs(report.pngDownload.width/report.pngDownload.height-board.boardWidth/board.boardHeight)<.002,'PNG must follow the artboard, not paper');
      }
      await app.locator('#posterClose').click();
      assert.equal(await app.evaluate(() => JSON.stringify(familyTreeDiagnostics.snapshot())), before);
      await review(context,interactive,count);
      await capture(context, original, `${count}-original.png`);
      assert.equal(await capture(context, html, `${count}-heritage.png`), count);
      const printCheck = await print(context, html, count);
      const selected = variants.find(item => item.style === (adaptive?'growing':'weighted')) || variants[0];
      assert.equal(selected.collisions, 0);
      assert(selected.joins && selected.obstructedBranches === 0);
      if(adaptive) assert.equal(selected.branchCrossings,0,'Adaptive regions must not cross');
      else if (count > 40) assert(selected.branchCrossings <= Math.min(...variants.filter(item=>['packed','distributed'].includes(item.style)).map(item=>item.branchCrossings)));
      report.samples.push({ count, variants, selected, posterStyle, ...printCheck, interactiveReview:true, sourceUnchanged: true, fullNames: true, relations: verified.relationships.length, nameBounds: verified.textInsideViewport });
      console.log(JSON.stringify(report.samples.at(-1)));
    }
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.externalRequests, []);
  } finally {
    if (context) await context.close();
    const target = path.resolve(profile);
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
    assert(path.basename(target).startsWith('treef-heritage-'));
    fs.rmSync(target, { recursive: true, force: true });
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
