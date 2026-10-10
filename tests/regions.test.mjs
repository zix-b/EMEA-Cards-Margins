import {execFileSync} from 'node:child_process';
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
context.actual=JSON.parse(execFileSync('git',['show','d11dab1d04f681a4005caf64a1b5ad83f209dc0a:pricing-data.json'],{encoding:'utf8'}));run("setData(actual);changeRegion('NASA')");
assert.ok(get('state.filtered.length')>0);assert.ok(get("state.filtered.every(r=>/USA|NASA/.test(r.tier))"));
run("changeRegion('ROW')");assert.equal(get('state.filtered.length'),0);assert.match(nodes.get('#resultsBody').innerHTML,/No ROW pricing data available/);
assert.equal(nodes.get('#productSelect').options.length,1);
run("changeRegion('EMEA')");assert.equal(nodes.get('#productSelect').options.length,11);assert.ok(get("state.filtered.every(r=>r.tier.includes('EMEA'))"));
assert.equal(get("pricingRegion({region:'NASA',tier:'Standard'})"),'NASA');assert.equal(get("pricingRegion({tier:'Unassigned'})"),null);
console.log('Region controls, price/product isolation, regional cost selection, refresh persistence and missing ROW data passed.');

// Direct NetSuite levels are independent of cost region; original cost records persist.
context.direct=JSON.parse(fs.readFileSync('pricing-data.json'));
run("setData(direct);el.product.value='CTM-004 - '+direct.rows.find(r=>r.sku==='CTM-004').product;el.tier.value='USA Standard';el.quantity.value='5000';applyFilters()");
assert.equal(get('state.filtered.length'),1);assert.equal(get('state.filtered[0].sellingPrice'),1.37);
const selling=get('state.filtered');run("changeRegion('NASA')");assert.deepEqual(get('state.filtered'),selling);assert.equal(get('displayMetrics(state.filtered[0]).costPrice'),null);
run("changeRegion('ROW')");assert.deepEqual(get('state.filtered'),selling);assert.equal(get('displayMetrics(state.filtered[0]).costPrice'),null);
assert.equal(nodes.get('#priceTypeLabel').textContent,'NetSuite price level');
run("changeRegion('EMEA');el.quantity.value='';applyFilters()");assert.equal(get('displayMetrics(state.filtered[0]).costPrice'),null,'A quantity is required to select the independent cost band');
console.log('Direct NetSuite prices stay identical across cost regions; missing costs stay unavailable.');

// PLI's approved printed NASA costs: exercise both ends of every source band.
const starts=[20,1000,5000,10000,25000,50000,100000,250000,500000,700000,1000000];
const pli={
 'CRD-004':[.0752,.0738,.0725,.067,.062,.056,.054,.053,.052,.052,.052],
 'CRD-012':[.0752,.0738,.0725,.067,.062,.056,.054,.053,.052,.052,.052],
 'CTC-007':[.0201,.1875,.160,.153,.150,.147,.143,.140,.137,.135,.130],
 'CTC-011':[.1871,.175,.151,.146,.140,.136,.133,.130,.128,.126,.123]
};
const baseline=JSON.parse(execFileSync('git',['show','c641a57:pricing-data.json'],{encoding:'utf8'}));
assert.deepEqual(context.direct.rows,baseline.rows,'Selling prices unchanged');
for(const [sku,prices] of Object.entries(pli)){
 context.sku=sku;run("changeRegion('NASA');el.product.value=sku+' - '+direct.rows.find(r=>r.sku===sku).product;el.tier.value='Base'");
 for(let i=0;i<starts.length;i++)for(const qty of [starts[i],starts[i+1]?starts[i+1]-1:1000000000000]){
  nodes.get('#quantityInput').value=String(qty);run('applyFilters()');
  assert.equal(get('displayMetrics(state.filtered[0]).costPrice'),prices[i],`${sku}/${qty}`);
 }
 nodes.get('#quantityInput').value='19';run('applyFilters()');assert.equal(get('displayMetrics(state.filtered[0]).costPrice'),null,'No old fallback below PLI minimum');
}
console.log('All 44 printed PLI NASA bands, both boundaries, minimum exclusion and unrelated data preservation passed.');

// Saved search 7072: CTC-008 EMEA purchase cost in USD, inclusive endpoints.
const beforeEMEA=JSON.parse(execFileSync('git',['show','e6c1b345:pricing-data.json'],{encoding:'utf8'}));
const affected=r=>['CTC-008','CTC-009','CTC-027'].includes(r.sku)&&(r.region||'EMEA')==='EMEA';
assert.deepEqual(context.direct.rows,beforeEMEA.rows);
assert.equal(context.direct.costBands.filter(affected).length,3);
assert.equal(context.direct.legacyCosts.filter(affected).length,0);
run("changeRegion('EMEA');el.product.value='CTC-008 - '+direct.rows.find(r=>r.sku==='CTC-008').product;el.tier.value='Base'");
for(const qty of [1,199,200,499,500,999,1000,4999,5000,9999,10000,24999,25000,49999,50000,99999,100000,249999,250000,499999,500000,699999,700000,999999,1000000]){
 nodes.get('#quantityInput').value=String(qty);run('applyFilters()');
 const m=get('displayMetrics(state.filtered[0])'),sell=get('state.filtered[0].sellingPrice');
 assert.equal(m.costPrice,.4,`CTC-008 EMEA / ${qty}`);
 assert.equal(m.grossProfit,sell-.4);assert.equal(m.marginPercent,(sell-.4)/sell);
}
nodes.get('#quantityInput').value='1000001';run('applyFilters()');
assert.equal(get('displayMetrics(state.filtered[0]).costPrice'),null);
assert.equal(get('displayMetrics(state.filtered[0]).marginPercent'),null);
run("changeRegion('NASA')");assert.equal(get('displayMetrics(state.filtered[0]).costPrice'),null);
run("changeRegion('ROW')");assert.equal(get('displayMetrics(state.filtered[0]).costPrice'),null);
console.log('NetSuite CTC-008 EMEA cost boundaries, profit/margins, upper-limit exclusion and all unrelated records verified.');

for(const [sku,cost] of [['CTC-009',1.6],['CTC-027',1.59]]){
 context.costSku=sku;run("changeRegion('EMEA')");
 for(const qty of [1,10000,1000000])assert.equal(run(`findCostBand(costSku,${qty}).costPrice`),cost);
 assert.equal(run('findCostBand(costSku,1000001)'),null);
 assert.ok(!context.direct.rows.some(r=>r.sku===sku),'Do not invent selling prices');
}

// Approved cost sources only, including after a selling-price sync.
const approved=r=>(r.region==='EMEA'&&r.source.includes('saved search 7072'))||(r.region==='NASA'&&r.vendor==='PLI'&&r.validFrom==='2026-01-01'&&r.validTo==='2026-12-31');
assert.deepEqual(context.direct.costBands,JSON.parse(execFileSync('git',['show','dbefa9b:pricing-data.json'],{encoding:'utf8'})).costBands.filter(approved));
assert.deepEqual(context.direct.legacyCosts,[]);
assert.equal(context.direct.costBands.length,47);
for(const region of ['EMEA','NASA','ROW'])for(const sku of [...new Set(context.direct.rows.map(r=>r.sku))]){
 context.selectedSku=sku;context.selectedRegion=region;run("changeRegion(selectedRegion);el.product.value=selectedSku+' - '+direct.rows.find(r=>r.sku===selectedSku).product;el.tier.value='Base'");
 for(const qty of [1,19,20,999,1000,4999,5000,9999,10000,24999,25000,999999,1000000,1000001]){
  nodes.get('#quantityInput').value=String(qty);run('applyFilters()');
  const band=context.direct.costBands.find(r=>r.sku===sku&&r.region===region&&qty>=r.quantityMin&&(r.quantityMax===null||qty<=r.quantityMax));
  const metrics=get('state.filtered.map(displayMetrics)');
  for(const m of metrics){assert.equal(m.costPrice,band?.costPrice??null,`${sku}/${region}/${qty}`);if(!band){assert.equal(m.grossProfit,null);assert.equal(m.marginPercent,null);}}
 }
}
console.log('All active cards and regions use approved costs only; missing costs never fall back.');
