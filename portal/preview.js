'use strict';

// Public sample. All state is fabricated and exists only in this tab's memory.
(() => {
  const admin={id:'admin',role:'admin',identifier:'admin@example.test',personId:null,password:'FamilyDemo-2026'};
  const accounts=[admin];
  let user=admin;
  if(new URLSearchParams(location.search).get('role')==='member'){
    user={id:'demo-member',role:'member',identifier:'member@example.test',personId:'father',password:'FamilyDemo-2026'};
    accounts.push(user);
  }
  document.querySelector(`[href="?role=${user.role}"]`)?.setAttribute('aria-current','page');
  let sequence=0;
  let previous;
  const privateDaughters=new Map();
  const history=[];
  const corrections=[];
  function record(action,summary,personId=null){
    history.unshift({id:'event-'+(++sequence),at:new Date().toISOString(),actor:user.identifier,actorId:user.id,action,summary,personId});
  }
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
    return {id:account.id,role:account.role,identifier:account.identifier,personId:account.personId,active:!!account.password,
      canAddDaughter:tree.people.some(person=>person.id===account.personId)};
  }
  function issueInvite(personId){
    let account=accounts.find(item=>item.personId===personId);
    if(account?.password)fail('أوقف الحساب أولًا لإصدار دعوة جديدة.');
    if(!account){
      const id=String(++sequence);
      account={id:'preview-account-'+id,role:'member',personId,identifier:'FAM-'+id.padStart(16,'0')};
      accounts.push(account);
    }
    account.temporary='PreviewOnly-'+(++sequence);
    return {code:account.identifier,initialPassword:account.temporary};
  }
  const profiles=new Map();
  const siblingOrder=new Map(tree.people.map((row,index)=>[row.id,index]));
  function previewTarget(id){
    const person=tree.people.find(row=>row.id===id);
    if(person&&writable(id))return {row:person};
    for(const [fatherId,daughters] of privateDaughters){
      const row=daughters.find(daughter=>daughter.id===id);
      if(row&&(user.role==='admin'||user.personId===id||user.personId===fatherId))return {row,fatherId,daughters};
    }
    fail('التعديل ضمن الفرع المخوّل.');
  }

  function previewRemovalOptions(id){
    const {row,fatherId}=previewTarget(id);
    const direct=tree.people.filter(person=>person.parentId===id);
    if(user.role==='admin'||user.personId===id){
      direct.push(...(privateDaughters.get(id)||[]).map(daughter=>({...daughter,gender:'f'})));
    }
    return [...(row.parentId||fatherId?[{...row,gender:fatherId?'f':'m'}]:[]),...direct].filter(person=>
      !accounts.some(account=>account.personId===person.id)&&
      !tree.people.some(child=>child.parentId===person.id)&&!privateDaughters.get(person.id)?.length);
  }

  function storeNewProfile(id,{birthDate,photo}){
    if(birthDate||photo)profiles.set(id,{birthDate:birthDate||'',photo:photo||''});
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
    if(route==='/api/history')return {entries:history.filter(entry=>user.role==='admin'||entry.actorId===user.id||entry.personId&&writable(entry.personId)).slice(0,100)};
    if(route==='/api/corrections'&&data===undefined)return {requests:corrections.filter(item=>user.role==='admin'||item.actorId===user.id)};
    if(route==='/api/corrections'){
      const person=tree.people.find(item=>item.id===data.personId);
      const target=tree.people.find(item=>item.id===data.parentId);
      if(!person?.parentId||!target||person.id===target.id||!writable(person.id))fail('راجع الشخص والوجهة المطلوبة.');
      if(!data.note?.trim())fail('أضف سبب الطلب.');
      const request={id:'correction-'+(++sequence),personId:person.id,parentId:target.id,note:data.note,status:'pending',actorId:user.id,kind:data.kind||'reparent',originalParent:person.parentId};
      corrections.unshift(request);record('correction','إرسال طلب تصحيح نسب',person.id);
      return {id:request.id};
    }
    if(/^\/api\/corrections\/[^/]+\/decision$/.test(route)){
      if(user.role!=='admin')fail('اعتماد الطلب للمدير.');
      const request=corrections.find(item=>item.id===route.split('/')[3]);
      if(!request||request.status!=='pending')fail('الطلب غير متاح.');
      if(!['approve','reject'].includes(data.decision))fail('قرار غير صالح.');
      if(data.decision==='reject'){request.status='rejected';record('correction','رفض طلب تصحيح نسب',request.personId);return {};}
      const person=tree.people.find(item=>item.id===request.personId),target=tree.people.find(item=>item.id===request.parentId);
      if(!person||!target||person.parentId!==request.originalParent)fail('تغيرت الشجرة. أنشئ طلبًا جديدًا.');
      const below=new Set([person.id]);let growth=true;
      while(growth){growth=false;for(const row of tree.people)if(below.has(row.parentId)&&!below.has(row.id)){below.add(row.id);growth=true;}}
      if(below.has(target.id))fail('هذا الطلب يسبب دورة في النسب.');
      if(request.kind==='merge'){
        if(person.name!==target.name||person.parentId!==target.parentId)fail('الدمج بين اسمين متطابقين للأب نفسه.');
        if(accounts.some(item=>item.personId===person.id)||privateDaughters.has(person.id))fail('للسجل حساب أو بيانات خاصة. راجع المدير.');
        update(()=>{for(const row of tree.people)if(row.parentId===person.id)row.parentId=target.id;tree.people=tree.people.filter(row=>row.id!==person.id);});
      }else update(()=>{person.parentId=target.id;});
      request.status='approved';record('correction','اعتماد طلب تصحيح نسب',target.id);return {};
    }
    if(route==='/api/people/batch'){
      if(!writable(data.parentId)||!Array.isArray(data.names)||!data.names.length||data.names.length>50)fail('راجع دفعة الأسماء.');
      const names=data.names.map(name=>typeof name==='string'?name.trim():'');
      if(names.some(name=>!name||name.length>300)||new Set(names.map(name=>name.normalize('NFC'))).size!==names.length)fail('راجع الأسماء وتكرارها.');
      const added=names.map(name=>({id:'preview-person-'+(++sequence),parentId:data.parentId,name}));
      update(()=>tree.people.push(...added));record('batch','إضافة دفعة من '+added.length+' أبناء',data.parentId);
      return {ids:added.map(person=>person.id)};
    }
    if((route==='/api/tree'||route==='/api/tree?scope=all')&&data===undefined){
      const privatePeople=[];
      for(const [parentId,daughters] of privateDaughters){
        for(const {id,name} of daughters){
          if(route.endsWith('scope=all')||user.personId===parentId||user.personId===id)
            privatePeople.push({id,parentId,name,gender:'f',writable:false});
        }
      }
      return {...tree,before:previous,people:tree.people.map(person=>({...person,writable:writable(person.id)})),privatePeople};
    }
    if(route==='/api/private-daughters'){
      if(!publicAccount(user).canAddDaughter)fail('السجل متاح للأب المباشر فقط.');
      return {daughters:(privateDaughters.get(user.personId)||[]).map(daughter=>{
        const account=accounts.find(item=>item.personId===daughter.id);
        return {...daughter,accountStatus:account?.password?'active':account?.temporary?'invited':account?'inactive':'none'};
      })};
    }
    if(/^\/api\/private-daughters\/[^/]+(?:\/(?:invite|recover))?$/.test(route)){
      const personId=route.split('/')[3];
      const daughter=privateDaughters.get(user.personId)?.find(item=>item.id===personId);
      if(!daughter)fail('الإدارة للأب المباشر.');
      if(method==='PATCH'){
        if(!data.name?.trim())fail('أدخل اسم الابنة.');
        daughter.name=data.name.trim();
        return {id:personId};
      }
      if(route.endsWith('/recover')){
        const account=accounts.find(item=>item.personId===personId);
        if(!account)fail('أنشئ دعوة أولى لهذا الحساب.');
        delete account.password;
      }
      return issueInvite(personId);
    }
    if(route==='/api/people'){
      if(data.gender==='f'){
        const allowed=user.role==='admin'
          ? tree.people.some(person=>person.id===data.parentId)
          : publicAccount(user).canAddDaughter&&user.personId===data.parentId;
        if(!allowed)fail('اختر أبًا من الشجرة. يمكن للأب إضافة بناته المباشرات.');
        const id='preview-daughter-'+(++sequence);
        if(!privateDaughters.has(data.parentId))privateDaughters.set(data.parentId,[]);
        privateDaughters.get(data.parentId).push({id,name:data.name});
        storeNewProfile(id,data);
        return {id,private:true};
      }
      if(!writable(data.parentId))fail('الإضافة ضمن الفرع المخوّل.');
      const id='preview-person-'+(++sequence);
      update(()=>tree.people.push({id,parentId:data.parentId,name:data.name}));
      storeNewProfile(id,data);
      record('add','إضافة '+data.name,id);
      return {id};
    }
    const action=route.match(/^\/api\/people\/([^/]+)\/(profile|remove-options|invite)$/);
    if(action){
      const id=decodeURIComponent(action[1]);
      if(action[2]==='remove-options')return {options:previewRemovalOptions(id)};
      const {row,daughters,fatherId}=previewTarget(id);
      if(action[2]==='invite'){
        if(user.role!=='admin'&&(fatherId||row.parentId)!==user.personId)fail('الدعوة للأب المباشر أو المدير.');
        return issueInvite(id);
      }
      const gender=daughters?'f':'m';
      const canChangeGender=user.role==='admin'&&previewRemovalOptions(id).some(person=>person.id===id);
      if(data===undefined)return {lifeStatus:'unknown',phone:'',email:'',photo:'',birthDate:'',...profiles.get(id),
        gender,canChangeGender,name:row.name};
      const {name,lifeStatus,phone,email,photo=profiles.get(id)?.photo||'',birthDate=profiles.get(id)?.birthDate||''}=data;
      if(data.gender&&data.gender!==gender){
        if(!canChangeGender)fail('تعديل الجنس متاح للمدير للسجلات غير المرتبطة.');
        if(data.gender==='f'){
          if(!privateDaughters.has(row.parentId))privateDaughters.set(row.parentId,[]);
          privateDaughters.get(row.parentId).push({id,name});
          update(()=>{tree.people=tree.people.filter(person=>person.id!==id);});
          previous=null;
        }else{
          daughters.splice(daughters.indexOf(row),1);
          update(()=>{
            tree.people.push({id,parentId:fatherId,name});
            tree.people.sort((a,b)=>(siblingOrder.get(a.id)??Infinity)-(siblingOrder.get(b.id)??Infinity));
          });
        }
      }else if(daughters)row.name=name;
      else if(row.name!==name)update(()=>{row.name=name;});
      profiles.set(id,{lifeStatus,phone,email,photo,birthDate});
      record('profile','تعديل بيانات شخص',id);
      return {id};
    }
    if(/^\/api\/people\/[^/]+$/.test(route)&&method==='DELETE'){
      const id=decodeURIComponent(route.split('/').at(-1));
      if(!previewRemovalOptions(data.anchor).some(person=>person.id===id))fail('السجل محمي من الحذف.');
      const {row,daughters}=previewTarget(id);
      if(daughters)daughters.splice(daughters.indexOf(row),1);
      else update(()=>{tree.people=tree.people.filter(person=>person.id!==id);});
      profiles.delete(id);
      record('remove','حذف سجل شخص',id);
      return {id};
    }
    if(route.startsWith('/api/people/')&&method==='PATCH'){
      const id=decodeURIComponent(route.split('/').at(-1));
      if(!writable(id))fail('التعديل ضمن الفرع المخوّل.');
      const person=tree.people.find(item=>item.id===id);
      update(()=>{person.name=data.name;});
      record('rename','تعديل اسم '+data.name,id);
      return {id};
    }
    if(user.role!=='admin')fail('هذا الإجراء للمدير التجريبي.');
    if(route==='/api/tree'&&method==='PATCH'){update(()=>{tree.title=data.title;});record('title','تعديل عنوان الشجرة');return {};}
    if(route==='/api/accounts')return {accounts:accounts.map(publicAccount)};
    if(route==='/api/invites')return issueInvite(data.personId);
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
