'use strict';

// Public sample. All state is fabricated and exists only in this tab's memory.
(() => {
  const admin={id:'admin',role:'admin',identifier:'admin@example.test',personId:null,password:'FamilyDemo-2026'};
  const accounts=[admin];
  let user=admin;
  let sequence=0;
  let previous;
  const privateDaughters=new Map();
  let tree={revision:0,title:'شجرة عائلة تجريبية',people:[
    {id:'grandfather',name:'جد العائلة التجريبية',parentId:null},
    {id:'father',name:'أحمد التجريبي',parentId:'grandfather'},
    {id:'uncle',name:'إبراهيم التجريبي',parentId:'grandfather'},
    {id:'son',name:'سليمان التجريبي',parentId:'father'},
    {id:'grandson',name:'يوسف التجريبي',parentId:'son'}
  ]};
  const fail=message=>{throw new Error(message);};
  function writable(id) {
    if(user.role==='admin')return true;
    for(let person=tree.people.find(item=>item.id===id);person;person=tree.people.find(item=>item.id===person.parentId))
      if(person.id===user.personId)return true;
    return false;
  }
  function update(edit){
    previous={...structuredClone(tree),people:tree.people.map(person=>({...person,writable:false}))};
    edit();
    tree.revision++;
  }
  function publicAccount(account){
    return {id:account.id,role:account.role,identifier:account.identifier,personId:account.personId,active:!!account.password};
  }
  function request(route,data,method){
    if(route==='/api/login'){
      user=accounts.find(account=>account.identifier.toLowerCase()===data.identifier.toLowerCase()&&account.password===data.password);
      if(!user)fail('راجع بيانات الدخول التجريبية.');
      return {};
    }
    if(route==='/api/activate'){
      user=accounts.find(account=>account.identifier===data.code.toUpperCase()&&account.temporary===data.initialPassword&&!account.password);
      if(!user)fail('راجع الرمز وكلمة المرور المؤقتة.');
      user.password=data.password;
      delete user.temporary;
      return {};
    }
    if(!user)fail('سجّل الدخول التجريبي أولًا.');
    if(route==='/api/logout'){user=null;return {};}
    if(route==='/api/me')return publicAccount(user);
    if(route==='/api/tree'&&data===undefined)return {...tree,before:previous,people:tree.people.map(person=>({...person,writable:writable(person.id)}))};
    if(route==='/api/private-daughters'){
      if(!user.personId)fail('السجل متاح للأب المباشر فقط.');
      return {daughters:structuredClone(privateDaughters.get(user.personId)||[])};
    }
    if(route==='/api/people'){
      if(data.gender==='f'){
        if(!user.personId||user.personId!==data.parentId)fail('إضافة الابنة متاحة للأب المباشر من حسابه فقط.');
        const id='preview-daughter-'+(++sequence);
        if(!privateDaughters.has(user.personId))privateDaughters.set(user.personId,[]);
        privateDaughters.get(user.personId).push({id,name:data.name});
        return {id,private:true};
      }
      if(!writable(data.parentId))fail('الإضافة ضمن الفرع المخوّل.');
      const id='preview-person-'+(++sequence);
      update(()=>tree.people.push({id,parentId:data.parentId,name:data.name}));
      return {id};
    }
    if(route.startsWith('/api/people/')&&method==='PATCH'){
      const id=decodeURIComponent(route.split('/').at(-1));
      if(!writable(id))fail('التعديل ضمن الفرع المخوّل.');
      const person=tree.people.find(item=>item.id===id);
      update(()=>{person.name=data.name;});
      return {id};
    }
    if(user.role!=='admin')fail('هذا الإجراء للمدير التجريبي.');
    if(route==='/api/tree'&&method==='PATCH'){update(()=>{tree.title=data.title;});return {};}
    if(route==='/api/accounts')return {accounts:accounts.map(publicAccount)};
    if(route==='/api/invites'){
      let account=accounts.find(item=>item.personId===data.personId);
      if(account?.password)fail('أوقف الحساب أولًا لإصدار دعوة جديدة.');
      if(!account){
        const id=String(++sequence);
        account={id:'preview-account-'+id,role:'member',personId:data.personId,identifier:'FAM-'+id.padStart(16,'0')};
        accounts.push(account);
      }
      account.temporary='PreviewOnly-'+(++sequence);
      return {code:account.identifier,initialPassword:account.temporary};
    }
    if(route.endsWith('/revoke')){
      const account=accounts.find(item=>item.id===route.split('/')[3]&&item.role==='member');
      if(!account)fail('الحساب التجريبي غير موجود.');
      delete account.password;
      delete account.temporary;
      return {};
    }
    fail('هذا الإجراء خارج المعاينة.');
  }
  globalThis.familyPortalPreview={request};
})();
