'use strict';

const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const {closeSync, constants, copyFileSync, existsSync, fsyncSync, mkdirSync, mkdtempSync, openSync, rmdirSync, unlinkSync}=fs;
const path=require('node:path');
const {backup,DatabaseSync}=require('node:sqlite');
const core=require('../Claud/botanical-core.js');

function verify(db){
  const checks=db.prepare('PRAGMA integrity_check').all();
  if(checks.length!==1||checks[0].integrity_check!=='ok')throw Error('SQLite integrity check failed');
  if(db.prepare('PRAGMA foreign_key_check').get())throw Error('SQLite foreign key check failed');
  const family=db.prepare('SELECT document FROM tree WHERE id=1').get();
  if(!family||!db.prepare("SELECT id FROM accounts WHERE role='admin' AND password IS NOT NULL").get())
    throw Error('This database has no initialized family portal');
  core.validate(JSON.parse(family.document));
}

const linkUnavailable=new Set(['EACCES','EPERM','ENOSYS','ENOTSUP','EOPNOTSUPP','EXDEV']);
const pendingPath=filename=>filename+'.incomplete';

function publishSnapshot(temporary,target){
  try{
    fs.linkSync(temporary,target);
    return;
  }catch(error){
    if(!linkUnavailable.has(error.code))throw error;
  }
  // Android can deny hard links even within the same private directory.
  // Keep an interrupted copy ineligible for restore and create the target exclusively.
  const pending=pendingPath(target);
  closeSync(openSync(pending,'wx',0o600));
  try{
    copyFileSync(temporary,target,constants.COPYFILE_EXCL);
    const file=openSync(target,'r+');
    try{fsyncSync(file);}finally{closeSync(file);}
  }catch(error){
    if(error.code==='EEXIST'||!existsSync(target))unlinkSync(pending);
    throw error;
  }
  unlinkSync(pending);
}

async function writeSnapshot(source,destination,{resetAccess=false}={}){
  if(!source||!destination)throw Error('Provide the source and destination paths');
  const sourcePath=path.resolve(source);
  if(existsSync(pendingPath(sourcePath)))throw Error('Source snapshot is marked incomplete. Choose a completed file.');
  const target=path.resolve(destination);
  if(existsSync(target)||existsSync(pendingPath(target)))throw Error('Destination already exists or is marked incomplete. Choose a new file.');
  const directory=path.dirname(target);
  const staging=mkdtempSync(path.join(directory,'.family-snapshot-'));
  const temporary=path.join(staging,'snapshot.sqlite');
  try{
    const original=new DatabaseSync(sourcePath,{readOnly:true});
    try{await backup(original,temporary);}finally{original.close();}
    const candidate=new DatabaseSync(temporary);
    try{
      candidate.exec('PRAGMA journal_mode=DELETE');
      verify(candidate);
      if(resetAccess){
        candidate.exec(`BEGIN IMMEDIATE;
          DELETE FROM sessions;
          UPDATE accounts SET invitation=NULL,invite_until=NULL;
          COMMIT;`);
      }
    }finally{candidate.close();}
    publishSnapshot(temporary,target);
    return target;
  }finally{
    if(existsSync(temporary))unlinkSync(temporary);
    rmdirSync(staging);
  }
}

async function createBackup(source,directory){
  if(!source||!directory)throw Error('Provide the database and backup directory');
  mkdirSync(directory,{recursive:true,mode:0o700});
  const now=new Date().toISOString().replace(/[:.]/g,'-');
  return writeSnapshot(source,path.join(directory,`family-${now}-${randomUUID()}.sqlite`));
}

function restoreBackup(source,destination){
  return writeSnapshot(source,destination,{resetAccess:true});
}

if(require.main===module){
  process.umask(0o077);
  const [mode,source,destination]=process.argv.slice(2);
  const task={backup:createBackup,restore:restoreBackup}[mode];
  if(!task){
    console.error('Usage: node portal/backup.cjs backup <database> <directory> OR restore <backup> <new-database>');
    process.exitCode=1;
  }else{
    task(source,destination).then(file=>console.log(file)).catch(error=>{
      console.error(error.message);
      process.exitCode=1;
    });
  }
}

module.exports={createBackup,restoreBackup};
