import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
const data=JSON.parse(fs.readFileSync('pricing-data.json','utf8'));
function calculator(source){const elements=new Map();const make=()=>({value:'',innerHTML:'',options:[],addEventListener(){},appendChild(option){this.options.push(option);}});const doc={querySelector(id){if(!elements.has(id))elements.set(id,make());return elements.get(id);},createElement:make};const context=vm.createContext({window:{PRICING_DATA:data},document:doc,Intl,console});vm.runInContext(source.replace(/try\s*\{\s*boot\(\);[\s\S]*$/, ''),context);vm.runInContext('state.rows=window.PRICING_DATA.rows;state.costBands=window.PRICING_DATA.costBands;',context);return (row,qty)=>{context.testRow=row;context.testQty=qty;return JSON.parse(vm.runInContext('state.quantity=testQty;JSON.stringify(displayMetrics(testRow))',context));};}
const old=calculator(execFileSync('git',['show','c37642af474e266f9ac7a9c5db5a3a3639cbf3ea:app.js'],{encoding:'utf8'})),current=calculator(fs.readFileSync('app.js','utf8'));
const quantities=new Set([null,1,10000,600000,700000,1000000]);for(const r of [...data.rows,...data.costBands])for(const n of [r.quantityMin-1,r.quantityMin,r.quantityMax,r.quantityMax===null?null:r.quantityMax+1])if(n===null||n>0)quantities.add(n);
let checked=0;for(const row of data.rows)for(const qty of quantities){assert.deepEqual(current(row,qty),old(row,qty),`${row.sku} / ${row.tier} / ${qty}`);checked++;}
const ctc=data.rows.find(r=>r.sku==='CTC-007'&&r.tier==='Base Price (EMEA Premium)'&&r.quantityMin===500000);assert.ok(ctc);assert.equal(current(ctc,600000).costPrice,.116);assert.equal(current(ctc,700000).costPrice,.114);
for(const name of ['pricing-data.json','pricing-data.js','build-data.py'])assert.equal(fs.readFileSync(name,'utf8'),execFileSync('git',['show',`c37642af474e266f9ac7a9c5db5a3a3639cbf3ea:${name}`],{encoding:'utf8'}));
console.log(`${checked} original-vs-rebuild pricing comparisons passed; original dataset and XLSX importer unchanged.`);
