'use strict';
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const preview=source
  .replace('<title>بوابة العائلة</title>','<title>تجربة بوابة العائلة</title>')
  .replace('href="/portal/style.css"','href="style.css"')
  .replace('<script src="/portal/app.js" defer></script>','<script src="preview.js" defer></script>\n  <script src="app.js" defer></script>')
  .replace('href="/portal/"','href="../"')
  .replace('<main>','<main>\n    <p class="panel">هذه معاينة عامة ببيانات وهمية. جرّب التعديل أو الدعوة داخل هذا التبويب. تعود العينة الأصلية بعد إعادة تحميل الصفحة. استخدم أسماء وهمية فقط.</p>')
  .replace(/ *<p><a href="\/api\/backup".*?<\/p>\r?\n/,'')
  .replace('اطلب من المدير دعوة لحسابك أو إعادة تفعيله عند فقد كلمة المرور.','للعودة إلى المدير التجريبي استخدم admin@example.test وكلمة المرور FamilyDemo-2026.');
fs.writeFileSync(path.join(__dirname,'preview.html'),preview);
