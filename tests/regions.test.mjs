import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
class Element {
 constructor(){this.value='';this.options=[];this.attrs={};this.textContent='';}
 set innerHTML(value){this.html=value;if(value.startsWith('<option'))this.options=[{value:'',textContent:value}];}
 get innerHTML(){return this.html;}
 appendChild(option){this.options.push(option);}
 setAttribute(k,v){this.attrs[k]=v;}
 get selectedIndex(){return this.options.findIndex(o=>o.value===this.value);}
}
const nodes=new Map();const document={querySelector(id){if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement(){return new Element();}};
const context=vm.createContext({Intl,document,console});
vm.runInContext(fs.readFileSync('app.js','utf8').replace(/try\s*\{\s*boot\(\);[\s\S]*$/,''),context);
const run=code=>vm.runInContext(code,context),get=code=>JSON.parse(run(`JSON.stringify(${code})`));
const row=(tier,sellingPrice,costPrice,region)=>({sku:'CTC-007',product:'Card',tier,sellingPrice,costPrice,quantityMin:1,quantityMax:null,region});
const data={generatedAt:'2026-10-05',rows:[row('EMEA Base',.3,.1),row('Standard Price (USA Standard)',.4,.2),row('ROW Standard',.9,.4),row('Unassigned',1,0)],costBands:[{sku:'CTC-007',quantityMin:1,quantityMax:null,costPrice:.1},{sku:'CTC-007',region:'ROW',quantityMin:1,quantityMax:null,costPrice:.5}]};
context.data=data;nodes.get('#quantityInput').value='10000';run('setData(data,true)');
assert.equal(get('state.region'),'EMEA');assert.deepEqual(get('state.filtered.map(r=>r.tier)'),['EMEA Base']);
run("changeRegion('NASA')");
assert.deepEqual(get('state.filtered.map(r=>r.tier)'),['Standard Price (USA Standard)']);
assert.equal(get('displayMetrics(state.filtered[0]).costPrice'),.2,'EMEA supplier costs must not override USA row costs');
assert.equal(get('displayMetrics(state.filtered[0]).marginPercent'),.5);
assert.equal(nodes.get('#regionNASA').attrs['aria-pressed'],'true');assert.equal(nodes.get('#regionEMEA').attrs['aria-pressed'],'false');
assert.equal(nodes.get('#priceTypeLabel').textContent,'NASA price type');
run('setData(data)');assert.equal(get('state.region'),'NASA','Background refresh retains selected region');
run("changeRegion('ROW')");assert.deepEqual(get('state.filtered.map(r=>r.tier)'),['ROW Standard']);assert.equal(get('displayMetrics(state.filtered[0]).costPrice'),.5);
run("changeRegion('EMEA')");assert.equal(get('displayMetrics(state.filtered[0]).costPrice'),.1);
context.actual=JSON.parse(fs.readFileSync('pricing-data.json'));run("setData(actual);changeRegion('NASA')");
assert.ok(get('state.filtered.length')>0);assert.ok(get("state.filtered.every(r=>/USA|NASA/.test(r.tier))"));
run("changeRegion('ROW')");assert.equal(get('state.filtered.length'),0);assert.match(nodes.get('#resultsBody').innerHTML,/No ROW pricing data available/);
assert.equal(nodes.get('#productSelect').options.length,1);
run("changeRegion('EMEA')");assert.equal(nodes.get('#productSelect').options.length,11);assert.ok(get("state.filtered.every(r=>r.tier.includes('EMEA'))"));
assert.equal(get("pricingRegion({region:'NASA',tier:'Standard'})"),'NASA');assert.equal(get("pricingRegion({tier:'Unassigned'})"),null);
console.log('Region controls, price/product isolation, regional cost selection, refresh persistence and missing ROW data passed.');
