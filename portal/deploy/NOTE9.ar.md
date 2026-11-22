# تجربة بوابة العائلة على Galaxy Note 9

يعمل الخادم وقاعدة SQLite داخل Termux على الهاتف. مرحلة القبول الأولى تستخدم عائلة وهمية، وتقبل الاتصال من الهاتف نفسه عبر عنوان الحلقة المحلية. تحتاج Termux من [مصدر رسمي](https://github.com/termux/termux-app#installation)، وحزمة [Node.js LTS](https://github.com/termux/termux-packages/blob/master/packages/nodejs-lts/build.sh). تحقق من رقم إصدار Android وتاريخ آخر تصحيح أمني قبل اعتماد الجهاز لبيانات الأسرة.

## تشغيل العينة

إذا نقلت الحزمة كملف ZIP، ضعها في «التنزيلات» باسم `treef-note9-pilot.zip`. نفّذ `termux-setup-storage` ووافق على وصول Termux لقراءة الملف. ثم فكّه داخل مساحة التطبيق الخاصة:

```sh
pkg install unzip
unzip -n ~/storage/downloads/treef-note9-pilot.zip -d "$HOME"
cd ~/treef-note9
```

شغّل الأوامر التالية من المجلد الذي يحتوي `portal/` و`Claud/`:

```sh
pkg update
pkg install nodejs-lts
node -e 'const d=new (require("node:sqlite").DatabaseSync)(":memory:");console.log(process.version,d.prepare("SELECT sqlite_version() AS sqlite").get().sqlite);d.close()'
node portal/deploy/note9-pilot.cjs serve
```

افتح `http://127.0.0.1:4178/portal/` على الهاتف، وادخل بالحساب التجريبي `admin@example.test` وكلمة المرور `Note9-Demo-Only-2026`. أضف اسمًا وهميًا، وأوقف الخادم بزر Ctrl+C في Termux، ثم أعد تشغيل الأمر وتحقق من بقاء الاسم. اترك الشاشة مقفلة مدة مناسبة ثم عد إلى المتصفح وسجّل هل ظل الخادم عاملًا. للاختبار الكامل أغلق Termux وأعد فتحه، ثم اختبر إعادة تشغيل الهاتف أيضًا.

يحفظ أمر التجربة الملف `$HOME/.treef-note9-pilot/sample.sqlite` داخل مساحة التطبيق، ويُعيد استعماله. يمكن تشغيل النسخ الاحتياطي في جلسة Termux ثانية من مجلد المصدر:

```sh
node portal/deploy/note9-pilot.cjs backup
```

تُحفظ النسخ في `$HOME/.treef-note9-pilot/backups/`. اختبر استرجاع نسخة وهمية بملف جديد عبر `portal/backup.cjs restore`. حذف التطبيق أو فقدان الهاتف قد يضيّع التخزين المحلي، لذلك تحتاج النسخة الحقيقية إلى نسخة مشفّرة محفوظة خارجه.

## قبول الخادم لأجهزة العائلة

- بعد نجاح التخزين وإعادة التشغيل على الهاتف، جهّز SQLite الإنتاج في مجلد خاص منفصل عن التجربة، باستخدام أمر التهيئة أو الاسترجاع في [دليل البوابة](../README.ar.md). استعمل حساب مدير جديدًا وسرًا خاصًا.
- خادم Node يظل على الحلقة المحلية. تحتاج الأجهزة الأخرى عنوان HTTPS عبر وكيل عكسي، ويمكن تجربة [حزمة Caddy في Termux](https://github.com/termux/termux-packages/blob/master/packages/caddy/build.sh) داخل شبكة خاصة. يلزم تحديد عنوان أو اسم المضيف وتأمين شهادة تثق بها أجهزة الأسرة، ثم تشغيل فحص الزائر `portal/launch-check.cjs probe` على ذلك العنوان. قوالب systemd الخاصة بلينكس تخص الخادم المخصص.
- اختبر دعوة وإضافةً من هاتف آخر، والنسخ والاسترجاع، واستمرارية الخدمة أثناء قفل الهاتف وبعد إعادة تشغيله. إذا احتجت التشغيل التلقائي لاحقًا، افحص [Termux:Boot](https://github.com/termux/termux-boot) من مصدر التثبيت نفسه، وجرّبه على بيانات وهمية قبل اعتماد الاعتمادية على أندرويد.
