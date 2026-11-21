'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../Claud/botanical-core.js');
const {mergeDuplicate}=require('./duplicate-review.cjs');

test('merge a redundant leaf without discarding related people or distinct details',()=>{
  const specimen=()=>core.normalize({root:{id:'father',name:'الأب',children:[
    {id:'keep',name:'أحمد سالم',children:[{id:'child',name:'سالم'}]},
    {id:'copy',name:'أحمد  سالم'}
  ]}});
  const noLinks={hasLinkedRecords:()=>false};
  const family=specimen();
  assert.equal(mergeDuplicate(family,'copy','keep',noLinks).personId,'keep');
  assert.deepEqual(family.persons.map(person=>person.personId),['father','keep','child']);
  assert.equal(family.relationships.find(relation=>relation.childId==='child').parentId,'keep');
  assert.throws(()=>mergeDuplicate(specimen(),'keep','copy',noLinks),/يرتبط/);
  assert.throws(()=>mergeDuplicate(specimen(),'copy','keep',{hasLinkedRecords:()=>true}),/يرتبط/);
  const detailed=specimen();
  detailed.persons.find(person=>person.personId==='copy').notes='دليل خاص';
  assert.throws(()=>mergeDuplicate(detailed,'copy','keep',noLinks),/تفاصيل/);
  assert.equal(detailed.persons.length,4);
});
