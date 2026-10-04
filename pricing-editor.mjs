import {TIERS,BASES} from './pricing-import.mjs';
export {TIERS,BASES};
export const QUANTITIES=[0,5000,10000,25000,50000,100000,250000,500000];
export const tierLabel=tier=>tier===TIERS[3]?'EMEA Strategic Account (MAF)':tier;
export const rangeLabel=(min,max)=>`${min.toLocaleString('en-US')}–${max===null?'∞':max.toLocaleString('en-US')}`;
const clone=value=>JSON.parse(JSON.stringify(value));
const ceiling=row=>row.quantityMax??Infinity;
const price=value=>{
 const text=String(value).trim();
 if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)||!Number.isFinite(Number(text))||Number(text)>1e12)throw new Error('Enter a numeric, non-negative price in every populated cell (no currency symbols or commas).');
 return Number(text);
};
export function cards(data){return [...new Map(data.rows.map(r=>[r.sku,{sku:r.sku,product:r.product}])).values()].sort((a,b)=>a.sku.localeCompare(b.sku));}
export function createMatrix(data,sku,isNew=false){
 if(!isNew&&!data.rows.some(r=>r.sku===sku))throw new Error('Select an existing card.');
 return TIERS.map(tier=>({tier,cells:QUANTITIES.map((q,col)=>{
  const min=q||1,max=QUANTITIES[col+1]?QUANTITIES[col+1]-1:null;
  const rows=isNew?[]:data.rows.map((r,index)=>({...r,index})).filter(r=>r.sku===sku&&r.tier===tier);
  const ordered=[...rows].sort((a,b)=>a.quantityMin-b.quantityMin);
  for(let i=1;i<ordered.length;i++)if(ordered[i].quantityMin<=ceiling(ordered[i-1]))throw new Error('This card has overlapping selling bands. Resolve them through the ZIP import before editing.');
  const cuts=new Set([min]);
  for(const r of rows){if(r.quantityMin>min&&r.quantityMin<=(max??Infinity))cuts.add(r.quantityMin);if(r.quantityMax!==null&&r.quantityMax>=min&&r.quantityMax<(max??Infinity))cuts.add(r.quantityMax+1);}
  const bounds=[...cuts].sort((a,b)=>a-b);
  return bounds.map((lo,i)=>{const hi=i+1<bounds.length?bounds[i+1]-1:max,r=rows.find(r=>lo>=r.quantityMin&&lo<=ceiling(r));return {tier,min:lo,max:hi,index:r?.index??null,original:r?.sellingPrice??null,value:r?String(r.sellingPrice):''};});
 })}));
}
function rowFor(segment,value,original,sku,product,date,cost){
 const costPrice=original?original.costPrice:cost?.costPrice??null;
 const gp=Number.isFinite(costPrice)?value-costPrice:null;
 return {...original,sku,product,tier:segment.tier,quantityMin:segment.min,quantityMax:segment.max,quantityLabel:rangeLabel(segment.min,segment.max),sellingPrice:value,costPrice,grossProfit:gp,marginPercent:gp===null||value===0?null:gp/value,source:'Admin Price Editor',sourceDate:date,category:'Admin price editor',vendor:original?.vendor||cost?.source||''};
}
export function prepareEditorUpdate(current,{sku,product,matrix,isNew=false,costPrice,costBasis},date=new Date().toISOString().slice(0,10)){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Invalid source date.');
 sku=String(sku).trim();product=String(product).trim();
 if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(sku))throw new Error('Enter a valid SKU (letters, numbers, dots, underscores or hyphens).');
 if(!product||product.length>300||/[\x00-\x1f]/.test(product))throw new Error('Enter a product name of 1–300 characters.');
 if(isNew&&[...current.rows,...current.costBands].some(r=>r.sku.toLowerCase()===sku.toLowerCase()))throw new Error('That SKU already exists in selling or cost data. Select the existing card or use a ZIP update.');
 const expected=createMatrix(current,sku,isNew);
 if(JSON.stringify(matrix.map(r=>({tier:r.tier,cells:r.cells.map(c=>c.map(({value,...s})=>s))})))!==JSON.stringify(expected.map(r=>({tier:r.tier,cells:r.cells.map(c=>c.map(({value,...s})=>s))}))))throw new Error('The pricing table changed. Reload the card before saving.');
 if(!isNew&&current.rows.find(r=>r.sku===sku)?.product!==product)throw new Error('Existing card names cannot be changed in the price editor.');
 const segments=matrix.flatMap(r=>r.cells.flat());
 const changes=segments.filter(s=>{
  if(String(s.value).trim()===''&&s.original===null&&!isNew)return false;
  const value=price(s.value);return s.original===null||value!==s.original;
 });
 if(!changes.length)throw new Error('No prices changed.');
 const data=clone(current);
 let newCost;
 if(isNew){if(!BASES.includes(costBasis))throw new Error('Choose a cost basis for the new card.');newCost={sku,quantityMin:1,quantityMax:null,costPrice:price(costPrice),costBasis,currency:'USD',unit:'Each',source:'Admin Price Editor',sourceDate:date};data.costBands.push(newCost);}
 const changedIndexes=new Set(changes.filter(s=>s.index!==null).map(s=>s.index));
 data.rows=data.rows.flatMap((row,index)=>{
  if(!changedIndexes.has(index))return [row];
  return segments.filter(s=>s.index===index).map(s=>{
   const value=price(s.value);
   if(value===s.original)return {...row,quantityMin:s.min,quantityMax:s.max,quantityLabel:rangeLabel(s.min,s.max)};
   return rowFor(s,value,row,sku,product,date);
  });
 });
 for(const s of changes.filter(s=>s.index===null)){
  // Preserve independent supplier bands when a previously missing selling band is added.
  const costs=data.costBands.filter(c=>c.sku===sku),cuts=new Set([s.min]);
  for(const c of costs){if(c.quantityMin>s.min&&c.quantityMin<=ceiling({quantityMax:s.max}))cuts.add(c.quantityMin);if(c.quantityMax!==null&&c.quantityMax>=s.min&&c.quantityMax<ceiling({quantityMax:s.max}))cuts.add(c.quantityMax+1);}
  const bounds=[...cuts].sort((a,b)=>a-b);
  for(let i=0;i<bounds.length;i++){const min=bounds[i],max=i+1<bounds.length?bounds[i+1]-1:s.max,cost=costs.find(c=>min>=c.quantityMin&&min<=ceiling(c));data.rows.push(rowFor({...s,min,max},price(s.value),null,sku,product,date,cost));}
 }
 data.generatedAt=date;
 if(data.rows.length>20000||new TextEncoder().encode(JSON.stringify(data)).length>1000000)throw new Error('The updated pricing dataset exceeds the supported size.');
 return {data,changes:changes.map(s=>({tier:s.tier,min:s.min,max:s.max,before:s.original,after:price(s.value)})),sku,product,isNew};
}
