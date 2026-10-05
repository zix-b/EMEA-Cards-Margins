import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readPricingFiles,prepareSellingUpdate,HEADERS} from '../pricing-files.mjs';
const fixture=()=>new TextEncoder().encode([HEADERS,['CTC-007','Custom Card','Standard Price (EMEA License)',.46]].map(row=>row.map(v=>JSON.stringify(String(v))).join(',')).join('\n'));
const elements=new Map();function element(){return {value:'',checked:false,disabled:false,hidden:false,textContent:'',children:[],handlers:{},files:[],addEventListener(name,fn){this.handlers[name]=fn;},replaceChildren(){this.children=[];},append(child){this.children.push(child);}};}
const get=id=>{assert.ok(!['costBasis','updateMode'].includes(id),'Removed controls must not be accessed');if(!elements.has(id))elements.set(id,element());return elements.get(id);};
let receivedToken,published=0,cleared=0;
class Repository{constructor(token){receivedToken=token;}async read(){return {sha:'abcdef123',tree:'tree',data:{rows:[{sku:'KEEP'}],costBands:[]}};}clear(){cleared++;}async publish(snapshot,data){assert.equal(snapshot.sha,'abcdef123');assert.ok(data.rows.some(r=>r.sku==='CTC-007'));assert.ok(data.rows.some(r=>r.sku==='KEEP'));published++;return {sha:'published'};}}
const source=fs.readFileSync('admin.mjs','utf8').replace(/^import .*;\n/gm,'');
vm.runInNewContext(source,{readPricingFiles,prepareSellingUpdate,Repository,initCards:()=>({setBusy(){},stop(){},connected(){},reload(){},discard(){return true;}}),initEditor:()=>({reload(){},connected(){},setBusy(){},stop(){},discard(){return true;}}),document:{getElementById:get,createElement:element},window:{PRICING_DATA:{rows:[],costBands:[]},addEventListener(){}},Uint8Array,Set,Number,console});
// Validation is safe without credentials; publication remains disabled.
const offlineBytes=fixture();get('zipFile').files=[{name:'prices.csv',size:offlineBytes.length,arrayBuffer:async()=>offlineBytes.buffer}];await get('uploadForm').handlers.submit({preventDefault(){}});assert.equal(get('previewPanel').hidden,false);get('confirmPublish').checked=true;get('confirmPublish').handlers.change();assert.equal(get('publishButton').disabled,true);await get('publishButton').handlers.click();assert.equal(published,0);
get('githubToken').value='synthetic-token';await get('connectForm').onsubmit({preventDefault(){}});assert.equal(receivedToken,'synthetic-token');assert.equal(get('githubToken').value,'');assert.equal(get('validateButton').disabled,false);
const bytes=fixture();get('zipFile').files=[{name:'prices.csv',size:bytes.length,arrayBuffer:async()=>bytes.buffer}];await get('uploadForm').handlers.submit({preventDefault(){}});assert.equal(get('previewPanel').hidden,false);assert.equal(get('previewRows').children.length,1);assert.equal(get('publishButton').disabled,true);
get('confirmPublish').checked=true;get('confirmPublish').handlers.change();assert.equal(get('publishButton').disabled,false);await get('publishButton').handlers.click();assert.equal(published,1);assert.ok(cleared>0);assert.match(get('message').textContent,/committed successfully/);assert.equal(get('previewPanel').hidden,true);
const html=fs.readFileSync('admin.html','utf8');assert.ok(!/id="(?:costBasis|updateMode)"/.test(html));assert.ok(!/localStorage|sessionStorage/.test(source));

get('zipFile').files=[{name:'wrong.csv',size:3,arrayBuffer:async()=>new TextEncoder().encode('bad').buffer}];await get('uploadForm').handlers.submit({preventDefault(){}});assert.equal(get('previewPanel').hidden,true);assert.match(get('message').textContent,/missing required column/);
console.log('Admin upload preview, validation errors, confirmation, publication and connection flow passed.');
