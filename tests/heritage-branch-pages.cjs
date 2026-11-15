'use strict';
const assert = require('node:assert/strict');
const core = require('../Claud/botanical-core.js');
const poster = require('../Claud/heritage-poster.js');

function check(doc, limit = 51) {
  const before = JSON.stringify(doc);
  const original = core.visible(doc);
  const pages = poster.splitPages(doc, limit);
  const primary = [];
  const links = [];
  for (const page of pages) {
    const visible = core.visible(page.document);
    assert(visible.nodes.length <= limit);
    assert.equal(page.generation, original.nodes.find(n=>n.personId===visible.root.personId).generation);
    if (page.from) {
      assert(page.from < page.number);
      assert(pages[page.from - 1].document.persons.some(p=>p.personId===visible.root.personId));
    } else primary.push(visible.root.personId);
    primary.push(...visible.nodes.slice(1).map(n=>n.personId));
    links.push(...visible.nodes.slice(1).map(n=>JSON.stringify([n.parentId,n.personId])));
  }
  assert.deepEqual(primary.sort(), original.nodes.map(n=>n.personId).sort());
  assert.deepEqual(links.sort(), original.nodes.slice(1).map(n=>JSON.stringify([n.parentId,n.personId])).sort());
  assert.equal(JSON.stringify(doc), before);
  return pages.length;
}

for (const count of [1,51,150,280,500,1000]) console.log(count, check(core.fixture(count)));
let root={id:'chain-0',name:'الأصل التجريبي',children:[]}, leaf=root;
for(let i=1;i<120;i++){const child={id:'chain-'+i,name:'اسم وهمي '+i,children:[]};leaf.children.push(child);leaf=child;}
assert.equal(check(core.normalize({root})),3);
assert.equal(check(core.fixture(9),2),8);
console.log('8 cases passed: person and relationship coverage, continuation, bounds, source unchanged');
