'use strict';

const {accessSync, constants, statSync} = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const core = require('../Claud/botanical-core.js');

function httpsOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw Error('اضبط TREEF_ORIGIN على عنوان HTTPS صالح.'); }
  if (url.protocol !== 'https:' || url.origin !== value || !url.hostname.includes('.') ||
      url.hostname === 'family.example.org') {
    throw Error('استخدم أصل HTTPS للنطاق الفعلي، من دون مسار أو بيانات دخول.');
  }
  return url.origin;
}

function checkDatabase(filename) {
  try {
    if (!statSync(filename).isFile()) throw Error();
    accessSync(filename, constants.R_OK | constants.W_OK);
    accessSync(path.dirname(filename), constants.W_OK);
  } catch {
    throw Error('قاعدة البيانات يجب أن تكون ملفًا موجودًا وقابلًا للكتابة، مع مجلد قابل للكتابة لمستخدم الخدمة.');
  }
  let db;
  try {
    db = new DatabaseSync(filename,{readOnly:true});
    if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw Error();
    const row = db.prepare('SELECT document FROM tree WHERE id=1').get();
    if (!row) throw Error();
    core.validate(JSON.parse(row.document));
    if (!db.prepare("SELECT 1 FROM accounts WHERE role='admin' AND length(password)>0 LIMIT 1").get()) throw Error();
  } catch {
    throw Error('تعذر اعتماد قاعدة البيانات. تحقق من سلامتها وتهيئة الشجرة ووجود حساب مدير مفعّل.');
  } finally {
    db?.close();
  }
}

function checkConfiguration(env) {
  httpsOrigin(env.TREEF_ORIGIN);
  if ((env.TREEF_PORT ?? '4178') !== '4178') {
    throw Error('قالب Caddy يتوقع منفذ 4178. وحّد إعدادات المنفذ قبل تشغيل الخدمة.');
  }
  if (!env.TREEF_DB || !path.isAbsolute(env.TREEF_DB)) {
    throw Error('اضبط TREEF_DB على مسار مطلق لملف SQLite الخاص.');
  }
  checkDatabase(env.TREEF_DB);
}

async function checkPublishedPortal(origin, request = fetch) {
  origin = httpsOrigin(origin);
  for (const [route,status,type] of [
    ['/portal/',200,'text/html'],
    ['/api/tree',401,'application/json'],
    ['/api/backup',401,'application/json'],
    ['/api/live',401,'application/json']
  ]) {
    let response;
    try {
      response = await request(origin+route,{redirect:'manual',signal:AbortSignal.timeout(8000)});
    } catch {
      throw Error(`تعذر الاتصال عبر HTTPS عند ${route}.`);
    }
    try {
      const mime = response.headers.get('content-type')?.split(';')[0];
      const cache = response.headers.get('cache-control');
      if (response.status !== status || mime !== type || !cache?.toLowerCase().split(/\s*,\s*/).includes('no-store')) {
        throw Error(`استجابة غير متوقعة عند ${route}. تحقق من الوكيل ونطاق الوصول ومنع التخزين المؤقت.`);
      }
    } finally {
      await response.body?.cancel();
    }
  }
}

async function main() {
  const [mode,origin] = process.argv.slice(2);
  if (mode === 'check' && !origin) checkConfiguration(process.env);
  else if (mode === 'probe' && origin) await checkPublishedPortal(origin);
  else throw Error('الاستخدام: node portal/launch-check.cjs check | probe https://your-family-domain');
  console.log(mode==='check'?'اجتاز الإعداد المحلي فحص الجاهزية.':'اجتازت البوابة فحص وصول الزائر عبر HTTPS.');
}
if (require.main === module) main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
module.exports = {checkConfiguration,checkPublishedPortal};
