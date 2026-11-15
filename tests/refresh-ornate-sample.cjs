'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright-core');
const core = require('../Claud/botanical-core.js');

async function run() {
  const root = path.resolve(__dirname, '..');
  const doc = require('../evidence/organic-preview/51.json');
  const browser = await chromium.launch({channel:'chrome',chromiumSandbox:true});
  try {
    const page = await browser.newPage({viewport:{width:1000,height:1450}});
    const errors = [];
    page.on('pageerror', error=>errors.push(error.message));
    await page.route('**/*', route=>/^https?:/.test(route.request().url()) ? route.abort() : route.continue());
    await page.goto(pathToFileURL(path.join(root,'Claud/family-tree.html')).href);
    const sample = await page.evaluate(async data=>{
      await document.fonts.ready;
      const canvas = document.createElement('canvas').getContext('2d');
      const measure = (name,size)=>{
        canvas.font = size+'px Tahoma,Arial,sans-serif';
        return canvas.measureText(name).width;
      };
      const art = HeritagePoster.render(data,420,594,measure,'organic-improved');
      const metrics = Object.fromEntries(['minimumPt','branchCrossings','ribbonContacts','collisions','obstructedBranches'].map(key=>[key,art[key]]));
      return {html:HeritageReview.html(data.title,art.svg),svg:art.svg,metrics};
    },doc);
    assert.equal(sample.metrics.branchCrossings,0);
    assert.equal(sample.metrics.ribbonContacts,0);
    assert.equal(sample.metrics.collisions,0);
    assert.equal(sample.metrics.obstructedBranches,0);
    const file = path.join(root,'samples/tree-51.html');
    await page.setContent(sample.html);
    const expected = core.visible(doc).nodes;
    const actual = await page.locator('#art svg').evaluate(el=>({
      names:[...el.querySelectorAll('[data-person-id]')].map(n=>[n.dataset.personId,n.querySelector('[data-poster-name]').textContent.trim()]),
      links:[...el.querySelectorAll('[data-child-id]')].map(n=>[n.dataset.parentId,n.dataset.childId]),
      layers:el.querySelectorAll('[inkscape\\:groupmode="layer"]').length
    }));
    assert.deepEqual(actual.names,expected.map(n=>[n.personId,n.fullName]));
    assert.deepEqual(actual.links,expected.flatMap(n=>n.children.map(c=>[n.personId,c.personId])));
    assert.equal(actual.layers,5);
    await page.locator('#art svg').screenshot({path:path.join(root,'samples/tree-51.png')});
    await page.setViewportSize({width:390,height:844});
    await page.locator('#query').fill('خالد بن محمد');
    await page.locator('#query').press('Enter');
    assert(await page.locator('#person').isVisible());
    assert(await page.locator('#lineageTrace path').count()>0);
    const before = await page.locator('#art svg').getAttribute('viewBox');
    await page.locator('#zoomIn').click();
    assert.notEqual(await page.locator('#art svg').getAttribute('viewBox'),before);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(file,sample.html);
    fs.writeFileSync(path.join(root,'samples/tree-51.svg'),sample.svg);
    fs.writeFileSync(path.join(root,'developer/ornate-v3-results.json'),JSON.stringify({
      count:actual.names.length, relationships:actual.links.length, layers:actual.layers,
      paper:'A2 portrait', ...sample.metrics, search:true, zoom:true, lineageTrace:true
    },null,2)+'\n');
    console.log(JSON.stringify(sample.metrics));
  } finally {
    await browser.close();
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
