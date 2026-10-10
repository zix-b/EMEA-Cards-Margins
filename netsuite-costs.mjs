import {csv} from './pricing-import.mjs';
// Only confirmed commercial mappings are eligible. Do not infer regions from supplier names.
export const COST_SUPPLIERS={EMEA:['Embed Singapore Pte Ltd (FZCO)','Embed Singapore Pte Ltd (LLC)']};
const HEADERS=['Inactive','Internal ID','Supplier Int ID','Supplier','Incoterm','Item Int ID','Item','Quantity From','Quantity To','Unit Rate'];
const fail=m=>{throw Error(m);};
export function prepareCosts(current,operation){
 const {csvText,date,currency,unit,confirmedFullExport}=operation;
 if(operation.kind!=='netsuite-costs'||currency!=='USD'||unit!=='Each'||confirmedFullExport!==true)fail('Confirm a complete NetSuite supplier export in USD per Each.');
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>new Date().toISOString().slice(0,10))fail('Use a valid export date that is not in the future.');
 if(current.costsCheckedAt && date < current.costsCheckedAt)fail('This export predates the current supplier costs. Obtain a current export.');
 if(typeof csvText!=='string'||new TextEncoder().encode(csvText).length>500000)fail('Supplier CSV must be no larger than 500 KB.');
 const rows=csv(csvText),headers=(rows.shift()||[]).map(s=>s.trim());
 if(JSON.stringify(headers)!==JSON.stringify(HEADERS)||!rows.length||rows.length>20000)fail('Use the complete saved search 7072 CSV export with its original columns.');
 const known=new Set([...current.rows,...current.costBands,...(current.legacyCosts||[])].map(r=>r.sku));
 const collected=new Map();
 for(const cells of rows){
  if(cells.length!==headers.length)fail('Invalid supplier CSV row.');
  const r=Object.fromEntries(headers.map((h,i)=>[h,cells[i].trim()]));
  if(!['Yes','No'].includes(r.Inactive))fail('Invalid inactive flag.');
  if(r.Inactive==='Yes'||!known.has(r.Item))continue;
  for(const [region,suppliers] of Object.entries(COST_SUPPLIERS)){
   if(!suppliers.includes(r.Supplier))continue;
   if(r.Incoterm!=='Ex-Works')fail(`${r.Item}: purchasing basis changed; review the mapping.`);
   const numeric=v=>/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(v)?Number(v):NaN;
   const lo=numeric(r['Quantity From']),hi=numeric(r['Quantity To']),cost=numeric(r['Unit Rate']);
   if(!Number.isSafeInteger(lo)||lo<1||!Number.isSafeInteger(hi)||hi<lo||!Number.isFinite(cost)||cost<0||cost>1e12)fail(`${r.Item}: invalid quantity or cost.`);
   const key=region+'|'+r.Item;if(!collected.has(key))collected.set(key,new Map());
   const perSupplier=collected.get(key);if(!perSupplier.has(r.Supplier))perSupplier.set(r.Supplier,[]);
   perSupplier.get(r.Supplier).push({quantityMin:lo,quantityMax:hi,costPrice:cost});
  }
 }
 const bands=[];
 for(const [key,schedules] of collected){
  const [region,sku]=key.split('|');let canonical=null;
  for(const supplier of COST_SUPPLIERS[region]){
   const entries=schedules.get(supplier);if(!entries)fail(`${sku}: missing paired supplier schedule; review the mapping.`);
   entries.sort((a,b)=>a.quantityMin-b.quantityMin);
   const unique=[];for(const e of entries){const prev=unique.at(-1);if(prev&&JSON.stringify(prev)===JSON.stringify(e))continue;if(prev&&e.quantityMin<=prev.quantityMax)fail(`${sku}: overlapping or conflicting costs.`);unique.push(e);}
   const signature=JSON.stringify(unique);if(canonical&&signature!==canonical)fail(`${sku}: supplier schedules disagree.`);canonical=signature;
  }
  for(const b of JSON.parse(canonical))bands.push({sku,region,...b,costBasis:'supplier_purchase',sourceKind:'netsuite',currency:'USD',unit:'Each',source:'NetSuite supplier tier purchase price / saved search 7072 / '+COST_SUPPLIERS[region].join(' and ')+' / Ex-Works',sourceDate:date});
 }
 if(!bands.length)fail('No eligible costs matched. Nothing was changed.');
 const data=structuredClone(current);
 // Keep historical data for traceability, but the calculator never uses it under this policy.
 data.costBands=[...data.costBands.filter(b=>b.sourceKind!=='netsuite'),...bands];
 data.costPolicy='netsuite-only';data.costsCheckedAt=date;data.costSupplierMappings=structuredClone(COST_SUPPLIERS);
 data.generatedAt=[data.generatedAt||'',date].sort().at(-1);
 const active=[...new Set(data.rows.map(r=>r.sku))].sort();
 const coverage=['EMEA','NASA','ROW'].map(region=>({region,matched:active.filter(sku=>bands.some(b=>b.region===region&&b.sku===sku)),missing:active.filter(sku=>!bands.some(b=>b.region===region&&b.sku===sku))}));
 return {data,bands,coverage,operation};
}
