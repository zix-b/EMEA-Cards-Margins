import {unzipSync} from './vendor/fflate.mjs';
export const BASES=['oppiot','supplier_purchase','average_cost','last_purchase'];
export const TIERS=['Standard Price (EMEA License)','Base Price (EMEA Premium)','Distributor Price (EMEA)','EMEA Strategic Account (Magic Planet)'];
const SELL=['sku','product','tier','quantityMin','quantityMax','sellingPrice','currency','unit','source','sourceDate'];
const COST=['sku','quantityMin','quantityMax','costPrice','costBasis','currency','unit','source','sourceDate'];
export const MAX_UPLOAD=5*1024*1024;
const fail=message=>{throw new Error(message);};
export function csv(text){
 text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],field='',quoted=false,closed=false;
 for(let i=0;i<=text.length;i++){
  const c=text[i];
  if(quoted){if(c===undefined)fail('CSV has an unclosed quoted field.');if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
  if(c==='"'){if(field||closed)fail('Invalid CSV quoting.');quoted=true;continue;}
  if(c===','||c==='\n'||c==='\r'||c===undefined){row.push(field);field='';closed=false;if(c!==','){if(row.some(v=>v!==''))rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}continue;}
  if(closed)fail('Unexpected text after CSV quote.');field+=c;
 }
 return rows;
}
const clean=(v,label)=>{v=String(v||'').trim();if(!v||v.length>300||/[\x00-\x1f]/.test(v))fail(`${label}: expected text of 1–300 characters.`);return v;};
const number=(v,label,integer=false,positive=false)=>{v=String(v).trim();if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(v))fail(`${label}: use plain numbers.`);const n=Number(v);if(!Number.isFinite(n)||n>1e12||n<0||(positive&&n===0)||(integer&&!Number.isSafeInteger(n)))fail(`${label}: invalid number.`);return n;};
function records(bytes,name){
 let lines;try{lines=csv(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch(e){fail(`${name}: ${e.message}`);}
 const headers=lines.shift()||[],fields=name==='selling.csv'?SELL:COST;
 for(const f of fields)if(!headers.includes(f))fail(`${name}: missing required column "${f}". Use the template headers exactly.`);
 if(new Set(headers).size!==headers.length)fail(`${name}: duplicate column headings. Each header must appear once.`);
 if(lines.length>20000)fail(`${name}: maximum 20,000 records.`);
 return lines.map((cells,i)=>{
  const label=`${name} line ${i+2}`;if(cells.length!==headers.length)fail(`${label}: incorrect column count.`);
  const r=Object.fromEntries(headers.map((h,j)=>[h,cells[j].trim()]));
  const out={sku:clean(r.sku,label),source:clean(r.source,label),quantityMin:number(r.quantityMin,label,true,true),quantityMax:r.quantityMax?number(r.quantityMax,label,true,true):null,sourceDate:r.sourceDate,currency:'USD',unit:'Each'};
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(out.sku))fail(`${label}: invalid SKU.`);
  if(out.quantityMax!==null&&out.quantityMax<out.quantityMin)fail(`${label}: maximum below minimum.`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.sourceDate)||!Number.isFinite(Date.parse(r.sourceDate))||new Date(r.sourceDate).toISOString().slice(0,10)!==r.sourceDate)fail(`${label}: date must be YYYY-MM-DD.`);
  if(r.currency.toUpperCase()!=='USD'||!['each','ea'].includes(r.unit.toLowerCase()))fail(`${label}: only USD per Each is supported.`);
  if(name==='selling.csv'){
   out.product=clean(r.product,label);out.tier=r.tier==='EMEA Strategic Account (MAF)'?TIERS[3]:r.tier;
   if(!TIERS.includes(out.tier))fail(`${label}: map the price level to one of the four EMEA price types.`);
   out.sellingPrice=number(r.sellingPrice,label,false,true);out.quantityLabel=out.quantityMax===null?`${out.quantityMin.toLocaleString('en-US')}+`:`${out.quantityMin.toLocaleString('en-US')}–${out.quantityMax.toLocaleString('en-US')}`;
  }else{out.costBasis=r.costBasis;if(!BASES.includes(out.costBasis))fail(`${label}: unsupported cost basis.`);out.costPrice=number(r.costPrice,label);}
  return out;
 });
}
function conflicts(rows){const groups=new Map();for(const r of rows){const key=JSON.stringify([r.sku,r.tier||r.costBasis,r.sourceDate]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}for(const group of groups.values()){let max=-1;for(const r of group.sort((a,b)=>a.quantityMin-b.quantityMin)){if(r.quantityMin<=max)fail(`${r.sku}: duplicate or overlapping bands on the same date.`);max=r.quantityMax??Infinity;}}}
export function readZip(raw,today=new Date().toISOString().slice(0,10)){
 if(!raw.length||raw.length>MAX_UPLOAD)fail('ZIP must be nonempty and no larger than 5 MB.');
 // Bound allocations before decompression; central directory is the size authority used by fflate.
 const v=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);let eocd=-1;
 for(let p=raw.length-22;p>=Math.max(0,raw.length-65557);p--)if(v.getUint32(p,true)===0x06054b50&&p+22+v.getUint16(p+20,true)===raw.length){eocd=p;break;}
 if(eocd<0||v.getUint16(eocd+4,true)||v.getUint16(eocd+6,true))fail('Invalid or multi-volume ZIP.');
 const count=v.getUint16(eocd+10,true);let p=v.getUint32(eocd+16,true),total=0;const seen=new Set();
 if(count>12||count!==v.getUint16(eocd+8,true)||p+v.getUint32(eocd+12,true)!==eocd)fail('Unsupported ZIP directory.');
 for(let n=0;n<count;n++){
  if(p+46>eocd||v.getUint32(p,true)!==0x02014b50)fail('Invalid ZIP entry.');
  const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),size=v.getUint32(p+24,true),packed=v.getUint32(p+20,true),nl=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true),offset=v.getUint32(p+42,true);
  const name=new TextDecoder('utf-8',{fatal:true}).decode(raw.subarray(p+46,p+46+nl));
  total+=size;if(total>15*1024*1024||packed>MAX_UPLOAD)fail('ZIP expands beyond 15 MB.');
  if(flags&1||![0,8].includes(method)||((v.getUint32(p+38,true)>>>16)&0xf000)===0xa000)fail('Encrypted entries, links or unsupported compression.');
  if(!['selling.csv','costs.csv','README.txt'].includes(name)||seen.has(name))fail('ZIP must contain unique selling.csv, costs.csv and optional README.txt at its root.');seen.add(name);
  if(offset+30>raw.length||v.getUint32(offset,true)!==0x04034b50)fail('Invalid local ZIP entry.');
  const localLen=v.getUint16(offset+26,true),localExtra=v.getUint16(offset+28,true),localName=new TextDecoder().decode(raw.subarray(offset+30,offset+30+localLen));
  if(localName!==name||v.getUint16(offset+8,true)!==method||offset+30+localLen+localExtra+packed>v.getUint32(eocd+16,true))fail('Inconsistent ZIP entry.');
  p+=46+nl+extra+comment;
 }
 if(p!==eocd)fail('Invalid ZIP directory.');
 for(const f of ['selling.csv','costs.csv'])if(!seen.has(f))fail(`Missing required file: ${f}. Include it at the ZIP root; costs.csv may be header-only.`);
 const files=unzipSync(raw),rows=records(files['selling.csv'],'selling.csv'),costBands=records(files['costs.csv'],'costs.csv');
 if(!rows.length)fail('Supply at least one selling price.');const names=new Map();
 for(const r of rows){if(names.has(r.sku)&&names.get(r.sku)!==r.product)fail(`${r.sku}: inconsistent product descriptions.`);names.set(r.sku,r.product);}
 if(costBands.some(c=>!names.has(c.sku)))fail('Every cost SKU must also have a selling record.');conflicts(rows);conflicts(costBands);
 const data={rows,costBands,generatedAt:today,historical:false,note:'Admin-imported data. Accuracy depends on the supplied source files.'};
 if(new TextEncoder().encode(JSON.stringify(data)).length>1000000)fail('Normalized pricing exceeds 1 MB. Split into smaller per-SKU updates.');return data;
}

// Uploads are current snapshots. The original calculator does not schedule dated prices.
export function prepareUpdate(incoming,current,{mode,basis},today=new Date().toISOString().slice(0,10)) {
 if(!['merge','replace'].includes(mode)||!BASES.includes(basis))fail('Choose the upload behavior and approved cost basis.');
 if(incoming.costBands.some(c=>c.costBasis!==basis))fail(`costs.csv: costBasis must match the approved setting (${basis}).`);
 if([...incoming.rows,...incoming.costBands].some(r=>r.sourceDate>today))fail('Future-dated prices cannot be published. Upload a current pricing snapshot.');
 // Avoid changing the original first-match lookup: require one unambiguous current schedule.
 conflicts(incoming.rows.map(r=>({...r,sourceDate:'current snapshot'})));
 conflicts(incoming.costBands.map(r=>({...r,sourceDate:'current snapshot'})));
 const skus=new Set(incoming.rows.map(r=>r.sku)),warnings=[];
 const rows=[];
 for(const r of incoming.rows){
  const costs=incoming.costBands.filter(c=>c.sku===r.sku);
  const high=r.quantityMax??Infinity;
  const cuts=new Set([r.quantityMin]);
  for(const c of costs){if(c.quantityMin>r.quantityMin&&c.quantityMin<=high)cuts.add(c.quantityMin);if(c.quantityMax!==null&&c.quantityMax>=r.quantityMin&&c.quantityMax<high)cuts.add(c.quantityMax+1);}
  const bounds=[...cuts].sort((a,b)=>a-b);
  bounds.forEach((lo,i)=>{const hi=i+1<bounds.length?bounds[i+1]-1:r.quantityMax;const cost=costs.find(c=>lo>=c.quantityMin&&(c.quantityMax===null||lo<=c.quantityMax));const costPrice=cost?.costPrice??null;const grossProfit=costPrice===null?null:r.sellingPrice-costPrice;
   rows.push({...r,quantityMin:lo,quantityMax:hi,quantityLabel:hi===null?`${lo.toLocaleString('en-US')}+`:`${lo.toLocaleString('en-US')}-${hi.toLocaleString('en-US')}`,costPrice,grossProfit,marginPercent:grossProfit===null?null:grossProfit/r.sellingPrice,vendor:cost?.source||'',category:'Admin pricing upload'});
  });
 }
 for(const sku of skus)if(rows.some(r=>r.sku===sku&&r.costPrice===null))warnings.push(`${sku}: some quantities have no cost; their margins will be unavailable.`);
 const removedProducts=mode==='replace'?[...new Set(current.rows.map(r=>r.sku))].filter(s=>!skus.has(s)):[];
 const data={...current,generatedAt:today,rows:[...(mode==='merge'?current.rows.filter(r=>!skus.has(r.sku)):[]),...rows],costBands:[...(mode==='merge'?(current.costBands||[]).filter(r=>!skus.has(r.sku)):[]),...incoming.costBands]};
 if(Array.isArray(current.cards))data.cards=[...new Map([...(mode==='merge'?current.cards.filter(c=>!skus.has(c.sku)):[]),...incoming.rows.map(({sku,product})=>({sku,product}))].map(c=>[c.sku,c])).values()];
 if(data.rows.length>20000||new TextEncoder().encode(JSON.stringify(data)).length>1000000)fail('Combined dataset is too large (maximum 20,000 selling rows and 1 MB).');
 return {data,products:[...skus].sort(),sellingRecords:incoming.rows.length,costRecords:incoming.costBands.length,outputRecords:rows.length,removedProducts,warnings};
}
