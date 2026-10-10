import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {prepareDirect,validateDirect,scope} from '../netsuite-direct.mjs';
import {buildUpdate} from '../backend/operations.mjs';
const old=JSON.parse(execFileSync('git',['show','d11dab1d04f681a4005caf64a1b5ad83f209dc0a:pricing-data.json'],{encoding:'utf8'}));
const preview=JSON.parse(fs.readFileSync('netsuite-preview.json'));
const actual=JSON.parse(fs.readFileSync('pricing-data.json'));
// A fetched preview can be newer than active prices until Apply; validate each independently.
const active={...preview,fetchedAt:actual.netsuiteFetchedAt,rows:actual.rows.map(r=>({sku:r.sku,level:r.tier,quantityMin:r.quantityMin,quantityMax:r.quantityMax,sellingPrice:r.sellingPrice}))};
validateDirect(preview);validateDirect(active);
const before=structuredClone(old),result=prepareDirect(old,active);
assert.deepEqual(old,before);assert.deepEqual(result.data.costBands,old.costBands);
assert.deepEqual(result.data.rows,actual.rows,'Selling schedules remain reproducible independently of approved cost updates');
assert.equal(actual.rows.length,active.rows.length);assert.equal(actual.priceSource,'netsuite');
assert.deepEqual(actual.rows.map(r=>[r.sku,r.tier,r.quantityMin,r.quantityMax,r.sellingPrice]),active.rows.map(r=>[r.sku,r.level,r.quantityMin,r.quantityMax,r.sellingPrice]));
assert.equal(new Set(actual.rows.map(r=>r.sku)).size,10);
assert.equal(new Set(actual.rows.map(r=>r.tier)).size,13);
for(const r of before.rows.filter(r=>Number.isFinite(r.costPrice))){
 const region=r.region||(/USA|NASA/.test(r.tier)?'NASA':'EMEA');
 const found=result.data.legacyCosts.find(c=>c.sku===r.sku&&c.region===region&&c.quantityMin===r.quantityMin&&c.quantityMax===r.quantityMax);
 assert.equal(found?.costPrice,r.costPrice,`Preserve fallback cost for ${r.sku}/${region}/${r.quantityMin}`);
}
const second=prepareDirect(actual,active);assert.deepEqual(second.data,actual,'Repeated sync is idempotent');
assert.deepEqual(buildUpdate(actual,second.operation,active),actual);
assert.ok(second.changes.every(r=>r.before===r.sellingPrice),'Review shows existing prices for unchanged bands');
const shifted=structuredClone(actual);shifted.rows[0].quantityMin+=1;
assert.equal(prepareDirect(shifted,active).changes[0].before,'Different quantity bands');
for(const kind of ['upload','card'])assert.throws(()=>buildUpdate(actual,{kind,date:'2026-10-07'},preview),/managed in NetSuite/);
const bad=structuredClone(preview);bad.rows=bad.rows.filter(r=>r.sku!=='CTC-007');assert.throws(()=>validateDirect(bad),/Incomplete/);
for(const patch of [{sellingPrice:-1},{sellingPrice:Infinity},{quantityMin:0},{level:'EMEA Premier'},{sku:'OTHER'}]){const p=structuredClone(preview);Object.assign(p.rows[0],patch);assert.throws(()=>validateDirect(p),/Incomplete/);}
assert.throws(()=>validateDirect({...preview,rows:[...preview.rows,preview.rows[0]]}),/Incomplete/);
assert.throws(()=>validateDirect({...preview,currency:'EUR'}),/Incomplete/);
assert.throws(()=>buildUpdate(actual,second.operation,{...preview,requestId:'changed'}),/preview changed/);
// Blank NetSuite levels stay absent; there is no spreadsheet fallback.
assert.equal(actual.rows.some(r=>r.sku==='LIC-009'&&r.tier==='EMEA License Customers'),false);
assert.ok(actual.rows.every(r=>scope.expected[r.sku].includes(r.tier)&&r.costPrice===null));
console.log(`${actual.rows.length} exact source bands, complete scope, blank levels, all stored costs, idempotency and server-only NetSuite writes passed.`);

// Website-only overrides retain exact source bands and survive subsequent syncs.
const {createMatrix,prepareEditorUpdate}=await import('../pricing-editor.mjs');
const original=JSON.stringify(actual),sku='CTC-007',product=actual.rows.find(r=>r.sku===sku).product;
const matrix=createMatrix(actual,sku);
const target=matrix[0].cells.flat().find(s=>s.index!==null),index=target.index;
for(const s of matrix.flatMap(r=>r.cells.flat()).filter(s=>s.index===index))s.value='0.987';
const edited=prepareEditorUpdate(actual,{sku,product,matrix},'2026-10-10');
assert.equal(JSON.stringify(actual),original);
assert.deepEqual(buildUpdate(actual,edited.operation),edited.data);
assert.equal(edited.data.rows[index].sellingPrice,.987);
assert.ok(edited.data.rows[index].manualOverride);
assert.deepEqual(edited.data.rows.filter((_,i)=>i!==index),actual.rows.filter((_,i)=>i!==index));
assert.deepEqual(edited.data.costBands,actual.costBands);
const synced=prepareDirect(edited.data,preview).data;
assert.equal(synced.rows.find(r=>r.manualOverride).sellingPrice,.987);
assert.deepEqual(synced.costBands,actual.costBands);
const invalid=structuredClone(edited.operation);invalid.edit.matrix[0].cells[0][0].value='-1';
assert.throws(()=>buildUpdate(actual,invalid),/non-negative/);
const changedBands=structuredClone(preview);
const overridden=edited.data.rows[index];
const removed=changedBands.rows.find(r=>r.sku===sku&&r.level===overridden.tier&&r.quantityMin===overridden.quantityMin);removed.quantityMin++;
assert.throws(()=>prepareDirect(edited.data,changedBands),/quantity bands changed/);
console.log('Manual overrides: selected price only, validation, cost preservation and sync retention passed.');
