/* Local image-only PDF output. No DOM, fonts, genealogy, storage or network. */
(function(scope){
  'use strict';
  const limits=Object.freeze({maxPages:100,maxTotalJpegBytes:32*1024*1024,maxDimension:4096,maxPixels:12000000,targetDpi:200});
  function paper(width,height){
    if(typeof width!=='number'||typeof height!=='number'||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>10000||height>10000)throw Error('مقاس ورق PDF غير صالح');
  }
  function planRaster(widthMm,heightMm){
    paper(widthMm,heightMm);
    const w=widthMm/25.4*limits.targetDpi,h=heightMm/25.4*limits.targetDpi;
    const scale=Math.min(1,limits.maxDimension/w,limits.maxDimension/h,Math.sqrt(limits.maxPixels/(w*h)));
    const width=Math.max(1,Math.floor(w*scale)),height=Math.max(1,Math.floor(h*scale));
    return {width,height,dpi:limits.targetDpi,effectiveDpi:Math.min(limits.targetDpi,width*25.4/widthMm,height*25.4/heightMm)};
  }
  const isBytes=value=>ArrayBuffer.isView(value)&&Object.prototype.toString.call(value)==='[object Uint8Array]';
  function jpegInfo(bytes){
    if(!isBytes(bytes)||bytes.length<4||bytes[0]!==255||bytes[1]!==216)throw Error('صفحة PDF تحتاج صورة JPEG محلية صالحة');
    let pos=2,frame=null,sawScan=false,restartInterval=0;
    const quantization=new Map(),huffman=new Map();
    const fail=()=>{throw Error('بيانات JPEG غير مكتملة أو غير مدعومة');};
    while(pos<bytes.length){
      if(bytes[pos++]!==255)fail();
      while(pos<bytes.length&&bytes[pos]===255)pos++;
      if(pos>=bytes.length)fail();
      const marker=bytes[pos++];
      if(marker===217){
        if(!frame||!sawScan||pos!==bytes.length||frame.channels.some(channel=>channel.coefficients[0]<0))fail();
        return frame;
      }
      if(marker===0||marker===216||(marker>=208&&marker<=215)||pos+2>bytes.length)fail();
      const size=(bytes[pos]<<8)|bytes[pos+1],end=pos+size;
      if(size<2||end>bytes.length)fail();
      if(marker===192||marker===193||marker===194){
        if(frame||size<8)fail();
        const precision=bytes[pos+2],height=(bytes[pos+3]<<8)|bytes[pos+4],width=(bytes[pos+5]<<8)|bytes[pos+6],components=bytes[pos+7];
        if(precision!==8||!width||!height||size!==8+3*components||(components!==1&&components!==3))throw Error('PDF يدعم JPEG رمادية أو RGB بعمق 8 بت فقط');
        const channels=[];let blocks=0;
        for(let c=0;c<components;c++){
          const at=pos+8+3*c,id=bytes[at],horizontal=bytes[at+1]>>4,vertical=bytes[at+1]&15,table=bytes[at+2];
          if(channels.some(channel=>channel.id===id)||horizontal<1||horizontal>4||vertical<1||vertical>4||table>3)fail();
          channels.push({id,table,coefficients:new Int8Array(64).fill(-1)});blocks+=horizontal*vertical;
        }
        if(blocks>10)fail();
        frame={width,height,components,channels,progressive:marker===194,baseline:marker===192};
      }else if(marker===219){
        let at=pos+2;
        while(at<end){
          const descriptor=bytes[at++],precision=descriptor>>4,id=descriptor&15;
          if(precision>1||id>3||at+64*(precision+1)>end)fail();
          for(let i=0;i<64;i++){
            const value=precision?(bytes[at++]<<8)|bytes[at++]:bytes[at++];
            if(!value)fail();
          }
          quantization.set(id,precision);
        }
        if(at!==end||size===2)fail();
      }else if(marker===196){
        let at=pos+2;
        while(at<end){
          const descriptor=bytes[at++],kind=descriptor>>4,id=descriptor&15;
          if(kind>1||id>3||at+16>end)fail();
          let count=0,remaining=1;
          for(let i=0;i<16;i++){const n=bytes[at++];count+=n;remaining=remaining*2-n;if(remaining<0)fail();}
          // The all-ones code is reserved for entropy padding.
          if(!count||count>256||!remaining||at+count>end)fail();
          const symbols=new Set();
          for(let i=0;i<count;i++){
            const symbol=bytes[at++],bits=symbol&15;
            if(symbols.has(symbol)||(kind===0?symbol>11:bits>10))fail();
            symbols.add(symbol);
          }
          huffman.set(kind*4+id,symbols);
        }
        if(at!==end||size===2)fail();
      }else if(marker===221){
        if(size!==4)fail();
        restartInterval=(bytes[pos+2]<<8)|bytes[pos+3];
      }else if(marker===218){
        if(!frame||size<6)fail();
        const components=bytes[pos+2];
        if(components<1||components>frame.components||size!==6+2*components)fail();
        const scan=[],spectralStart=bytes[end-3],spectralEnd=bytes[end-2],high=bytes[end-1]>>4,low=bytes[end-1]&15;
        if(spectralStart>spectralEnd||spectralEnd>63||high>13||low>13)fail();
        if(frame.progressive){
          if((spectralStart===0&&spectralEnd!==0)||(spectralStart>0&&components!==1)||(high!==0&&high!==low+1))fail();
        }else if(spectralStart!==0||spectralEnd!==63||high!==0||low!==0)fail();
        for(let c=0;c<components;c++){
          const at=pos+3+2*c,id=bytes[at],dc=bytes[at+1]>>4,ac=bytes[at+1]&15,channel=frame.channels.find(channel=>channel.id===id);
          if(!channel||scan.includes(channel)||dc>3||ac>3||!quantization.has(channel.table)||(frame.baseline&&quantization.get(channel.table)!==0))fail();
          if((spectralStart===0&&high===0&&!huffman.has(dc))||(spectralEnd>0&&!huffman.has(4+ac)))fail();
          if(!frame.progressive&&Array.from(huffman.get(4+ac)).some(symbol=>(symbol&15)===0&&symbol!==0&&symbol!==240))fail();
          if(spectralStart>0&&channel.coefficients[0]<0)fail();
          for(let coefficient=spectralStart;coefficient<=spectralEnd;coefficient++){
            if(channel.coefficients[coefficient]!== (high===0?-1:high))fail();
            channel.coefficients[coefficient]=low;
          }
          scan.push(channel);
        }
        sawScan=true;pos=end;
        // Entropy data may contain stuffed FF bytes and restart markers.
        // A following real marker starts another progressive scan or EOI.
        let found=false,entropyBytes=0,nextRestart=0,sinceRestart=0;
        while(pos<bytes.length){
          if(bytes[pos++]!==255){entropyBytes++;sinceRestart++;continue;}
          const start=pos-1;
          while(pos<bytes.length&&bytes[pos]===255)pos++;
          if(pos>=bytes.length)fail();
          const code=bytes[pos++];
          if(code===0){if(pos-start!==2)fail();entropyBytes++;sinceRestart++;continue;}
          if(code>=208&&code<=215){
            if(!restartInterval||!sinceRestart||code!==208+nextRestart)fail();
            nextRestart=(nextRestart+1)%8;sinceRestart=0;continue;
          }
          pos=start;found=true;break;
        }
        if(!found||!entropyBytes||!sinceRestart)fail();
        continue;
      }else if(!((marker>=224&&marker<=239)||marker===254))fail();
      pos=end;
    }
    fail();
  }
  function ascii(value){
    const out=new Uint8Array(value.length);
    for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);if(code>127)throw Error('صياغة PDF غير صالحة');out[i]=code;}
    return out;
  }
  function point(mm){
    // PDF numbers have no exponent syntax. Preserve JS conversion precision,
    // including positive dimensions below the usual six-decimal rounding.
    const value=String(mm*72/25.4);
    if(!value.includes('e'))return value;
    const [mantissa,exponent]=value.split('e'),digits=mantissa.replace('.',''),decimal=(mantissa.indexOf('.')<0?mantissa.length:mantissa.indexOf('.'))+Number(exponent);
    return decimal<=0?'0.'+'0'.repeat(-decimal)+digits:decimal>=digits.length?digits+'0'.repeat(decimal-digits.length):digits.slice(0,decimal)+'.'+digits.slice(decimal);
  }
  function create(pages){
    if(!Array.isArray(pages)||pages.length<1||pages.length>limits.maxPages)throw Error('PDF يدعم من صفحة واحدة إلى '+limits.maxPages+' صفحة؛ استخدم دفتر HTML للملفات الأكبر');
    let totalJpegBytes=0;
    const checked=Array.from(pages,page=>{
      if(!page||typeof page!=='object')throw Error('صفحة PDF غير صالحة');
      paper(page.widthMm,page.heightMm);
      const w=page.pixelWidth,h=page.pixelHeight;
      if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>limits.maxDimension||h>limits.maxDimension||w*h>limits.maxPixels)throw Error('صورة صفحة PDF تتجاوز حد الأبعاد المسموح');
      if(!isBytes(page.jpeg))throw Error('صورة صفحة PDF غير صالحة');
      totalJpegBytes+=page.jpeg.length;
      if(totalJpegBytes>limits.maxTotalJpegBytes)throw Error('صور PDF تتجاوز 32 ميغابايت؛ استخدم دفتر HTML أو صدّر فرعًا أصغر');
      const info=jpegInfo(page.jpeg);
      if(info.width!==w||info.height!==h)throw Error('مقاس JPEG لا يطابق صورة صفحة PDF');
      return {widthPt:point(page.widthMm),heightPt:point(page.heightMm),pixelWidth:w,pixelHeight:h,jpeg:page.jpeg,components:info.components};
    });
    const parts=[],offsets=[0];let length=0;
    const append=bytes=>{parts.push(bytes);length+=bytes.length;};
    const text=value=>append(ascii(value));
    const object=(id,body)=>{offsets[id]=length;text(id+' 0 obj\n');for(const part of body)typeof part==='string'?text(part):append(part);text('\nendobj\n');};
    text('%PDF-1.4\n%');append(new Uint8Array([226,227,207,211]));text('\n');
    object(1,['<< /Type /Catalog /Pages 2 0 R >>']);
    object(2,['<< /Type /Pages /Count '+checked.length+' /Kids ['+checked.map((_p,i)=>(3+i*3)+' 0 R').join(' ')+'] >>']);
    checked.forEach((page,i)=>{
      const id=3+i*3,contentId=id+1,imageId=id+2;
      object(id,['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+page.widthPt+' '+page.heightPt+'] /Resources << /XObject << /Im0 '+imageId+' 0 R >> >> /Contents '+contentId+' 0 R >>']);
      const content=ascii('q\n'+page.widthPt+' 0 0 '+page.heightPt+' 0 0 cm\n/Im0 Do\nQ\n');
      object(contentId,['<< /Length '+content.length+' >>\nstream\n',content,'\nendstream']);
      object(imageId,['<< /Type /XObject /Subtype /Image /Width '+page.pixelWidth+' /Height '+page.pixelHeight+' /ColorSpace /'+(page.components===1?'DeviceGray':'DeviceRGB')+' /BitsPerComponent 8 /Filter /DCTDecode /Length '+page.jpeg.length+' >>\nstream\n',page.jpeg,'\nendstream']);
    });
    const xref=length,count=2+checked.length*3;
    text('xref\n0 '+(count+1)+'\n0000000000 65535 f \n');
    for(let id=1;id<=count;id++)text(String(offsets[id]).padStart(10,'0')+' 00000 n \n');
    text('trailer\n<< /Size '+(count+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
    const output=new Uint8Array(length);let cursor=0;
    for(const part of parts){output.set(part,cursor);cursor+=part.length;}
    return output;
  }
  const api=Object.freeze({planRaster,create,limits});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.TreeImagePdf=api;
})(globalThis);
