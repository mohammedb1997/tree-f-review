/* Local, bounded page rasterization. No print dialog, upload or storage access. */
(function(scope){
  'use strict';
  const abortError=()=>Object.assign(Error('أُلغي إنشاء PDF'),{name:'AbortError'});
  function abort(signal){if(signal?.aborted)throw abortError();}
  function waitFor(signal,start){
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(fn,value)=>{
        if(settled)return;
        settled=true;signal?.removeEventListener('abort',cancelled);fn(value);
      };
      const cancelled=()=>finish(reject,abortError());
      signal?.addEventListener('abort',cancelled,{once:true});
      if(signal?.aborted){cancelled();return;}
      // Native encoding/byte reads may finish after cancellation. Settle now
      // so finally releases raster resources, and ignore their late results.
      try{start(value=>finish(resolve,value),error=>finish(reject,error));}catch(error){finish(reject,error);}
    });
  }
  async function create(pages,{signal,onProgress=()=>{}}={}){
    const writer=scope.TreeImagePdf;
    if(!writer)throw Error('تعذر تحميل أداة PDF؛ أعد فتح الصفحة');
    if(!Array.isArray(pages)||!pages.length||pages.length>writer.limits.maxPages)throw Error('عدد صفحات PDF كبير؛ استخدم دفتر HTML أو صدّر فرعًا أصغر');
    // Validate every target before decoding the first SVG. Intrinsic image
    // dimensions are replaced with the bounded pixel size before Image.src.
    const targets=Array.from(pages,page=>{
      if(!page||typeof page!=='object')throw Error('صفحة PDF غير صالحة');
      const target=writer.planRaster(page.widthMm,page.heightMm);
      if(target.effectiveDpi<96)throw Error('المقاس كبير لتنزيل PDF بهذه الدقة؛ اختر مقاسًا أصغر أو استخدم ملف HTML للطباعة المتجهة');
      if(typeof page.svg!=='string'||!page.svg.startsWith('<svg'))throw Error('صفحة PDF غير صالحة');
      const parsed=new scope.DOMParser().parseFromString(page.svg,'image/svg+xml'),svg=parsed.documentElement;
      if(parsed.querySelector('parsererror')||svg.localName!=='svg'||svg.namespaceURI!=='http://www.w3.org/2000/svg')throw Error('تعذر قراءة صفحة PDF');
      // Inspect actual markup, not text content: a person's literal name may
      // contain words such as "onload=" without being executable markup.
      for(const element of [svg,...svg.querySelectorAll('*')]){
        if(['script','foreignobject','style','image','use','iframe','object','embed'].includes(element.localName.toLowerCase()))throw Error('صفحة PDF تحتوي عنصرًا غير مسموح');
        for(const attribute of element.attributes){
          const name=attribute.localName.toLowerCase();
          const cssValue=['style','fill','stroke','filter','clip-path','mask','cursor','marker','marker-start','marker-mid','marker-end'].includes(name);
          if(/^on/.test(name)||name==='base'||((name==='href'||name==='src')&&!attribute.value.startsWith('#'))||(cssValue&&/url\s*\(|@import/i.test(attribute.value)))throw Error('صفحة PDF تحتوي موردًا غير مسموح');
        }
      }
      svg.setAttribute('width',String(target.width));svg.setAttribute('height',String(target.height));
      return {...target,markup:new scope.XMLSerializer().serializeToString(svg)};
    });
    abort(signal);const encoded=[];let totalBytes=0;
    for(let index=0;index<pages.length;index++){
      abort(signal);const page=pages[index],target=targets[index];
      onProgress({completed:index,total:pages.length,effectiveDpi:target.effectiveDpi});
      let url,canvas,image;
      try{
        url=scope.URL.createObjectURL(new scope.Blob([target.markup],{type:'image/svg+xml;charset=utf-8'}));
        image=new scope.Image();
        await new Promise((resolve,reject)=>{
          const cancelled=()=>{image.onload=image.onerror=null;image.src='';reject(abortError());};
          const finish=fn=>()=>{signal?.removeEventListener('abort',cancelled);fn();};
          image.onload=finish(resolve);image.onerror=finish(()=>reject(Error('تعذر رسم صفحة PDF')));
          signal?.addEventListener('abort',cancelled,{once:true});
          if(signal?.aborted){signal.removeEventListener('abort',cancelled);cancelled();return;}
          image.src=url;
        });
        abort(signal);
        if(image.naturalWidth!==target.width||image.naturalHeight!==target.height)throw Error('أبعاد الصورة غير مطابقة للحد الآمن');
        canvas=scope.document.createElement('canvas');canvas.width=target.width;canvas.height=target.height;
        const context=canvas.getContext('2d');if(!context)throw Error('رسم PDF غير متاح في هذا المتصفح');
        context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0);
        const blob=await waitFor(signal,(resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('تعذر ترميز صورة صفحة PDF')),'image/jpeg',0.94));
        abort(signal);
        if(blob.type!=='image/jpeg')throw Error('المتصفح لا يدعم ترميز JPEG المطلوب');
        totalBytes+=blob.size;if(totalBytes>writer.limits.maxTotalJpegBytes)throw Error('حجم PDF كبير؛ استخدم دفتر HTML أو فرعًا أصغر');
        const jpeg=new Uint8Array(await waitFor(signal,(resolve,reject)=>Promise.resolve(blob.arrayBuffer()).then(resolve,reject)));abort(signal);
        encoded.push({widthMm:page.widthMm,heightMm:page.heightMm,pixelWidth:target.width,pixelHeight:target.height,jpeg});
      }finally{
        if(url)scope.URL.revokeObjectURL(url);
        if(image){image.onload=image.onerror=null;image.src='';}
        if(canvas){canvas.width=0;canvas.height=0;}
      }
      onProgress({completed:index+1,total:pages.length,effectiveDpi:target.effectiveDpi});
      // Let the toolbar update and the cancel action run between pages.
      await new Promise(resolve=>scope.setTimeout(resolve,0));
    }
    abort(signal);return writer.create(encoded);
  }
  scope.TreePdfExport={create};
})(globalThis);
