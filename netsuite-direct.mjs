// NetSuite is authoritative for selling prices; costs remain independently sourced.
import scope from './netsuite-scope.json' with {type:'json'};
export {scope};
const fail=()=>{throw Error('Incomplete or invalid NetSuite snapshot. Sync again; active prices were not changed.');};
export function validateDirect(preview){
 if(preview?.version!==2||preview.currency!=='USD'||preview.unit!=='Each'||!Number.isFinite(Date.parse(preview.fetchedAt))||!Array.isArray(preview.rows)||!preview.rows.length||preview.rows.length>20000)fail();
 const groups=new Map();
 for(const r of preview.rows){
  if(!scope.expected[r.sku]?.includes(r.level)||!Number.isSafeInteger(r.quantityMin)||r.quantityMin<1||(r.quantityMax!==null&&(!Number.isSafeInteger(r.quantityMax)||r.quantityMax<r.quantityMin))||!Number.isFinite(r.sellingPrice)||r.sellingPrice<0||r.sellingPrice>1e12)fail();
  const key=r.sku+'|'+r.level;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);
 }
 for(const sku of scope.skus)for(const level of scope.expected[sku])if(!groups.has(sku+'|'+level))fail();
 for(const rows of groups.values()){rows.sort((a,b)=>a.quantityMin-b.quantityMin);for(let i=1;i<rows.length;i++)if(rows[i].quantityMin<=(rows[i-1].quantityMax??Infinity))fail();}
 return preview;
}
export function prepareDirect(current,preview){
 validateDirect(preview);
 const data=structuredClone(current),date=preview.fetchedAt.slice(0,10);
 if(!data.legacyCosts){
  const costs=new Map();
  for(const r of current.rows){
   if(!Number.isFinite(r.costPrice))continue;
   const region=r.region||(/USA|NASA/.test(r.tier)?'NASA':/EMEA/.test(r.tier)?'EMEA':null);if(!region)continue;
   const key=[r.sku,region,r.quantityMin,r.quantityMax].join('|');
   if(costs.has(key)&&costs.get(key).costPrice!==r.costPrice)throw Error('Conflicting stored costs require review.');
   costs.set(key,{sku:r.sku,region,quantityMin:r.quantityMin,quantityMax:r.quantityMax,costPrice:r.costPrice,source:r.source,sourceDate:r.sourceDate,vendor:r.vendor||''});
  }
  data.legacyCosts=[...costs.values()];
 }
 const products=new Map([...current.rows,...(current.cards||[])].map(r=>[r.sku,r.product]));
 data.rows=preview.rows.map(r=>{
  if(!products.has(r.sku))throw Error(`Unknown NetSuite card ${r.sku}.`);
  return {sku:r.sku,product:products.get(r.sku),tier:r.level,quantityMin:r.quantityMin,quantityMax:r.quantityMax,quantityLabel:`${r.quantityMin.toLocaleString('en-US')}–${r.quantityMax===null?'∞':r.quantityMax.toLocaleString('en-US')}`,sellingPrice:r.sellingPrice,costPrice:null,grossProfit:null,marginPercent:null,source:`NetSuite / ${r.level}`,sourceDate:date,category:'NetSuite selling prices'};
 });
 data.priceSource='netsuite';data.generatedAt=[date,data.costsCheckedAt||''].sort().at(-1);data.netsuiteFetchedAt=preview.fetchedAt;
 return {data,changes:data.rows.map(r=>{const existing=current.rows.filter(x=>x.sku===r.sku&&x.tier===r.tier);const exact=existing.find(x=>x.quantityMin===r.quantityMin&&x.quantityMax===r.quantityMax);return {...r,before:exact?.sellingPrice??(existing.length?'Different quantity bands':null),displayCost:null};}),pairs:new Set(preview.rows.map(r=>r.sku+'|'+r.level)).size,operation:{kind:'netsuite',date,preview:structuredClone(preview),mapping:{}}};
}
