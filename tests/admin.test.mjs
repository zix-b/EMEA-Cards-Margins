import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readZip,prepareUpdate,MAX_UPLOAD} from '../pricing-import.mjs';
import {fixture} from './import.test.mjs';
const elements=new Map();function element(){return {value:'',checked:false,disabled:false,hidden:false,textContent:'',children:[],handlers:{},files:[],addEventListener(name,fn){this.handlers[name]=fn;},replaceChildren(){this.children=[];},append(child){this.children.push(child);}};}
const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
let receivedToken,published=0,cleared=0;
class Repository{constructor(token){receivedToken=token;}async read(){return {sha:'abcdef123',tree:'tree',data:{rows:[],costBands:[]}};}clear(){cleared++;}async publish(snapshot,data){assert.equal(snapshot.sha,'abcdef123');assert.equal(data.rows[0].sku,'CTC-007');published++;return {sha:'published'};}}
const source=fs.readFileSync('admin.mjs','utf8').replace(/^import .*;\n/gm,'');
vm.runInNewContext(source,{readZip,prepareUpdate,MAX_UPLOAD,Repository,document:{getElementById:get,createElement:element},window:{PRICING_DATA:{rows:[],costBands:[]},addEventListener(){}},Uint8Array,Set,Number,console});
// Validation is safe without credentials; publication remains disabled.
const offlineBytes=fixture();get('zipFile').files=[{size:offlineBytes.length,arrayBuffer:async()=>offlineBytes.buffer}];get('updateMode').value='merge';get('costBasis').value='supplier_purchase';await get('uploadForm').handlers.submit({preventDefault(){}});assert.equal(get('previewPanel').hidden,false);get('confirmPublish').checked=true;get('confirmPublish').handlers.change();assert.equal(get('publishButton').disabled,true);await get('publishButton').handlers.click();assert.equal(published,0);
get('githubToken').value='synthetic-token';await get('connectForm').onsubmit({preventDefault(){}});assert.equal(receivedToken,'synthetic-token');assert.equal(get('githubToken').value,'');assert.equal(get('validateButton').disabled,false);
const bytes=fixture();get('zipFile').files=[{size:bytes.length,arrayBuffer:async()=>bytes.buffer}];get('updateMode').value='merge';get('costBasis').value='supplier_purchase';await get('uploadForm').handlers.submit({preventDefault(){}});assert.equal(get('previewPanel').hidden,false);assert.equal(get('previewRows').children.length,1);assert.equal(get('publishButton').disabled,true);
get('confirmPublish').checked=true;get('confirmPublish').handlers.change();assert.equal(get('publishButton').disabled,false);await get('publishButton').handlers.click();assert.equal(published,1);assert.ok(cleared>0);assert.match(get('message').textContent,/committed successfully/);assert.equal(get('previewPanel').hidden,true);
const html=fs.readFileSync('admin.html','utf8');assert.match(html,/<option value="oppiot">/);assert.ok(!/localStorage|sessionStorage/.test(source));
console.log('Admin interaction test passed: connect, clear token input, ZIP preview, explicit confirmation, publish, disconnect.');
