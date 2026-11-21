'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const http=require('node:http');
const {createPortal}=require('./server.cjs');
const core=require('../Claud/botanical-core.js');

test('HTTPS-origin configuration behind a loopback HTTP proxy',{timeout:10000},async()=>{
  const host='family.example.test';
  const origin='https://'+host;
  const portal=createPortal({filename:':memory:',origin});
  const credentials={identifier:'admin@example.test',password:'TLS-Backup-Test-2026'};
  let proxy;
  try{
    await portal.initialize({login:credentials.identifier,password:credentials.password,document:core.fixture(10)});
    await once(portal.server.listen(0,'127.0.0.1'),'listening');
    proxy=http.createServer((req,res)=>{
      const upstream=http.request({
        host:'127.0.0.1',port:portal.server.address().port,path:req.url,method:req.method,headers:req.headers
      },response=>{
        res.writeHead(response.statusCode,response.headers);
        response.pipe(res);
      });
      res.on('close',()=>upstream.destroy());
      upstream.on('error',()=>res.destroy());
      req.pipe(upstream);
    });
    await once(proxy.listen(0,'127.0.0.1'),'listening');
    function request(route,{method='GET',data,requestOrigin=origin,cookie}={}){
      return new Promise((resolve,reject)=>{
        const headers={host,origin:requestOrigin,connection:'close'};
        if(data)headers['content-type']='application/json';
        if(cookie)headers.cookie=cookie;
        const req=http.request({host:'127.0.0.1',port:proxy.address().port,path:route,method,headers},resolve);
        req.on('error',reject);
        req.end(data&&JSON.stringify(data));
      });
    }
    const rejected=await request('/api/login',{method:'POST',data:credentials,requestOrigin:'https://unrelated.test'});
    assert.equal(rejected.statusCode,403);
    rejected.resume();
    const login=await request('/api/login',{method:'POST',data:credentials});
    assert.equal(login.statusCode,200);
    assert.match(login.headers['set-cookie'][0],/HttpOnly; SameSite=Strict; Max-Age=\d+; Secure/);
    login.resume();
    const cookie=login.headers['set-cookie'][0].split(';')[0];
    const stream=await request('/api/live',{cookie});
    assert.match(stream.headers['content-type'],/^text\/event-stream/);
    const [first]=await once(stream,'data');
    assert.match(first.toString(),/^event: tree\ndata:/);
    stream.destroy();
  }finally{
    for(const server of [proxy,portal.server]){
      if(server?.listening)await new Promise(resolve=>server.close(resolve));
    }
  }
});
