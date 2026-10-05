import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {readPricingFiles,prepareSellingUpdate,HEADERS,TEMPLATE_ROWS} from '../pricing-files.mjs';
import {TIERS,QUANTITIES,tierLabel,cards} from '../pricing-editor.mjs';
import {csv} from '../pricing-import.mjs';
import {zipSync,unzipSync,strToU8} from '../vendor/fflate.mjs';
const xlsx=createRequire(import.meta.url)('../vendor/xlsx.full.min.js');
export const file=(name,bytes)=>({name,size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
const encode=rows=>strToU8(rows.map(row=>row.map(v=>JSON.stringify(String(v??''))).join(',')).join('\n'));
export const fixture=()=>encode([HEADERS,...TIERS.map(t=>['CTC-007','Custom Card',tierLabel(t),.46,.43,.379,.27,.255,.246,.246,.246])]);
const plain=await readPricingFiles([file('prices.csv',fixture())]);
const clean=rows=>rows.map(({label,...r})=>r);
function excel(matrix,bookType='xlsx',modify=()=>{}){
 const book=xlsx.utils.book_new(),sheet=xlsx.utils.aoa_to_sheet(matrix);modify(sheet);xlsx.utils.book_append_sheet(book,sheet,'Prices');
 return new Uint8Array(xlsx.write(book,{type:'buffer',bookType}));
}
const matrix=csv(new TextDecoder().decode(fixture()));
for(const ext of ['xlsx','xls']){
 const bytes=excel(matrix,ext);
 assert.deepEqual(clean(await readPricingFiles([file('prices.'+ext,bytes)],{xlsx})),clean(plain));
 assert.deepEqual(clean(await readPricingFiles([file('prices.zip',zipSync({['prices.'+ext]:bytes}))],{xlsx})),clean(plain));
}
const mixed=zipSync({'a.csv':encode(matrix.slice(0,3)),'b.xlsx':excel([HEADERS,...matrix.slice(3)])});
assert.deepEqual(clean(await readPricingFiles([file('mixed.zip',mixed)],{xlsx})),clean(plain));
assert.deepEqual(clean(await readPricingFiles([file('a.csv',encode(matrix.slice(0,3))),file('b.csv',encode([HEADERS,...matrix.slice(3)]))])),clean(plain));
const reject=(name,bytes,pattern)=>assert.rejects(readPricingFiles([file(name,bytes)],{xlsx}),pattern);
await reject('missing.csv',encode([HEADERS.slice(1),...matrix.slice(1)]),/missing required column "SKU"/);
await reject('extra.csv',encode([[...HEADERS,'cost'],...matrix.slice(1)]),/exactly match/);
await reject('wrong.csv',encode([[HEADERS[1],HEADERS[0],...HEADERS.slice(2)],...matrix.slice(1)]),/exactly match/);
await reject('negative.csv',encode([HEADERS,[...matrix[1].slice(0,3),-1,...matrix[1].slice(4)]]),/non-negative/);
await reject('text.csv',encode([HEADERS,[...matrix[1].slice(0,3),'abc',...matrix[1].slice(4)]]),/non-negative/);
await reject('type.csv',encode([HEADERS,['CTC-007','Card','Wrong',1]]),/Price Type/);
await reject('blank.csv',encode([HEADERS,['CTC-007','Card',tierLabel(TIERS[0])]]),/No selling prices/);
await reject('formula.xlsx',excel(matrix,'xlsx',s=>{s.D2={t:'n',v:.46,f:'1-0.54'};}),/formulas are not accepted/);
await reject('bad.xls',fixture(),/not an Excel/);
await reject('bad.xlsx',fixture(),/Invalid ZIP/);
await reject('bad.txt',fixture(),/unsupported file type/);
await assert.rejects(readPricingFiles([file('empty.zip',zipSync({'README.txt':strToU8('Test')}))]),/no pricing files/);
await reject('nested.zip',zipSync({'prices.zip':mixed}),/only CSV/);
await reject('unsafe.zip',zipSync({'../prices.csv':fixture()}),/unsafe/);
await reject('duplicate.zip',zipSync({'a.csv':fixture(),'b.csv':fixture()}),/duplicate SKU/);
await reject('quote.csv',strToU8('"unclosed'),/unclosed/);
await assert.rejects(readPricingFiles([]),/Choose/);
await assert.rejects(readPricingFiles([{name:'large.csv',size:6*1024*1024}]),/5 MB/);
const current=JSON.parse(fs.readFileSync('pricing-data.json')),before=JSON.stringify(current);
const result=prepareSellingUpdate(plain,current,'2026-10-05');
assert.equal(JSON.stringify(current),before,'Source remains untouched until publication');
assert.deepEqual(result.data.costBands,current.costBands,'All cost records preserved');
assert.deepEqual(result.data.rows.filter(r=>r.sku!=='CTC-007'),current.rows.filter(r=>r.sku!=='CTC-007'));
for(const qty of [1,4999,5000,9999,10000,24999,25000,50000,100000,250000,500000,700000,1000000]){
 for(const tier of TIERS){
  const row=result.data.rows.find(r=>r.sku==='CTC-007'&&r.tier===tier&&r.quantityMin<=qty&&(r.quantityMax===null||qty<=r.quantityMax));
  assert.ok(row);assert.equal(row.sellingPrice,plain.find(r=>r.tier===tier).prices[QUANTITIES.findLastIndex(q=>(q||1)<=qty)]);
  const original=current.rows.find(r=>r.sku==='CTC-007'&&r.tier===tier&&r.quantityMin<=qty&&(r.quantityMax===null||qty<=r.quantityMax));
  if(original)assert.equal(row.costPrice,original.costPrice);
  if(Number.isFinite(row.costPrice)&&row.sellingPrice!==original?.sellingPrice){assert.equal(row.grossProfit,row.sellingPrice-row.costPrice);assert.equal(row.marginPercent,row.grossProfit/row.sellingPrice);}
 }
}
const partial=await readPricingFiles([file('partial.csv',encode([HEADERS,['CTC-007','Custom Card',tierLabel(TIERS[0]),0]]))]);
const partialResult=prepareSellingUpdate(partial,current).data;
assert.equal(partialResult.rows.find(r=>r.sku==='CTC-007'&&r.tier===TIERS[0]&&r.quantityMin===1).sellingPrice,0);
assert.deepEqual(partialResult.rows.filter(r=>r.sku==='CTC-007'&&r.tier!==TIERS[0]).map(r=>({...r,product:''})),current.rows.filter(r=>r.sku==='CTC-007'&&r.tier!==TIERS[0]).map(r=>({...r,product:''})));
const fresh=plain.map(r=>({...r,sku:'TEST-NEW',product:'New Card'}));
const added=prepareSellingUpdate(fresh,current).data;
assert.ok(cards(added).some(c=>c.sku==='TEST-NEW'));
assert.equal(added.rows.filter(r=>r.sku==='TEST-NEW').length,32);
assert.ok(added.rows.filter(r=>r.sku==='TEST-NEW').every(r=>r.costPrice===null&&r.marginPercent===null));
const contents=unzipSync(fs.readFileSync('pricing-upload-template.zip'));
assert.deepEqual(Object.keys(contents).sort(),['README.txt','selling.csv']);
const expected=[HEADERS,...TEMPLATE_ROWS];
assert.deepEqual(csv(new TextDecoder().decode(contents['selling.csv'])),expected);
assert.deepEqual(contents['selling.csv'],new Uint8Array(fs.readFileSync('pricing-upload-template.csv')));
const workbook=xlsx.read(fs.readFileSync('pricing-upload-template.xlsx'));
assert.deepEqual(xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{header:1,defval:''}),expected);
const html=fs.readFileSync('admin.html','utf8'),preview=html.slice(html.indexOf('id="templatePreview"'),html.indexOf('id="validateButton"'));
const previewMatrix=[...preview.matchAll(/<tr>(.*?)<\/tr>/gs)].map(match=>[...match[1].matchAll(/<t[hd](?: scope="col")?>(.*?)<\/t[hd]>/gs)].map(cell=>cell[1]));
assert.deepEqual(previewMatrix,expected,'Popover exactly matches CSV, Excel and ZIP');
assert.match(html,/accept="\.csv,\.xlsx,\.xls,\.zip/);
console.log('CSV/XLSX/XLS/ZIP parity, strict validation, template parity, cost preservation, quantity boundaries and new-card import passed.');
