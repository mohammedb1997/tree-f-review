'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright-core');
const core=require('../Claud/botanical-core.js');

async function run(){
  const root=path.resolve(__dirname,'..');
  const output=path.join(root,'evidence','engraved-crown');
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',chromiumSandbox:true});
  const results=[];
  try{
    const page=await browser.newPage({viewport:{width:900,height:1300}});
    await page.addScriptTag({path:path.join(root,'Claud','botanical-core.js')});
    await page.addScriptTag({path:path.join(root,'Claud','heritage-poster.js')});
    await page.addScriptTag({path:path.join(root,'Claud','heritage-review.js')});
    for(const count of [30,51,150,500]){
      const doc=core.fixture(count);
      doc.title='شجرة عائلة تجريبية · '+count;
      if(count===500)doc.persons.at(-1).fullName='عبد الرحمن بن عبد العزيز بن محمد بن سليمان التجريبي';
      const expected=core.visible(doc).nodes;
      const sample=await page.evaluate(({doc,count})=>{
        const context=document.createElement('canvas').getContext('2d');
        const measure=(text,size)=>{
          context.font=size+'px Tahoma,Arial,sans-serif';
          return context.measureText(text).width;
        };
        const before=JSON.stringify(doc);
        const dimensions=count<=51?[420,594]:[700,1000];
        const art=HeritagePoster.render(doc,...dimensions,measure,'engraved-crown');
        if(count===150){
          const renderAt=(w,h)=>HeritagePoster.render(doc,w,h,measure,'engraved-crown',0,{sizeFree:true}).svg;
          if(renderAt(420,594)!==renderAt(2100,1350))throw Error('تغيّر رسم SVG الحر بتغيّر مقاس الورق');
        }
        const old=count===51?HeritagePoster.render(doc,...dimensions,measure,'organic-improved').svg:null;
        const result={people:art.count,links:art.links.length,width:art.w,height:art.h,
          minimumPt:art.minimumPt,collisions:art.collisions,obstructions:art.obstructedBranches,
          crossings:art.branchCrossings,unchanged:before===JSON.stringify(doc)};
        return {svg:art.svg,html:HeritageReview.html(doc.title,art.svg),old,result};
      },{doc,count});
      await page.evaluate(svg=>{document.body.innerHTML=svg;},sample.svg);
      const checks=await page.locator('svg').evaluate(svg=>({
        names:[...svg.querySelectorAll('[data-person-id]')].map(node=>[node.dataset.personId,node.querySelector('[data-poster-name]').textContent.trim()]),
        edges:[...svg.querySelectorAll('[data-child-id]')].map(node=>[node.dataset.parentId,node.dataset.childId]),
        layers:svg.querySelectorAll('[inkscape\\:groupmode="layer"]').length
      }));
      assert.deepEqual(checks.names,expected.map(node=>[node.personId,node.fullName]));
      assert.deepEqual(checks.edges,expected.flatMap(node=>node.children.map(child=>[node.personId,child.personId])));
      assert.equal(checks.layers,5);
      assert.equal(sample.result.unchanged,true);
      assert.equal(sample.result.collisions,0);
      assert.equal(sample.result.obstructions,0);
      console.log(JSON.stringify(sample.result));
      results.push(sample.result);
      fs.writeFileSync(path.join(output,count+'.html'),sample.html.replace(/[ \t]+$/gm,''));
      fs.writeFileSync(path.join(output,count+'.svg'),sample.svg);
      if(count===51||count===150){
        const proof=await browser.newPage();
        await proof.setContent(`<!doctype html><meta charset="utf-8"><style>@page{size:${sample.result.width}mm ${sample.result.height}mm;margin:0}html,body{margin:0}svg{display:block}</style>${sample.svg}`);
        await proof.pdf({path:path.join(output,count+'.pdf'),preferCSSPageSize:true,printBackground:true});
        await proof.close();
      }
      if(sample.old)fs.writeFileSync(path.join(output,'51-before.svg'),sample.old);
    }
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2)+'\n');
  }finally{await browser.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
