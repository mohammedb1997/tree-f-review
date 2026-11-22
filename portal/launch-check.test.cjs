'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const {once} = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {createPortal} = require('./server.cjs');
const {checkConfiguration,checkPublishedPortal} = require('./launch-check.cjs');
const core = require('../Claud/botanical-core.js');

test('production preflight accepts an initialized fixture and rejects bad launch settings',async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'treef-preflight-'));
  const filename = path.join(dir,'tree.sqlite');
  const origin = 'https://family.example.test';
  const portal = createPortal({filename,origin});
  const settings = {TREEF_ORIGIN:origin,TREEF_DB:filename,TREEF_PORT:'4178'};
  try {
    await once(portal.server.listen(0,'127.0.0.1'),'listening');
    assert.throws(() => checkConfiguration(settings),/تهيئة الشجرة/);
    await portal.initialize({login:'admin@example.test',password:'Launch-Test-Only-2026',document:core.fixture(10)});
    checkConfiguration(settings);
    assert.throws(() => checkConfiguration({...settings,TREEF_DB:path.join(dir,'missing.sqlite')}),/ملفًا موجودًا/);
    assert.throws(() => checkConfiguration({...settings,TREEF_DB:'tree.sqlite'}),/مسار مطلق/);
    assert.throws(() => checkConfiguration({...settings,TREEF_ORIGIN:'http://127.0.0.1:4178'}),/أصل HTTPS/);
    assert.throws(() => checkConfiguration({...settings,TREEF_ORIGIN:origin+'/portal/'}),/أصل HTTPS/);
    assert.throws(() => checkConfiguration({...settings,TREEF_ORIGIN:'https://family.example.org'}),/أصل HTTPS/);
    assert.throws(() => checkConfiguration({...settings,TREEF_PORT:'4179'}),/4178/);
  } finally {
    if (portal.server.listening) await new Promise(resolve => portal.server.close(resolve));
    for (const name of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir,name));
    fs.rmdirSync(dir);
  }
});

test('guest probe requires denied access and no-store through the proxy',async () => {
  const origin = 'https://family.example.test';
  const portal = createPortal({filename:':memory:',origin});
  try {
    await portal.initialize({login:'admin@example.test',password:'Launch-Test-Only-2026',document:core.fixture(10)});
    await once(portal.server.listen(0,'127.0.0.1'),'listening');
    const port = portal.server.address().port;
    function localProxy(url, options) {
      const route = new URL(url).pathname;
      assert.equal(options.redirect,'manual');
      return new Promise((resolve,reject) => {
        const request = http.get({
          hostname:'127.0.0.1',port,path:route,headers:{Host:'family.example.test'},signal:options.signal
        },response => {
          response.resume();
          resolve(new Response(null,{status:response.statusCode,headers:response.headers}));
        });
        request.on('error',reject);
      });
    }
    await checkPublishedPortal(origin,localProxy);
    await assert.rejects(checkPublishedPortal(origin,(url,options) => url.endsWith('/api/backup')
      ? Promise.resolve(new Response('{}',{status:200,headers:{'content-type':'application/json','cache-control':'no-store'}}))
      : localProxy(url,options)),/\/api\/backup/);
    await assert.rejects(checkPublishedPortal(origin,() => Promise.resolve(
      new Response('login',{headers:{'content-type':'text/html','cache-control':'public'}}))),/التخزين المؤقت/);
  } finally {
    if (portal.server.listening) await new Promise(resolve => portal.server.close(resolve));
  }
});
