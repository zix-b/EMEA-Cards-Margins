import {execFileSync} from 'node:child_process';
// Preserve legacy-mode regressions using the last approved sheet dataset.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readPricingFiles,prepareSellingUpdate,HEADERS} from '../pricing-files.mjs';
import {buildUpdate} from '../backend/operations.mjs';
const data=JSON.parse(execFileSync('git',['show','d11dab1d04f681a4005caf64a1b5ad83f209dc0a:pricing-data.json'],{encoding:'utf8'}));
const card=data.rows.find(r=>r.tier==='EMEA Base');
const elements=new Map();
const element=()=>({value:'',checked:false,disabled:false,hidden:false,textContent:'',children:[],handlers:{},files:[],addEventListener(name,fn){this.handlers[name]=fn;},replaceChildren(){this.children=[];},append(child){this.children.push(child);}});
const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
let count=0,logoutCount=0;
class AdminService{
 async login(){return {email:'admin@example.test'};}
 async read(){return {sha:'a'.repeat(40),data};}
 clear(){}
 async logout(){logoutCount++;}
 async publish(snapshot,expected,message,operation){assert.equal(snapshot.sha,'a'.repeat(40));assert.deepEqual(buildUpdate(data,operation),expected);count++;return {sha:'b'.repeat(40)};}
}
class Repository{constructor(){throw Error('Backend login must never construct a browser-token repository.');}}
const source=fs.readFileSync('admin.mjs','utf8').replace(/^import .*;\n/gm,'');
const component=()=>({invalidate(){},setBusy(){},stop(){},connected(){},reload(){},discard(){return true;}});
vm.runInNewContext(source,{initCosts:()=>({invalidate(){}}),AdminService,Repository,initNetSuite:component,initCards:component,initEditor:component,readPricingFiles,prepareSellingUpdate,document:{getElementById:get,createElement:element},window:{ADMIN_BACKEND_URL:'https://emea-cards-admin.example.workers.dev',PRICING_DATA:data,addEventListener(){}},Uint8Array,Set,Number,console});
await get('gateForm').onsubmit({preventDefault(){}});
assert.equal(get('adminGate').hidden,true);assert.equal(get('adminPortal').hidden,false);assert.match(get('connectionStatus').textContent,/admin@example.test/);
const bytes=new TextEncoder().encode([HEADERS,[card.sku,card.product,card.tier,card.sellingPrice]].map(row=>row.map(v=>JSON.stringify(String(v))).join(',')).join('\n'));
get('zipFile').files=[{name:'local-test.csv',size:bytes.length,arrayBuffer:async()=>bytes.buffer}];
await get('uploadForm').handlers.submit({preventDefault(){}});assert.equal(get('previewPanel').hidden,false);
await get('publishButton').handlers.click();assert.equal(count,0);
get('confirmPublish').checked=true;get('confirmPublish').handlers.change();await get('publishButton').handlers.click();assert.equal(count,1);assert.equal(get('previewPanel').hidden,true);assert.match(get('message').textContent,/committed successfully/);
await get('publishButton').handlers.click();assert.equal(count,1);
await get('gateLogout').onclick();assert.equal(logoutCount,1);assert.equal(get('adminPortal').hidden,true);assert.equal(get('adminGate').hidden,false);
console.log('Backend admin UI passed: email login without GitHub token, CSV review and explicit confirmation, server-equivalent result, repeated Apply blocked, logout. No live writes.');

// A failed login returns the gate to a usable state and hides pending controls.
AdminService.prototype.login=async()=>{throw Error('The sign-in window was closed.');};
await get('gateForm').onsubmit({preventDefault(){}});
assert.equal(get('gateLogin').disabled,false);
assert.equal(get('gatePending').hidden,true);
assert.match(get('gateError').textContent,/window was closed/);
