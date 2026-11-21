'use strict';
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript'};
const files=new Set([
  '/portal/world/index.html','/portal/world/world.css','/portal/world/world.js',
  '/portal/world/vendor/three.core.min.js','/portal/world/vendor/three.module.min.js',
  '/portal/world/vendor/OrbitControls.js','/Claud/botanical-core.js',
  '/portal/preview.html','/portal/preview.js','/portal/app.js','/portal/style.css'
]);

function createDemoServer(){
  return createServer(async(req,res)=>{
    const route=req.url.split('?')[0];
    const file=route==='/portal/world/'?'/portal/world/index.html':route;
    if(!files.has(file)){res.writeHead(404).end();return;}
    try{
      const data=await readFile(path.join(root,file.slice(1)));
      res.setHeader('Content-Type',types[path.extname(file)]+'; charset=utf-8');
      res.setHeader('X-Content-Type-Options','nosniff');
      res.end(data);
    }catch{res.writeHead(500).end();}
  });
}

if(require.main===module){
  const port=Number(process.argv[2]||4191);
  createDemoServer().listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port+'/portal/world/'));
}
module.exports={createDemoServer};
