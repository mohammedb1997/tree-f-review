/* Full-paper, local SVG sheets for the existing family-detail print plan. */
(function (scope) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./botanical-core.js') : scope.BotanicalCore;
  const P = typeof module !== 'undefined' && module.exports ? require('./print-service.js') : scope.BotanicalPrint;
  const MAX_PAGES = 100, MAX_PAPER_MM = 10000, HEADER_MM = 14, PT_MM = 25.4 / 72;
  const esc = value => {
    const text = String(value);
    for (const char of text) {
      const cp = char.codePointAt(0);
      if (cp < 32 && ![9,10,13].includes(cp) || cp >= 0xd800 && cp <= 0xdfff || [0xfffe,0xffff].includes(cp)) fail('نص يحتوي محرفاً غير صالح في SVG');
    }
    return text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  };
  const n = value => Number(value.toFixed(6));
  const fail = (message, code = 'PRINT_DOCUMENT_INVALID') => { const error = Error(message); error.code = code; throw error; };
  const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('ar', {granularity:'grapheme'}) : null;
  function graphemes(text) {
    if (segmenter) return Array.from(segmenter.segment(text), item => item.segment);
    // Preserve Arabic combining marks and joined emoji on older engines too.
    const parts = []; let joinNext = false, regional = false;
    for (const char of Array.from(text)) {
      const mark = /[\p{M}\p{Emoji_Modifier}]/u.test(char), flag = /\p{Regional_Indicator}/u.test(char);
      if (parts.length && (mark || joinNext || char === '\u200d' || flag && regional)) parts[parts.length-1] += char; else parts.push(char);
      joinNext = char === '\u200d'; regional = flag && !regional;
    }
    return parts;
  }

  function metrics(measure) {
    if (measure !== undefined && typeof measure !== 'function') fail('قياس الخط غير صالح');
    // The same callback used by BotanicalPrint measures the loaded font at 18px.
    // The fallback is an explicit Node estimate, not a claim about glyph bounds.
    return {
      method: measure ? 'provided-font-measurement-at-18px' : 'node-grapheme-estimate-at-18px',
      width(text, fontMm) {
        const px = measure ? measure(text) : graphemes(text).length * 10;
        if (!Number.isFinite(px) || px < 0) fail('قياس الخط أعاد عرضاً غير صالح');
        return px * fontMm / 18;
      }
    };
  }

  function wrap(text, maxWidth, fontMm, meter) {
    const words = String(text).trim().split(/\s+/u).filter(Boolean), lines = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? line + ' ' + word : word;
      if (meter.width(candidate, fontMm) <= maxWidth + 1e-8) { line = candidate; continue; }
      if (line) { lines.push(line); line = ''; }
      if (meter.width(word, fontMm) <= maxWidth + 1e-8) { line = word; continue; }
      // A long token is continued rather than removed, ellipsized, or reduced.
      for (const cluster of graphemes(word)) {
        if (meter.width(cluster, fontMm) > maxWidth + 1e-8) fail('حرف لا يتسع بعرض الفهرس؛ كبّر الورق', 'PRINT_DOCUMENT_CAPACITY');
        if (line && meter.width(line + cluster, fontMm) > maxWidth + 1e-8) { lines.push(line); line = ''; }
        line += cluster;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  function fitTitle(title, maxWidth, fontMm, meter) {
    if (meter.width(title, fontMm) <= maxWidth) return title;
    const parts = graphemes(title); let low = 0, high = parts.length;
    if (meter.width('…', fontMm) > maxWidth) fail('عنوان الصفحة لا يتسع بعرض الورق');
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (meter.width(parts.slice(0, mid).join('') + '…', fontMm) <= maxWidth) low = mid; else high = mid - 1;
    }
    return parts.slice(0, low).join('') + '…';
  }

  function safeFamilyMarkup(markup) {
    if (typeof markup !== 'string' || /<!|<\?/i.test(markup)) fail('رسم صفحة الأسرة غير صالح');
    const allowed = new Set(['svg','g','rect','path','ellipse','text','title','circle']);
    const attributes = new Set(['xmlns','viewBox','width','height','style','x','y','rx','ry','r','fill','stroke','stroke-width','d','transform','class','data-person-id','data-context-person-id','data-parent-id','data-child-id','aria-label','text-anchor','direction','font-size','opacity']);
    for (const tag of markup.match(/<[^>]*>/g) || []) {
      const start = tag.match(/^<\/?([A-Za-z][\w-]*)\b/);
      if (!start || !allowed.has(start[1])) fail('رسم صفحة الأسرة يحتوي عنصراً غير مسموح');
      if (/^<\//.test(tag)) continue;
      let rest = tag.slice(start[0].length).replace(/\/?\s*>$/, '');
      while (rest.trim()) {
        const attribute = rest.match(/^\s+([A-Za-z_:][\w:.-]*)="([^"]*)"/);
        if (!attribute || !attributes.has(attribute[1])) fail('رسم صفحة الأسرة يحتوي خاصية غير مسموحة');
        const key = attribute[1], value = attribute[2];
        if (key === 'xmlns' && value !== 'http://www.w3.org/2000/svg') fail('مساحة أسماء SVG غير صالحة');
        if (key === 'style' && !/^font-family:Tahoma,Arial,sans-serif$|^font:(18|22)px Tahoma,Arial,sans-serif;unicode-bidi:plaintext$/.test(value)) fail('نمط رسم صفحة الأسرة غير مسموح');
        if (['fill','stroke'].includes(key) && !/^(none|#[0-9a-f]{6})$/i.test(value)) fail('لون صفحة الأسرة غير صالح');
        rest = rest.slice(attribute[0].length);
      }
    }
    const root = markup.match(/^<svg\b[^>]*>/);
    const box = root && root[0].match(/\bviewBox="0 0 ([\d.]+) ([\d.]+)"/);
    if (!box || !Number.isFinite(+box[1]) || !Number.isFinite(+box[2]) || +box[1] <= 0 || +box[2] <= 0) fail('حدود رسم صفحة الأسرة غير صالحة');
    return {root:root[0],width:+box[1],height:+box[2]};
  }

  function validateBook(doc, book) {
    if (!book || !Array.isArray(book.pages) || !book.pages.length || !Array.isArray(book.index)) fail('دفتر الأسر غير صالح');
    if (book.scope !== undefined && (!book.scope || typeof book.scope !== 'object' || Array.isArray(book.scope) || !['whole','branch'].includes(book.scope.kind) || book.scope.kind === 'branch' && (typeof book.scope.anchorPersonId !== 'string' || !book.scope.anchorPersonId))) fail('نطاق دفتر الأسر غير صالح');
    let visible;
    try {
      const anchor = book.scope?.kind === 'branch' ? book.scope.anchorPersonId : null;
      if (P?.selectScope) visible = P.selectScope(doc,anchor);
      else {
        // Preserve the previous standalone whole-book adapter when no print service is loaded.
        if (anchor !== null) fail('خدمة اختيار فرع الطباعة غير متاحة');
        visible = C.visible(doc);
        visible.scope = {kind:'whole',anchorPersonId:null,rootGeneration:0,people:visible.nodes.length,totalVisible:visible.nodes.length,omittedPeople:0,title:doc.title};
      }
    } catch (error) { fail(error.message); }
    if (!visible.root) fail('دفتر الأسر غير صالح');
    const expectedScope = visible.scope, byId = new Map(visible.nodes.map(item => [item.personId,item]));
    if (book.scope && ['kind','anchorPersonId','anchorName','rootGeneration','people','totalVisible','omittedPeople','title'].some(key => book.scope[key] !== expectedScope[key])) fail('بيانات نطاق دفتر الأسر لا تطابق الشجرة');
    if (book.people !== visible.nodes.length || book.excluded !== visible.excluded) fail('إحصاء نطاق دفتر الأسر لا يطابق الشجرة');
    if (book.pages.length >= MAX_PAGES) fail('دفتر الأسر والفهرس يتجاوزان حد 100 صفحة', 'PRINT_DOCUMENT_CAPACITY');
    const paper = book.paper || {}, area = book.area || {}, margin = paper.marginMm;
    if (![paper.widthMm,paper.heightMm,margin,area.width,area.height,book.minLabelPt].every(Number.isFinite) || paper.widthMm <= 0 || paper.heightMm <= 0 || paper.widthMm > MAX_PAPER_MM || paper.heightMm > MAX_PAPER_MM || margin < 0 || area.width <= 0 || area.height <= 0 || book.minLabelPt <= 0) fail('مقاس صفحات الدفتر غير صالح');
    const expectedPaper = C.bookPaper(doc.presentation);
    if (paper.widthMm !== expectedPaper.widthMm || paper.heightMm !== expectedPaper.heightMm || paper.preset !== undefined && paper.preset !== expectedPaper.preset) fail('مقاس دفتر الأسر لا يطابق اختيار A4 أو A3');
    if (book.minGenerationPt !== undefined && (!Number.isFinite(book.minGenerationPt) || book.minGenerationPt < 8)) fail('الحد الأدنى لرقم الجيل غير صالح');
    if (area.width + 2 * margin > paper.widthMm + 1e-7 || area.height + 2 * margin + HEADER_MM > paper.heightMm + 1e-7) fail('محتوى صفحات الدفتر يتجاوز الورق');
    const assigned = new Map();
    book.pages.forEach((page, i) => {
      if (page.number !== i + 1 || !Array.isArray(page.personIds)) fail('ترقيم صفحات الأسر غير صالح');
      for (const id of page.personIds) {
        if (!byId.has(id) || assigned.has(id)) fail('دفتر الأسر يحتوي شخصاً مخفياً أو مكرراً');
        assigned.set(id, page.number);
      }
      for (const id of page.contextPersonIds || []) if (!byId.has(id)) fail('سياق الأسرة يحتوي شخصاً خارج العرض');
      for (const group of page.groups || []) {
        const father = byId.get(group.anchorPersonId);
        if (!father || group.parentPersonId !== (byId.has(father.parentId) ? father.parentId : null)) fail('أصل مجموعة الأسرة خارج نطاق الطباعة');
        for (const key of ['personIds','primaryIds','contextIds']) if (!Array.isArray(group[key]) || group[key].some(id => !byId.has(id))) fail('مجموعة الأسرة تحتوي شخصاً خارج نطاق الطباعة');
      }
      const encodedIds = new Set(visible.nodes.map(person => esc(person.personId)));
      for (const [,id] of String(page.markup).matchAll(/\bdata-(?:person|context-person|parent|child)-id="([^"]*)"/g)) if (!encodedIds.has(id)) fail('رسم الأسرة يحتوي شخصاً خارج نطاق الطباعة');
    });
    const seen = new Set();
    for (const row of book.index) {
      const person = byId.get(row.personId), father = person && byId.get(person.parentId);
      const parentLabel = father ? father.fullName : expectedScope.kind === 'branch' ? 'أصل الفرع' : 'الأصل';
      if (!person || seen.has(row.personId) || row.name !== person.fullName || row.parent !== parentLabel || row.generation !== person.generation || row.page !== assigned.get(row.personId)) fail('الفهرس لا يطابق الأشخاص والأبوة وصفحات الأسر');
      seen.add(row.personId);
    }
    if (assigned.size !== visible.nodes.length || seen.size !== visible.nodes.length) fail('دفتر الأسر والفهرس لا يغطيان جميع المعروضين');
    return {paper,area,margin,visible,scope:expectedScope};
  }

  function header(doc, sheet, total, box, meter) {
    const {paper,margin} = box, width = paper.widthMm - 2 * margin;
    const fullTitle = String(box.scope.title || 'شجرة العائلة') + (sheet.kind === 'index' ? ' — فهرس الأشخاص' : ' — دفتر الأسر');
    const titleFont = 11 * PT_MM, metaFont = 8 * PT_MM;
    const title = fitTitle(fullTitle, width, titleFont, meter);
    const pageMetadata = sheet.kind === 'family'
      ? `صفحة ${sheet.number} من ${total} · أسر: ${sheet.groupCount} · أسماء جديدة: ${sheet.personIds.length} · ${n(sheet.physicalLabelPt)} نقطة`
      : `صفحة ${sheet.number} من ${total} · فهرس الأشخاص · الإحالات إلى صفحات الأسر`;
    const metadata = (box.scope.kind === 'branch' ? `فرع · ${box.scope.people} شخصاً · الجيل الأصلي ${box.scope.rootGeneration+1} · ` : '') + pageMetadata;
    const lines = wrap(metadata, width, metaFont, meter), lineHeight = metaFont * 1.15;
    if (titleFont + .8 + lines.length * lineHeight > HEADER_MM - 1) fail('بيانات ترويسة الصفحة لا تتسع؛ كبّر عرض الورق', 'PRINT_DOCUMENT_CAPACITY');
    const center = paper.widthMm / 2;
    return `<g fill="#27382e" direction="rtl" text-anchor="middle"><text x="${n(center)}" y="${n(margin+titleFont)}" font-size="${n(titleFont)}"><title>${esc(fullTitle)}</title>${esc(title)}</text>${lines.map((line,i)=>`<text x="${n(center)}" y="${n(margin+titleFont+.8+(i+1)*lineHeight)}" font-size="${n(metaFont)}">${esc(line)}</text>`).join('')}</g>`;
  }

  function pages(doc, book, measure) {
    const box = validateBook(doc, book), {paper,area,margin} = box, meter = metrics(measure);
    const sheets = book.pages.map(page => {
      const parsed = safeFamilyMarkup(page.markup), familyFont = doc.presentation.template === 'heritage-simple' ? 22 : 18;
      const physicalLabelPt = familyFont * Math.min(area.width / parsed.width, area.height / parsed.height) / PT_MM;
      if (physicalLabelPt + 1e-6 < Math.max(8, book.minLabelPt)) fail('خط صفحة الأسرة أصغر من الحد المختار');
      const generationSizes = [...page.markup.matchAll(/class="print-generation"[^>]*font-size="([\d.]+)"/g)].map(match => Number(match[1]));
      if (book.minGenerationPt !== undefined && generationSizes.length !== (page.groups || []).reduce((sum,group) => sum + group.personIds.length,0)) fail('أرقام الأجيال غير مكتملة في صفحة الأسرة');
      const physicalGenerationPt = Math.min(...(generationSizes.length ? generationSizes : [10])) * Math.min(area.width / parsed.width, area.height / parsed.height) / PT_MM;
      if (book.minGenerationPt !== undefined && physicalGenerationPt + 1e-6 < book.minGenerationPt) fail('رقم الجيل أصغر من الحد المختار');
      for (const group of page.groups || []) if (![group.x,group.y,group.width,group.height].every(Number.isFinite) || group.x < 0 || group.y < 0 || group.x + group.width > parsed.width + 1e-6 || group.y + group.height > parsed.height + 1e-6) fail('مجموعة الأسرة تتجاوز حدود الصفحة');
      const root = parsed.root.replace(/\s(?:x|y|width|height)="[^"]*"/g, '');
      const nested = root.replace('<svg', `<svg x="${n(margin)}" y="${n(margin+HEADER_MM)}" width="${n(area.width)}" height="${n(area.height)}"`) + page.markup.slice(parsed.root.length);
      return {kind:'family',number:page.number,widthMm:paper.widthMm,heightMm:paper.heightMm,personIds:page.personIds.slice(),contextPersonIds:(page.contextPersonIds||[]).slice(),physicalLabelPt:n(physicalLabelPt),physicalGenerationPt:n(physicalGenerationPt),contentBounds:{x:margin,y:margin+HEADER_MM,width:area.width,height:area.height},groupCount:(page.groups||[]).length,body:nested};
    });
    const fontPt = Math.max(8, book.minLabelPt), fontMm = fontPt * PT_MM, lineHeight = fontMm * 1.25;
    const width = paper.widthMm - 2 * margin, bottom = paper.heightMm - margin, top = margin + HEADER_MM;
    const columns = 1, gutter = 0, colWidth = width;
    const padding = 1.5, verticalPadding = .5, textWidth = colWidth - 2 * padding;
    if (textWidth <= 0) fail('عرض الفهرس غير كافٍ', 'PRINT_DOCUMENT_CAPACITY');
    let sheet, column = 0, y = top;
    const newSheet = () => {
      if (sheets.length >= MAX_PAGES) fail('دفتر الأسر والفهرس يتجاوزان حد 100 صفحة', 'PRINT_DOCUMENT_CAPACITY');
      sheet = {kind:'index',number:sheets.length+1,widthMm:paper.widthMm,heightMm:paper.heightMm,personIds:[],rows:[],fontPt,fontMm:n(fontMm),columns,measurement:meter.method,body:''};
      sheets.push(sheet); column = 0; y = top;
    };
    if (book.index.length) newSheet();
    for (const person of book.index) {
      const record = P?.indexRecord ? P.indexRecord(person) : `${person.name} — الأب: ${person.parent} · الجيل ${person.generation+1} · صفحة الأسرة ${person.page}`;
      const content = wrap(record,textWidth,fontMm,meter).map(text=>({field:'record',text}));
      const height = content.length * lineHeight + 2 * verticalPadding;
      if (height > bottom - top + 1e-7) fail('اسم كامل أو بيانات أب لا تتسع في صف فهرس واحد؛ كبّر الورق', 'PRINT_DOCUMENT_CAPACITY');
      if (y + height > bottom + 1e-7) { column++; y = top; if (column >= columns) newSheet(); }
      const x = paper.widthMm - margin - (column+1)*colWidth - column*gutter;
      const lines = content.map((line,i) => ({...line,x:n(x+colWidth/2),y:n(y+verticalPadding+fontMm+i*lineHeight),widthMm:n(meter.width(line.text,fontMm)),heightMm:n(fontMm)}));
      const row = {personId:person.personId,name:person.name,parent:person.parent,generation:person.generation,familyPage:person.page,record,fontPt,fontMm:n(fontMm),column,bounds:{x:n(x),y:n(y),width:n(colWidth),height:n(height)},lines};
      sheet.personIds.push(person.personId); sheet.rows.push(row);
      sheet.body += `<g data-person-id="${esc(person.personId)}" data-family-page="${person.page}"><title>${esc(person.name)} — ${esc(person.parent)}</title><rect x="${n(x)}" y="${n(y)}" width="${n(colWidth)}" height="${n(height)}" fill="${sheet.rows.length%2?'#f5f0e2':'#faf5e8'}"/>${lines.map(line=>`<text x="${line.x}" y="${line.y}" font-size="${n(fontMm)}" fill="#27382e" direction="rtl" text-anchor="middle" xml:space="preserve">${esc(line.text)}</text>`).join('')}</g>`;
      y += height + .25;
    }
    const total = sheets.length;
    return sheets.map(sheet => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(paper.widthMm)} ${n(paper.heightMm)}" width="${n(paper.widthMm)}mm" height="${n(paper.heightMm)}mm" lang="ar" direction="rtl" style="font-family:Tahoma,Arial,sans-serif"><rect width="${n(paper.widthMm)}" height="${n(paper.heightMm)}" fill="#faf5e8"/>${header(doc,sheet,total,box,meter)}${sheet.body}</svg>`;
      const {body,...descriptor} = sheet;
      return {...descriptor,svg};
    });
  }

  const api = {pages,validateBook,limits:{maxPages:MAX_PAGES,maxPaperMm:MAX_PAPER_MM},headerMm:HEADER_MM};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else scope.TreePrintDocument = api;
})(globalThis);
