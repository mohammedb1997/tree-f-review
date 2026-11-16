'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const core = require('../Claud/botanical-core.js');
const data = require('../evidence/organic-preview/51.json');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'evidence/living-heritage-poster');
const notes = {
  summary: 'نموذج للوحة نسب تراثية',
  source: 'المصدر · بيانات اختبار وهمية',
  credit: 'الإعداد · مشروع شجرة العائلة'
};

async function inspect(page) {
  return page.locator('#art svg').evaluate(svg => {
    const select = selector => [...svg.querySelectorAll(selector)];
    const box = element => {
      const {x, y, width, height} = element.getBBox();
      const matrix = svg.getCTM().inverse().multiply(element.getCTM());
      const corners = [[x,y],[x+width,y],[x,y+height],[x+width,y+height]]
        .map(([x,y]) => new DOMPoint(x,y).matrixTransform(matrix));
      return [Math.min(...corners.map(p=>p.x)), Math.min(...corners.map(p=>p.y)),
        Math.max(...corners.map(p=>p.x)), Math.max(...corners.map(p=>p.y))];
    };
    const overlaps = (a,b) => a[0]<b[2] && a[2]>b[0] && a[1]<b[3] && a[3]>b[1];
    const names = select('[data-person-id]');
    const textBoxes = select('[data-poster-name]').map(box);
    const leaves = select('[data-poster-ornament="leaf"] > path:nth-child(2)').map(box);
    const flares = select('[data-root-flare] > path:first-child');
    const primaryNameContacts = flares.reduce((sum,branch) => {
      const bounds = box(branch);
      const inverse = branch.getCTM().inverse().multiply(svg.getCTM());
      const {parentId,childId} = branch.parentElement.dataset;
      return sum + textBoxes.filter((text,i) => {
        if ([parentId,childId].includes(names[i].dataset.personId) || !overlaps(text,bounds)) return false;
        const [x1,y1,x2,y2] = text;
        for(let x=x1;x<=x2;x+=2) for(let y=y1;y<=y2;y+=2) {
          if(branch.isPointInFill(new DOMPoint(x,y).matrixTransform(inverse))) return true;
        }
        return false;
      }).length;
    },0);
    const insideBoard = ([x1,y1,x2,y2]) =>
      x1>=0 && y1>=0 && x2<=svg.viewBox.baseVal.width && y2<=svg.viewBox.baseVal.height;
    const panel = svg.querySelector('[data-poster-editorial] > rect:nth-child(2)');
    const panelBox = box(panel);
    return {
      names: names.map(node => [node.dataset.personId, node.querySelector('text').textContent.trim()]),
      links: select('[data-child-id]').map(node => [node.dataset.parentId,node.dataset.childId]),
      layers: select('[inkscape\\:groupmode="layer"]').length,
      ornaments: leaves.length,
      flaredBranches: flares.length,
      primaryNameContacts,
      leafTextContacts: leaves.filter(leaf => textBoxes.some(text=>overlaps(text,leaf))).length,
      panelTextContacts: textBoxes.filter(text=>overlaps(text,panelBox)).length,
      editorialFits: select('[data-poster-editorial-line]').every(node => {
        const [x1,y1,x2,y2] = box(node);
        return x1>=panelBox[0] && y1>=panelBox[1] && x2<=panelBox[2] && y2<=panelBox[3];
      }),
      namesInsideBoard: textBoxes.every(insideBoard),
      renderedNameSize: Math.min(...select('[data-poster-name]')
        .map(node=>Number(node.getAttribute('font-size'))))*
        Math.min(420/svg.viewBox.baseVal.width,594/svg.viewBox.baseVal.height)*72/25.4
    };
  });
}

async function platformFonts(page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const {root} = await cdp.send('DOM.getDocument');
    const {nodeId} = await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'[data-poster-name]'});
    const {fonts} = await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
    return fonts.filter(font=>font.glyphCount>0).map(font=>font.familyName);
  } finally {
    await cdp.detach();
  }
}

async function run() {
  fs.mkdirSync(output,{recursive:true});
  const browser = await chromium.launch({channel:'chrome',chromiumSandbox:true});
  try {
    const page = await browser.newPage({viewport:{width:900,height:1300}});
    const errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>/^https?:/.test(route.request().url()) ? route.abort() : route.continue());

    const app = pathToFileURL(path.join(root,'Claud/family-tree.html')).href;
    await page.goto(pathToFileURL(path.join(root,'samples/tree-51.html')).href);
    await page.locator('#art svg').screenshot({path:path.join(output,'before-v3.png')});
    await page.goto(app);
    const variants = await page.evaluate(async ({data,notes})=>{
      const canvas = document.createElement('canvas').getContext('2d');
      await document.fonts.ready;
      return ['Tahoma','Amiri'].map(nameFont=>{
        const measure = (name,size)=>{
          canvas.font = size+'px '+nameFont+',Tahoma,Arial,sans-serif';
          return canvas.measureText(name).width;
        };
        const render = () => HeritagePoster.render(data,420,594,measure,'organic-improved',0,{notes,nameFont});
        const art = render();
        const metrics = Object.fromEntries(['minimumPt','branchCrossings','ribbonContacts',
          'collisions','obstructedBranches'].map(key=>[key,art[key]]));
        return {nameFont,html:HeritageReview.html(data.title,art.svg),svg:art.svg,metrics,
          deterministic:render().svg===art.svg};
      });
    },{data,notes});

    const expected = core.visible(data).nodes;
    const summary = [];
    for (const {nameFont,html,svg,metrics,deterministic} of variants) {
      const stem = nameFont==='Tahoma' ? 'tree-51' : 'tree-51-amiri';
      await page.setContent(html);
      assert.equal(await page.locator('[data-poster-ornament="root"]').count(),1);
      const actual = await inspect(page);
      const fonts = await platformFonts(page);
      assert.deepEqual(actual.names,expected.map(n=>[n.personId,n.fullName]));
      assert.deepEqual(actual.links,expected.flatMap(n=>n.children.map(c=>[n.personId,c.personId])));
      assert.equal(actual.layers,5);
      assert.ok(actual.namesInsideBoard && actual.editorialFits && deterministic);
      assert.equal(actual.panelTextContacts,0);
      assert.equal(actual.primaryNameContacts,0);
      if (nameFont==='Tahoma') {
        assert.equal(actual.leafTextContacts,0);
        assert.equal(actual.flaredBranches,expected[0].children.length);
        assert.ok(metrics.minimumPt>=14.9);
        for (const metric of ['branchCrossings','ribbonContacts','collisions','obstructedBranches'])
          assert.equal(metrics[metric],0,metric);
        assert.ok(fonts.includes('Tahoma'));
      }
      await page.locator('#art svg').screenshot({path:path.join(output,stem+'.png')});
      fs.writeFileSync(path.join(output,stem+'.html'),html);
      fs.writeFileSync(path.join(output,stem+'.svg'),svg);
      summary.push({nameFont,fonts,count:actual.names.length,relationships:actual.links.length,
        layers:actual.layers,decorativeLeaves:actual.ornaments,flaredBranches:actual.flaredBranches,
        primaryNameContacts:actual.primaryNameContacts,leafTextContacts:actual.leafTextContacts,
        renderedNameSize:actual.renderedNameSize,editorialFits:actual.editorialFits,deterministic,...metrics});
    }

    await page.goto(pathToFileURL(path.join(output,'tree-51.html')).href);
    await page.setViewportSize({width:390,height:844});
    await page.locator('#query').fill('خالد بن محمد');
    await page.locator('#query').press('Enter');
    assert.ok(await page.locator('#person').isVisible());
    assert.ok(await page.locator('#lineageTrace path').count()>0);
    const before = await page.locator('#art svg').getAttribute('viewBox');
    await page.locator('#zoomIn').click();
    assert.notEqual(await page.locator('#art svg').getAttribute('viewBox'),before);
    assert.deepEqual(errors,[]);
    const result = {samples:summary, search:true, lineageTrace:true, zoom:true, pageErrors:errors};
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result));
  } finally {
    await browser.close();
  }
}

run().catch(error=>{console.error(error);process.exitCode=1;});
