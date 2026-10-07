import {validateDirect,prepareDirect} from './netsuite-direct.mjs';
import {SUPPORTED_TIERS} from './pricing-import.mjs?v=20261005-sheet';
export const LEVELS=['EMEA License Customers','Base','Distributor'];
export function validateNetSuite(preview){
 if(preview?.version===2)return validateDirect(preview);
 if(preview?.version!==1||preview.currency!=='USD'||preview.unit!=='Each'||!Number.isFinite(Date.parse(preview.fetchedAt))||!Array.isArray(preview.rows)||!preview.rows.length||preview.rows.length>20000)throw Error('Invalid NetSuite preview. Run Sync NetSuite again.');
 const groups=new Map();
 for(const r of preview.rows){
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(r.sku)||!LEVELS.includes(r.level)||!Number.isSafeInteger(r.quantityMin)||r.quantityMin<1||(r.quantityMax!==null&&(!Number.isSafeInteger(r.quantityMax)||r.quantityMax<r.quantityMin))||!Number.isFinite(r.sellingPrice)||r.sellingPrice<0||r.sellingPrice>1e12)throw Error('Invalid NetSuite price or quantity band.');
  const key=r.sku+'|'+r.level;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);
 }
 for(const rows of groups.values()){rows.sort((a,b)=>a.quantityMin-b.quantityMin);for(let i=1;i<rows.length;i++)if(rows[i].quantityMin<=(rows[i-1].quantityMax??Infinity))throw Error('Overlapping NetSuite quantity bands.');}
 return preview;
}
const covers=(r,q)=>r.quantityMin<=q&&(r.quantityMax===null||q<=r.quantityMax);
export function prepareNetSuite(current,preview,mapping){
 if(preview?.version===2)return prepareDirect(current,preview);
 if(current.priceSource==='netsuite')throw Error('A complete NetSuite snapshot is required.');
 validateNetSuite(preview);
 const selected=Object.entries(mapping).filter(([,v])=>v);
 if(!selected.length)throw Error('Choose at least one website price type to update.');
 if(selected.some(([k,v])=>!LEVELS.includes(k)||!SUPPORTED_TIERS.includes(v))||new Set(selected.map(([,v])=>v)).size!==selected.length)throw Error('Each NetSuite level must map to a different supported website price type.');
 const data=structuredClone(current),pairs=new Map(),changes=[];
 for(const r of preview.rows){if(!mapping[r.level])continue;const key=r.sku+'|'+mapping[r.level];if(!pairs.has(key))pairs.set(key,[]);pairs.get(key).push(r);}
 for(const [key,bands] of pairs){
  const sku=bands[0].sku,tier=mapping[bands[0].level],existing=current.rows.filter(r=>r.sku===sku),old=existing.filter(r=>r.tier===tier),card=current.cards?.find(r=>r.sku===sku)||existing[0];
  if(!card)throw Error(`Unknown card ${sku}. Register it before syncing.`);
  const costs=current.costBands.filter(c=>c.sku===sku&&(!c.region||c.region==='EMEA'));
  data.rows=data.rows.filter(r=>!(r.sku===sku&&r.tier===tier));
  for(const b of bands){
   const cuts=new Set([b.quantityMin]);for(const r of [...old,...costs])for(const p of [r.quantityMin,r.quantityMax===null?null:r.quantityMax+1])if(p!==null&&p>b.quantityMin&&(b.quantityMax===null||p<=b.quantityMax))cuts.add(p);
   const bounds=[...cuts].sort((a,b)=>a-b);
   for(let i=0;i<bounds.length;i++){
    const min=bounds[i],max=bounds[i+1]?bounds[i+1]-1:b.quantityMax,previous=old.find(r=>covers(r,min)),cost=costs.find(r=>covers(r,min))?.costPrice??previous?.costPrice??null,gp=cost===null?null:b.sellingPrice-cost;
    const row={...previous,sku,product:card.product,tier,region:'EMEA',quantityMin:min,quantityMax:max,quantityLabel:`${min.toLocaleString('en-US')}–${max===null?'∞':max.toLocaleString('en-US')}`,sellingPrice:b.sellingPrice,costPrice:previous?.costPrice??null,grossProfit:gp,marginPercent:gp===null||b.sellingPrice===0?null:gp/b.sellingPrice,source:`NetSuite / ${b.level}`,sourceDate:preview.fetchedAt.slice(0,10),category:'NetSuite selling prices'};
    data.rows.push(row);changes.push({...row,before:previous?.sellingPrice??null,displayCost:cost});
   }
  }
 }
 data.generatedAt=preview.fetchedAt.slice(0,10);
 if(data.rows.length>20000||JSON.stringify(data).length>1000000)throw Error('Updated pricing exceeds the supported size.');
 return {data,changes,pairs:pairs.size,operation:{kind:'netsuite',date:data.generatedAt,preview:structuredClone(preview),mapping:{...mapping}}};
}
