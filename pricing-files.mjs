import {csv,MAX_UPLOAD} from './pricing-import.mjs?v=20261005-sheet';
import {plainTemplateHeader} from './pricing-template.mjs?v=20261005-sheet';
import {unzipSync} from './vendor/fflate.mjs';
import {QUANTITIES,TIERS,SUPPORTED_TIERS,tierLabel,createMatrix,prepareEditorUpdate,cards} from './pricing-editor.mjs?v=20261005-sheet';
export const HEADERS=['SKU','Card Product Name','Price Type',...QUANTITIES.map(q=>`QTY ${q.toLocaleString('en-US')}`)];
export const TEMPLATE_ROWS=TIERS.map(tier=>['','',tierLabel(tier),...QUANTITIES.map(()=>'')]);
const MAX_EXPANDED=15*1024*1024,MAX_ROWS=20000;
const fail=message=>{throw new Error(message);};
const extension=name=>name.toLowerCase().split('.').pop();
const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);

// Bound decompression before opening an upload ZIP or XLSX container.
function inspectZip(raw,maxEntries=128){
 const v=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);let end=-1;
 for(let p=raw.length-22;p>=Math.max(0,raw.length-65557);p--)if(v.getUint32(p,true)===0x06054b50&&p+22+v.getUint16(p+20,true)===raw.length){end=p;break;}
 if(end<0)fail('Invalid ZIP file.');
 const count=v.getUint16(end+10,true),start=v.getUint32(end+16,true);let p=start,total=0;const seen=new Set();
 if(v.getUint16(end+4,true)||v.getUint16(end+6,true)||count>maxEntries||count!==v.getUint16(end+8,true)||p+v.getUint32(end+12,true)!==end)fail('Unsupported or oversized ZIP directory.');
 for(let n=0;n<count;n++){
  if(p+46>end||v.getUint32(p,true)!==0x02014b50)fail('Invalid ZIP entry.');
  const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),size=v.getUint32(p+24,true),packed=v.getUint32(p+20,true),nl=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true),offset=v.getUint32(p+42,true);
  if(p+46+nl+extra+comment>end)fail('Invalid ZIP entry length.');
  const name=decode(raw.subarray(p+46,p+46+nl));total+=size;
  if(total>MAX_EXPANDED||packed>MAX_UPLOAD)fail('ZIP expands beyond the 15 MB limit.');
  if(flags&1||![0,8].includes(method)||((v.getUint32(p+38,true)>>>16)&0xf000)===0xa000)fail('Encrypted files, links and unsupported ZIP compression are not accepted.');
  if(!name||/[\\\x00-\x1f]/.test(name)||name.startsWith('/')||name.split('/').some(part=>part==='..'||part==='.')||seen.has(name.toLowerCase()))fail('ZIP contains an unsafe or duplicate filename.');
  seen.add(name.toLowerCase());
  if(offset+30>start||v.getUint32(offset,true)!==0x04034b50)fail('Invalid local ZIP entry.');
  const localLen=v.getUint16(offset+26,true),localExtra=v.getUint16(offset+28,true);
  if(decode(raw.subarray(offset+30,offset+30+localLen))!==name||v.getUint16(offset+8,true)!==method||v.getUint16(offset+6,true)&1||offset+30+localLen+localExtra+packed>start)fail('Inconsistent ZIP entry.');
  p+=46+nl+extra+comment;
 }
 if(p!==end)fail('Invalid ZIP directory.');return total;
}

function parseTable(table,label){
 const headers=(table.shift()||[]).map(plainTemplateHeader);
 for(const header of HEADERS)if(!headers.includes(header))fail(`${label}: missing required column "${header}". Download the current template and keep its headers unchanged.`);
 if(headers.length!==HEADERS.length||headers.some((h,i)=>h!==HEADERS[i]))fail(`${label}: columns must exactly match the template names and order. Only SKU, Card Product Name, Price Type and the eight quantity columns are accepted.`);
 if(table.length>MAX_ROWS)fail(`${label}: maximum 20,000 pricing rows.`);
 return table.flatMap((values,i)=>{
  if(values.every(v=>v===null||v===undefined||String(v).trim()===''))return [];
  const row=`${label}, row ${i+2}`;
  if(values.length>HEADERS.length)fail(`${row}: too many columns. Use the current template.`);
  const fields=HEADERS.map((_,j)=>String(values[j]??'').trim()),[sku,product,type]=fields;
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(sku))fail(`${row}: SKU is required; use letters, numbers, dots, underscores or hyphens (maximum 64 characters).`);
  if(!product||product.length>300||/[\x00-\x1f]/.test(product))fail(`${row}: Card Product Name is required (1–300 characters).`);
  const tier=SUPPORTED_TIERS.find(t=>tierLabel(t)===type);
  if(!tier)fail(`${row}: Price Type must be a supported EMEA price type.`);
  const prices=fields.slice(3).map((value,j)=>{
   if(value==='')return null;
   if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)||!Number.isFinite(Number(value))||Number(value)>1e12)fail(`${row}, ${HEADERS[j+3]}: enter a numeric, non-negative price without currency symbols or commas.`);
   return Number(value);
  });
  return [{sku,product,tier,prices,label:row}];
 });
}

function parseFile(bytes,name,xlsx){
 const ext=extension(name);
 if(ext==='csv')return parseTable(csv(decode(bytes)),name);
 if(!['xlsx','xls'].includes(ext))fail(`${name}: unsupported file type. Choose CSV, XLSX, XLS or ZIP.`);
 if(!xlsx)fail('The Excel reader could not load. Reload the page or upload a CSV file.');
 if(ext==='xlsx')inspectZip(bytes,1024);
 else if(![0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((v,i)=>bytes[i]===v))fail(`${name}: this is not an Excel .xls workbook. Save it as Excel .xlsx or CSV and try again.`);
 let book;try{book=xlsx.read(bytes,{type:'array',cellFormula:true,cellHTML:false,cellStyles:false,sheetRows:MAX_ROWS+2});}catch{fail(`${name}: cannot read this Excel workbook. Use an unencrypted .xlsx or .xls file.`);}
 const rows=[];
 for(const sheetName of book.SheetNames){
  const sheet=book.Sheets[sheetName];if(!sheet['!ref'])continue;
  const range=xlsx.utils.decode_range(sheet['!fullref']||sheet['!ref']);
  if(range.e.r>MAX_ROWS||range.e.c>=HEADERS.length)fail(`${name} / ${sheetName}: too many rows or columns. Use only the template table.`);
  const matrix=[];
  for(let r=0;r<=range.e.r;r++){
   const values=[];
   for(let c=0;c<HEADERS.length;c++){
    const address=xlsx.utils.encode_cell({r,c}),cell=sheet[address];
    if(cell?.f||cell?.F)fail(`${name} / ${sheetName}, ${address}: formulas are not accepted. Paste values only.`);
    if(cell&&['e','b','d'].includes(cell.t))fail(`${name} / ${sheetName}, ${address}: use text headers and numeric prices.`);
    values.push(cell?.v??'');
   }
   matrix.push(values);
  }
  if(matrix.every(row=>row.every(v=>v==='')))continue;
  rows.push(...parseTable(matrix,`${name} / ${sheetName}`));
 }
 return rows;
}

export async function readPricingFiles(selected,{xlsx=globalThis.XLSX}={}){
 const files=Array.from(selected||[]);
 if(!files.length)fail('Choose a CSV, Excel (.xlsx or .xls), or ZIP pricing file.');
 if(files.length>32||files.some(f=>!Number.isFinite(f.size)||f.size<0)||files.reduce((sum,f)=>sum+f.size,0)>MAX_UPLOAD)fail('Choose pricing files no larger than 5 MB in total (maximum 32 files).');
 let rows=[],expanded=0;
 for(const file of files){
  const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.length>MAX_UPLOAD)fail('Pricing files must be no larger than 5 MB.');
  try{
   if(extension(file.name)==='zip'){
    expanded+=inspectZip(bytes);const entries=unzipSync(bytes);let count=0;
    for(const [name,data] of Object.entries(entries)){
     if(name.endsWith('/')||name.startsWith('__MACOSX/')||name.split('/').pop()==='.DS_Store'||/^README(?:\.txt)?$/i.test(name))continue;
     if(!['csv','xlsx','xls'].includes(extension(name)))fail(`${name}: ZIP may contain only CSV, XLSX or XLS pricing files and an optional README.txt.`);
     if(extension(name)==='xlsx')expanded+=inspectZip(data,1024);
     if(expanded>MAX_EXPANDED)fail('Combined pricing files expand beyond the 15 MB limit.');
     rows.push(...parseFile(data,name,xlsx));count++;
    }
    if(!count)fail('ZIP contains no pricing files. Include at least one CSV, XLSX or XLS file using the template.');
   }else{
    expanded+=extension(file.name)==='xlsx'?inspectZip(bytes,1024):bytes.length;
    if(expanded>MAX_EXPANDED)fail('Combined pricing files expand beyond the 15 MB limit.');
    rows.push(...parseFile(bytes,file.name,xlsx));
   }
  }catch(error){throw new Error(`${file.name}: ${error.message}`);}
  if(rows.length>MAX_ROWS)fail('Maximum 20,000 pricing rows per upload.');
 }
 if(!rows.length||!rows.some(row=>row.prices.some(value=>value!==null)))fail('No selling prices found. Fill in the template before uploading.');
 const seen=new Set(),names=new Map();
 for(const row of rows){
  const key=`${row.sku.toLowerCase()}|${row.tier}`,name=names.get(row.sku.toLowerCase());
  if(seen.has(key))fail(`${row.label}: duplicate SKU and Price Type. Include each card/price type only once across all files and sheets.`);
  if(name&&(name.sku!==row.sku||name.product!==row.product))fail(`${row.label}: use the same SKU spelling and Card Product Name in every row for this card.`);
  seen.add(key);names.set(row.sku.toLowerCase(),row);
 }
 return rows;
}

// Reuse the direct editor's quantity/cost handling and calculations.
export function prepareSellingUpdate(incoming,current,date=new Date().toISOString().slice(0,10)){
 let data=JSON.parse(JSON.stringify(current));const products=[...new Set(incoming.map(r=>r.sku))],warnings=[];
 for(const sku of products){
  const rows=incoming.filter(r=>r.sku===sku),product=rows[0].product;
  const existing=cards(data).find(c=>c.sku.toLowerCase()===sku.toLowerCase());
  if(existing&&existing.sku!==sku)fail(`${sku}: use the existing SKU spelling "${existing.sku}".`);
  if(!existing&&data.costBands.some(c=>c.sku.toLowerCase()===sku.toLowerCase()&&c.sku!==sku))fail(`${sku}: SKU spelling does not match existing cost data.`);
  if(!rows.some(r=>r.prices.some(p=>p!==null))){warnings.push(`${sku}: no prices entered; this card is unchanged.`);continue;}
  if(data.cards)data.cards=data.cards.map(c=>c.sku===sku?{...c,product}:c);
  if(!existing)data.cards=[...(data.cards||cards(data)),{sku,product}];
  data.rows=data.rows.map(r=>r.sku===sku?{...r,product}:r);
  const matrix=createMatrix(data,sku,false,rows.map(r=>r.tier));
  for(const row of rows)for(const segment of matrix.find(r=>r.tier===row.tier).cells.flat()){
   const column=QUANTITIES.findLastIndex(q=>(q||1)<=segment.min),value=row.prices[column];
   if(value!==null)segment.value=String(value);
  }
  try{data=prepareEditorUpdate(data,{sku,product,matrix},date).data;}catch(error){if(error.message!=='No prices changed.')throw error;}
 }
 data.generatedAt=date;
 if(new TextEncoder().encode(JSON.stringify(data)).length>1000000)fail('Updated pricing exceeds 1 MB. Split into smaller per-SKU updates.');
 const previewRows=incoming.flatMap(input=>data.rows.filter(r=>r.sku===input.sku&&r.tier===input.tier&&input.prices[QUANTITIES.findLastIndex(q=>(q||1)<=r.quantityMin)]!==null).sort((a,b)=>a.quantityMin-b.quantityMin));
 for(const sku of products)if(previewRows.some(r=>r.sku===sku&&!Number.isFinite(r.costPrice)))warnings.push(`${sku}: existing costs are unavailable for some quantities; those margins remain unavailable.`);
 return {data,previewRows,products,sellingRecords:incoming.length,costRecords:0,warnings,removedProducts:[],operation:{kind:'upload',date,rows:incoming}};
}
