'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {once} = require('node:events');
const {DatabaseSync} = require('node:sqlite');
const {createPortal} = require('../server.cjs');
const {createBackup} = require('../backup.cjs');
const core = require('../../Claud/botanical-core.js');

const pilotId = 'synthetic-note9-pilot';
const login = 'admin@example.test';
const password = 'Note9-Demo-Only-2026';
const filenameFor = directory => path.join(directory, 'sample.sqlite');

function assertPilotDatabase(filename) {
  let db;
  try {
    db = new DatabaseSync(filename, {readOnly:true});
    const row = db.prepare('SELECT document FROM tree WHERE id=1').get();
    if (!row || JSON.parse(row.document).treeId !== pilotId) throw Error();
  } catch {
    throw Error('هذا الملف لا يُطابق قاعدة تجربة النوت ٩. اختر موقعًا آخر للتجربة.');
  } finally {
    db?.close();
  }
}

async function startPilot(directory, port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('اختر منفذًا بين 1024 و65535.');
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const filename = filenameFor(directory);
  let firstRun;
  try {
    fs.closeSync(fs.openSync(filename,'wx',0o600));
    firstRun = true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    assertPilotDatabase(filename);
  }
  const origin = `http://127.0.0.1:${port}`;
  const portal = createPortal({filename,origin});
  try {
    if (firstRun) {
      const document = {...core.fixture(10),treeId:pilotId,title:'تجربة النوت ٩ · بيانات وهمية'};
      await portal.initialize({login,password,document});
    }
    await once(portal.server.listen(port,'127.0.0.1'),'listening');
  } catch (error) {
    portal.server.close();
    throw error;
  }
  return {server:portal.server,origin};
}

async function backupPilot(directory) {
  const filename = filenameFor(directory);
  if (!fs.existsSync(filename)) throw Error('شغّل تجربة النوت ٩ أولًا لإنشاء قاعدة وهمية.');
  assertPilotDatabase(filename);
  return createBackup(filename,path.join(directory,'backups'));
}

async function main() {
  const [command='serve',rawPort] = process.argv.slice(2);
  const directory = path.join(os.homedir(),'.treef-note9-pilot');
  process.umask(0o077);
  if (command==='backup' && !rawPort) {
    console.log(await backupPilot(directory));
    return;
  }
  if(command!=='serve') throw Error('الاستخدام: note9-pilot.cjs serve [port] | backup');
  const {server,origin} = await startPilot(directory,Number(rawPort??4178));
  const stop = () => {server.close();server.closeAllConnections();};
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  console.log('تجربة محلية ببيانات وهمية:',origin);
  console.log('حساب التجربة:',login,password);
  console.log('مجلد التجربة:',directory);
}
if (require.main===module) main().catch(error => {
  console.error(error.message);
  process.exitCode=1;
});
module.exports={startPilot,backupPilot};
