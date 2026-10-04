import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {createMatrix,prepareEditorUpdate,cards,TIERS} from '../pricing-editor.mjs';
const base=JSON.parse(execFileSync('git',['show','c37642af474e266f9ac7a9c5db5a3a3639cbf3ea:pricing-data.json'],{encoding:'utf8'}));
const clone=x=>JSON.parse(JSON.stringify(x));
const original=clone(base),sku='CTC-007',product=cards(base).find(c=>c.sku===sku).product;
const draft=()=>({sku,product,matrix:createMatrix(base,sku)});
let edit=draft();assert.throws(()=>prepareEditorUpdate(base,edit),/No prices changed/);
const target=edit.matrix[1].cells[2][0];assert.equal(target.original,.46);target.value='.5';
const changed=prepareEditorUpdate(base,edit,'2026-10-04');
assert.deepEqual(base,original,'Draft never mutates source');
assert.deepEqual(changed.data.costBands,base.costBands,'All supplier cost bands preserved');
assert.deepEqual(changed.data.rows.filter(r=>r.sku!==sku),base.rows.filter(r=>r.sku!==sku),'Other cards byte-equivalent');
assert.deepEqual(changed.data.rows.filter(r=>r.sku===sku&&r.tier!==TIERS[1]),base.rows.filter(r=>r.sku===sku&&r.tier!==TIERS[1]),'Other tiers preserved');
assert.equal(changed.data.rows.find(r=>r.sku===sku&&r.tier===TIERS[1]&&r.quantityMin===10000).sellingPrice,.5);
assert.equal(changed.data.rows.find(r=>r.sku===sku&&r.tier===TIERS[1]&&r.quantityMin===10000).sourceDate,'2026-10-04');
for(const min of [20,1000,750000,1000000])assert.deepEqual(changed.data.rows.find(r=>r.sku===sku&&r.tier===TIERS[1]&&r.quantityMin===min),base.rows.find(r=>r.sku===sku&&r.tier===TIERS[1]&&r.quantityMin===min),'Extra bands preserved');
for(const invalid of ['-1','abc','','1,000','Infinity']){edit=draft();edit.matrix[1].cells[2][0].value=invalid;assert.throws(()=>prepareEditorUpdate(base,edit),/numeric/);}
edit=draft();edit.matrix[1].cells[2][0].value='0';const zero=prepareEditorUpdate(base,edit).data;assert.equal(zero.rows.find(r=>r.sku===sku&&r.tier===TIERS[1]&&r.quantityMin===10000).marginPercent,null);
// Filling a missing tier does not erase other schedules, and respects supplier cost boundaries.
edit=draft();edit.matrix[2].cells[7][0].value='.25';const addedTier=prepareEditorUpdate(base,edit).data;assert.deepEqual(addedTier.costBands,base.costBands);assert.ok(addedTier.rows.some(r=>r.sku===sku&&r.tier===TIERS[2]&&r.sellingPrice===.25));
let fresh={sku:'TEST-NEW',product:'Synthetic test card',isNew:true,matrix:createMatrix(base,'',true),costPrice:'.199',costBasis:'supplier_purchase'};
assert.throws(()=>prepareEditorUpdate(base,fresh),/numeric/);
for(const row of fresh.matrix)for(const cell of row.cells)cell[0].value='.46';
const added=prepareEditorUpdate(base,fresh).data;assert.equal(added.rows.filter(r=>r.sku==='TEST-NEW').length,32);assert.equal(added.costBands.at(-1).costPrice,.199);assert.deepEqual(added.rows.filter(r=>r.sku!=='TEST-NEW'),base.rows);
assert.throws(()=>prepareEditorUpdate(base,{...fresh,sku:'ctc-007'}),/already exists/);
assert.throws(()=>prepareEditorUpdate(base,{...fresh,sku:'CRD-007'}),/already exists/);
assert.throws(()=>prepareEditorUpdate(base,{...fresh,costPrice:''}),/numeric/);
assert.throws(()=>prepareEditorUpdate(base,{...fresh,costBasis:'unknown'}),/cost basis/);
// Exercise the actual, unchanged calculator against edited and newly added data.
function calculate(data,sku,tier,qty){const context=vm.createContext({Intl,document:{querySelector(){return {};}}});vm.runInContext(fs.readFileSync('app.js','utf8').replace(/try\s*\{\s*boot\(\);[\s\S]*$/,''),context);context.data=data;context.sku=sku;context.tier=tier;context.qty=qty;return JSON.parse(vm.runInContext('state.rows=data.rows;state.costBands=data.costBands;state.quantity=qty;const row=data.rows.find(r=>r.sku===sku&&r.tier===tier&&inQuantityRange(r,qty));JSON.stringify(row?{sell:row.sellingPrice,...displayMetrics(row)}:null)',context));}
for(const qty of [1,19,20,999,1000,4999,5000,9999,25000,500000,749999,750000,1000000])assert.deepEqual(calculate(changed.data,sku,TIERS[1],qty),calculate(base,sku,TIERS[1],qty),'Outside edited range unchanged');
for(const qty of [10000,24999]){const v=calculate(changed.data,sku,TIERS[1],qty);assert.equal(v.sell,.5);assert.equal(v.costPrice,.119);assert.equal(v.grossProfit,.381);assert.equal(v.marginPercent,.762);}
assert.equal(calculate(zero,sku,TIERS[1],10000).marginPercent,null);
assert.equal(calculate(added,'TEST-NEW',TIERS[0],1).costPrice,.199);
console.log('Editor data tests passed: exact ranges, unchanged cards/costs, new cards, numeric/zero validation and actual calculator results.');
