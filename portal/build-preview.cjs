'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');

const source=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const revision=createHash('sha256')
  .update(fs.readFileSync(path.join(__dirname,'../Claud/botanical-core.js')))
  .update(source)
  .update(fs.readFileSync(path.join(__dirname,'app.js')))
  .update(fs.readFileSync(path.join(__dirname,'preview.js')))
  .update(fs.readFileSync(path.join(__dirname,'style.css')))
  .digest('hex').slice(0,10);
const preview=source
  .replace('<title>بوابة العائلة</title>','<title>تجربة بوابة العائلة</title>')
  .replace('href="/portal/style.css"',`href="style.css?v=${revision}"`)
  .replace('<script src="/portal/app.js" defer></script>',`<script src="preview.js?v=${revision}" defer></script>\n  <script src="app.js?v=${revision}" defer></script>`)
  .replace('href="/portal/"','href="../"')
  .replace('href="/portal/world/"','href="world/"')
  .replace('src="/Claud/botanical-core.js"',`src="../Claud/botanical-core.js?v=${revision}"`)
  .replace('استكشف شجرة الحساب بالعرض الثابت أو ثلاثي الأبعاد','استكشف الجولة بعينة مستقلة بالعرض الثابت أو ثلاثي الأبعاد')
  .replace('<main>','<main>\n    <aside class="preview-banner" aria-label="أدوار المعاينة"><p>معاينة ببيانات وهمية. يبدأ تبديل الدور تجربة جديدة.</p><nav aria-label="اختر دورًا تجريبيًا"><a href="?role=member">جرّب كعضو</a><a href="?role=admin">جرّب كمدير</a></nav></aside>')
  .replace(/ *<p><a href="\/api\/backup".*?<\/p>\r?\n/,'')
  .replace('اطلب من المدير دعوة لحسابك أو إعادة تفعيله عند فقد كلمة المرور.','للعودة إلى المدير التجريبي استخدم admin@example.test وكلمة المرور FamilyDemo-2026.');
fs.writeFileSync(path.join(__dirname,'preview.html'),preview);
