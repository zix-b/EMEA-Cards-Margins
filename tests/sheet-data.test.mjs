import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createMatrix,prepareEditorUpdate,SHEET_TIERS} from '../pricing-editor.mjs';
import {readPricingFiles,prepareSellingUpdate,HEADERS} from '../pricing-files.mjs';
// Fixed source fixture: later admin edits must not be blocked by old price assertions.
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/april-2026-pricing-inputs.json'));
const data={rows:[],costBands:[]};
for(const [sku,item] of Object.entries(fixture.items))for(let i=0;i<fixture.bands.length;i++){
 const [quantityMin,quantityMax]=fixture.bands[i],costPrice=item.costs[i];
 if(costPrice!==null)data.costBands.push({sku,quantityMin,quantityMax,costPrice,source:'Cards & Wearables Costing & Margins (14 April 2026) / COGS'});
 for(const [tier,prices] of Object.entries(item.selling))if(prices[i]!==null)data.rows.push({sku,product:item.product,tier,quantityMin,quantityMax,sellingPrice:prices[i],costPrice,source:'Cards & Wearables Costing & Margins (14 April 2026)',sourceDate:'2026-04-14'});
}
const inputs={
 'CTC-011':[[.340,.390,.465],.117],
 'CTC-007':[[.355,.420,.535],.119],
 'CRD-012':[[.160,.310,.395],.056],
 'CTC-024':[[.430,.530,.650],.246],
 'LIC-009':[[.150,.679,.780],0],
 'CTW-009':[[.720,.810,.910],.336],
};
const source='Cards & Wearables Costing & Margins (14 April 2026)';
const rows=data.rows.filter(r=>r.source===source);
assert.equal(rows.length,234);
assert.equal(data.costBands.filter(c=>c.source.startsWith(source)).length,67);
const context=vm.createContext({Intl,document:{querySelector(){return {};}}});
vm.runInContext(fs.readFileSync('app.js','utf8').replace(/try\s*\{\s*boot\(\);[\s\S]*$/,''),context);
context.data=data;vm.runInContext('state.rows=data.rows;state.costBands=data.costBands;',context);
function calculate(sku,tier,qty){context.args={sku,tier,qty};return JSON.parse(vm.runInContext('state.quantity=args.qty;constRow=state.rows.find(r=>r.sku===args.sku&&r.tier===args.tier&&inQuantityRange(r,args.qty));JSON.stringify(constRow?{sell:constRow.sellingPrice,...displayMetrics(constRow)}:null)',context));}
for(const [sku,[prices,cost]] of Object.entries(inputs)){
 for(let i=0;i<3;i++){
  const value=calculate(sku,SHEET_TIERS[i],10000);
  assert.equal(value.sell,prices[i]);assert.equal(value.costPrice,cost);
  assert.equal(value.grossProfit,prices[i]-cost);assert.equal(value.marginPercent,(prices[i]-cost)/prices[i]);
  assert.equal(calculate(sku,SHEET_TIERS[i],19),null);
  assert.ok(calculate(sku,SHEET_TIERS[i],20));
  assert.equal(Boolean(calculate(sku,SHEET_TIERS[i],1500000)),sku==='CTC-011');
 }
 const matrix=createMatrix(data,sku);
 assert.deepEqual(matrix.map(r=>r.tier),sku==='LIC-009'?SHEET_TIERS:SHEET_TIERS.slice(0,3));
 const segment=matrix[0].cells.flat().find(c=>c.min===10000);segment.value=String(prices[0]+.01);
 const product=data.rows.find(r=>r.sku===sku).product;
 const edited=prepareEditorUpdate(data,{sku,product,matrix}).data;
 assert.deepEqual(edited.costBands,data.costBands);
 assert.deepEqual(edited.rows.filter(r=>r.sku!==sku),data.rows.filter(r=>r.sku!==sku));
 assert.equal(edited.rows.find(r=>r.sku===sku&&r.tier===SHEET_TIERS[0]&&r.quantityMin===10000).sellingPrice,prices[0]+.01);
}
for(const [tier,price] of [['EMEA Distributor (BN)',.1],['EMEA Magic Planet',.026],['EMEA VG',.035]])assert.deepEqual(calculate('LIC-009',tier,10000),{sell:price,costPrice:0,grossProfit:price,marginPercent:1});
// All populated cells, inclusive boundaries, zero costs and gaps use the existing calculator.
for(const row of rows)for(const qty of [row.quantityMin,row.quantityMax??2000000]){
 const value=calculate(row.sku,row.tier,qty);assert.equal(value.sell,row.sellingPrice);assert.equal(value.costPrice,row.costPrice);
 assert.equal(value.grossProfit,row.sellingPrice-row.costPrice);
 assert.equal(row.sourceDate,'2026-04-14');
}
// Existing CSV structure can round-trip each sheet tier without relabeling it.
const product=data.rows.find(r=>r.sku==='CTC-007').product;
const text=[HEADERS,...SHEET_TIERS.slice(0,3).map(t=>['CTC-007',product,t,'','',.5])].map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n');
const bytes=new TextEncoder().encode(text);
const incoming=await readPricingFiles([{name:'sheet-tiers.csv',size:bytes.length,arrayBuffer:async()=>bytes.buffer}]);
assert.deepEqual(incoming.map(r=>r.tier),SHEET_TIERS.slice(0,3));
const updated=prepareSellingUpdate(incoming,data).data;
assert.deepEqual(updated.costBands,data.costBands);
assert.equal(updated.rows.find(r=>r.sku==='CTC-007'&&r.tier==='EMEA Premier'&&r.quantityMin===10000).sellingPrice,.5);
console.log('Sheet inputs, all 234 price bands, 67 costs, exact tier names, missing ranges, zero costs, editor and CSV update checks passed.');
