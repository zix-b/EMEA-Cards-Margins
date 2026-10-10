import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {prepareCosts} from '../netsuite-costs.mjs';import {buildUpdate} from '../backend/operations.mjs';
const data=JSON.parse(fs.readFileSync('pricing-data.json'));
const header='Inactive,Internal ID,Supplier Int ID,Supplier,Incoterm,Item Int ID,Item,Quantity From,Quantity To ,Unit Rate';
const records=(sku='CTC-008',cost='.4',lo='1',hi='1000000')=>['FZCO','LLC'].map(s=>`No,1,1,Embed Singapore Pte Ltd (${s}),Ex-Works,4620,${sku},${lo},${hi},${cost}`);
const op={kind:'netsuite-costs',date:'2026-10-10',currency:'USD',unit:'Each',confirmedFullExport:true,csvText:[header,...records()].join('\n')};
const saved=structuredClone(data),result=prepareCosts(data,op);
assert.deepEqual(data,saved);assert.deepEqual(result.data.rows,data.rows);assert.equal(result.bands.length,1);
assert.deepEqual(buildUpdate(data,op),result.data);assert.deepEqual(prepareCosts(result.data,op).data,result.data);
for(const patch of [{currency:'EUR'},{unit:'Box'},{confirmedFullExport:false},{date:'2026-02-30'},{date:'2026-10-09'},{csvText:header},{csvText:op.csvText.replace('(LLC)','(HSA)')},{csvText:op.csvText.replace(/\.4$/,'.5')},{csvText:[header,...records('CTC-008','-1')].join('\n')},{csvText:[header,...records(),...records('CTC-008','.4','10','20')].join('\n')}])assert.throws(()=>prepareCosts(data,{...op,...patch}));
const zero=prepareCosts(data,{...op,csvText:[header,...records('CTC-008','0')].join('\n')});assert.equal(zero.bands[0].costPrice,0);
const nodes=new Map();function el(){return {value:'',options:[],set innerHTML(v){this.html=v;this.options=[];},get innerHTML(){return this.html;},appendChild(x){this.options.push(x);},setAttribute(){},textContent:''};}
const ctx=vm.createContext({Intl,console,document:{querySelector(id){if(!nodes.has(id))nodes.set(id,el());return nodes.get(id);},createElement:el},data});
vm.runInContext(fs.readFileSync('app.js','utf8').replace(/try\s*\{\s*boot\(\);[\s\S]*$/,''),ctx);
const run=s=>vm.runInContext(s,ctx);nodes.get('#quantityInput').value='10000';run('setData(data,true)');
let cases=0;
for(const region of ['EMEA','NASA','ROW'])for(const row of data.rows)for(const qty of [1,199,200,9999,10000,999999,1000000,1000001]){
 ctx.row=row;ctx.qty=qty;ctx.region=region;const metrics=JSON.parse(run('state.region=region;state.quantity=qty;JSON.stringify(displayMetrics(row))'));
 const expected=region==='EMEA'&&row.sku==='CTC-008'&&qty<=1000000?.4:null;
 assert.equal(metrics.costPrice,expected,`${region}/${row.sku}/${qty}`);
 assert.equal(metrics.grossProfit,expected===null?null:row.sellingPrice-expected);
 assert.equal(metrics.marginPercent,expected===null||row.sellingPrice===0?null:(row.sellingPrice-expected)/row.sellingPrice);cases++;
}
run("state.region='EMEA';changeRegion('NASA')");assert.equal(run('state.costPolicy'),'netsuite-only');assert.match(nodes.get('#dataNotice').textContent,/0\/10/);assert.match(nodes.get('#dataNotice').textContent,/mapping not confirmed/);
run("changeRegion('EMEA')");assert.match(nodes.get('#dataNotice').textContent,/1\/10/);assert.match(nodes.get('#dataNotice').textContent,/2026-10-10/);
ctx.zeroData=zero.data;run('setData(zeroData);state.quantity=10');ctx.row=data.rows.find(r=>r.sku==='CTC-008');assert.equal(run('displayMetrics(row).marginPercent'),1);
console.log(`${cases} independent NetSuite-only metric cases passed; invalid imports, overlaps, supplier conflicts, zero costs, regional switching and server reconstruction verified.`);
