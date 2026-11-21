'use strict';

const {isDeepStrictEqual}=require('node:util');
const core=require('../Claud/botanical-core.js');

function comparableName(name){
  return name.normalize('NFC').trim().replace(/\s+/gu,' ');
}

function references(value,id){
  if(value===id)return true;
  if(!value||typeof value!=='object')return false;
  return Object.entries(value).some(([key,item])=>key===id||references(item,id));
}

function duplicateCandidate(doc,duplicateId,keepId,{hasLinkedRecords}){
  if(duplicateId===keepId||doc.rootPersonId===duplicateId)throw Error('اختر سجلين مختلفين تحت الأب نفسه.');
  const {nodes}=core.visible(doc);
  const duplicate=nodes.find(person=>person.personId===duplicateId);
  const retained=nodes.find(person=>person.personId===keepId);
  if(!duplicate||!retained||!duplicate.parentId||duplicate.parentId!==retained.parentId||
     comparableName(duplicate.fullName)!==comparableName(retained.fullName))
    throw Error('الدمج متاح للاسم نفسه تحت الأب نفسه.');
  const record=doc.persons.find(person=>person.personId===duplicateId);
  const survivor=doc.persons.find(person=>person.personId===keepId);
  const keyFields=new Set(['personId','id','fullName','name']);
  if((typeof record.name==='string'&&comparableName(record.name)!==comparableName(record.fullName))||
     Object.entries(record).some(([key,value])=>!keyFields.has(key)&&!isDeepStrictEqual(value,survivor[key])))
    throw Error('يحمل السجل المرشّح تفاصيل مختلفة تحتاج مراجعة يدوية.');
  const edges=doc.relationships.filter(relation=>relation.parentId===duplicateId||relation.childId===duplicateId);
  if(edges.length!==1||edges[0].type!=='father'||edges[0].childId!==duplicateId||
     hasLinkedRecords(duplicateId)||references(doc.presentation,duplicateId)||
     doc.relationships.some(relation=>relation!==edges[0]&&references(relation,duplicateId))||
     doc.persons.some(person=>person.personId!==duplicateId&&references(person,duplicateId)))
    throw Error('يرتبط السجل بأفراد أو حساب أو إعدادات. راجع الارتباطات قبل الدمج.');
  return {duplicate:record,survivor,fatherId:duplicate.parentId,edge:edges[0]};
}

function mergeDuplicate(doc,duplicateId,keepId,options){
  const {duplicate,survivor,edge}=duplicateCandidate(doc,duplicateId,keepId,options);
  doc.persons=doc.persons.filter(person=>person!==duplicate);
  doc.relationships=doc.relationships.filter(relation=>relation!==edge);
  core.validate(doc);
  return survivor;
}

module.exports={duplicateCandidate,mergeDuplicate};
