import {listCards} from './card-management.mjs?v=20261005-cards';
import {TIERS,BASES,SHEET_TIERS,SUPPORTED_TIERS} from './pricing-import.mjs?v=20261005-sheet';
export {TIERS,BASES,SHEET_TIERS,SUPPORTED_TIERS};
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
export const cards=listCards;
export function createMatrix(data,sku,isNew=false,requestedTiers=[]){
 if(!isNew&&!cards(data).some(r=>r.sku===sku))throw new Error('Select an existing card.');
 const rows=isNew?[]:data.rows.map((r,index)=>({...r,index})).filter(r=>r.sku===sku&&SUPPORTED_TIERS.includes(r.tier));
 // One shared set of column boundaries aligns all four price types without changing any existing bands.
 const cuts=new Set(QUANTITIES.map(q=>q||1));
 for(const r of rows){cuts.add(Math.max(1,r.quantityMin));if(r.quantityMax!==null)cuts.add(r.quantityMax+1);}
 const bounds=[...cuts].sort((a,b)=>a-b);
 const sheetRows=SHEET_TIERS.filter(tier=>rows.some(r=>r.tier===tier));
 if(requestedTiers.some(tier=>!SUPPORTED_TIERS.includes(tier)))throw new Error('Unsupported price type.');
 const tiers=[...new Set([...(sheetRows.length?[...sheetRows,...TIERS.filter(tier=>rows.some(r=>r.tier===tier))]:TIERS),...requestedTiers])];
 return tiers.map(tier=>{
  const tierRows=rows.filter(r=>r.tier===tier),ordered=[...tierRows].sort((a,b)=>a.quantityMin-b.quantityMin);
  for(let i=1;i<ordered.length;i++)if(ordered[i].quantityMin<=ceiling(ordered[i-1]))throw new Error('This card has overlapping selling bands. Resolve them through the ZIP import before editing.');
  return {tier,cells:bounds.map((min,i)=>{const max=i+1<bounds.length?bounds[i+1]-1:null,r=tierRows.find(r=>min>=r.quantityMin&&min<=ceiling(r));return [{tier,min,max,index:r?.index??null,original:r?.sellingPrice??null,value:r?String(r.sellingPrice):''}];})};
 });
}
export function rebaseDraft(previous,current,sku,matrix,isNew=false){
 const records=data=>({card:cards(data).find(c=>c.sku.toLowerCase()===sku.toLowerCase()),rows:data.rows.filter(r=>r.sku.toLowerCase()===sku.toLowerCase()),costBands:data.costBands.filter(r=>r.sku.toLowerCase()===sku.toLowerCase())});
 if(JSON.stringify(records(previous))!==JSON.stringify(records(current)))throw new Error('This card changed in GitHub while you were editing. Your draft is still visible. Cancel to reload the current prices before editing again.');
 const next=createMatrix(current,sku,isNew,matrix.map(r=>r.tier));
 for(let row=0;row<next.length;row++)for(let col=0;col<next[row].cells.length;col++)next[row].cells[col][0].value=matrix[row].cells[col][0].value;
 return next;
}

function rowFor(segment,value,original,sku,product,date,cost){
 const costPrice=original?original.costPrice:cost?.costPrice??null;
 const gp=Number.isFinite(costPrice)?value-costPrice:null;
 return {...original,sku,product,tier:segment.tier,quantityMin:segment.min,quantityMax:segment.max,quantityLabel:rangeLabel(segment.min,segment.max),sellingPrice:value,costPrice,grossProfit:gp,marginPercent:gp===null||value===0?null:gp/value,source:'Admin Price Editor',sourceDate:date,category:'Admin price editor',vendor:original?.vendor||cost?.source||''};
}
export function prepareEditorUpdate(current,{sku,product,matrix,isNew=false},date=new Date().toISOString().slice(0,10)){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Invalid source date.');
 sku=String(sku).trim();product=String(product).trim();
 if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(sku))throw new Error('Enter a valid SKU (letters, numbers, dots, underscores or hyphens).');
 if(!product||product.length>300||/[\x00-\x1f]/.test(product))throw new Error('Enter a product name of 1–300 characters.');
 if(isNew&&[...cards(current),...current.costBands].some(r=>r.sku.toLowerCase()===sku.toLowerCase()))throw new Error('That SKU already exists in selling or cost data. Select the existing card or use a ZIP update.');
 const expected=createMatrix(current,sku,isNew,matrix.map(r=>r.tier));
 if(JSON.stringify(matrix.map(r=>({tier:r.tier,cells:r.cells.map(c=>c.map(({value,...s})=>s))})))!==JSON.stringify(expected.map(r=>({tier:r.tier,cells:r.cells.map(c=>c.map(({value,...s})=>s))}))))throw new Error('The pricing table changed. Reload the card before saving.');
 if(!isNew&&cards(current).find(r=>r.sku===sku)?.product!==product)throw new Error('Existing card names cannot be changed in the price editor.');
 const segments=matrix.flatMap(r=>r.cells.flat());
 const changes=segments.filter(s=>{
  if(String(s.value).trim()===''&&s.original===null&&!isNew)return false;
  const value=price(s.value);return s.original===null||value!==s.original;
 });
 if(!changes.length)throw new Error('No prices changed.');
 const data=clone(current);
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
