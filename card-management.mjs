const clone=value=>JSON.parse(JSON.stringify(value));
export function listCards(data){
 return [...new Map([...(data.cards||[]),...data.rows].map(r=>[r.sku,{sku:r.sku,product:r.product}])).values()].sort((a,b)=>a.sku.localeCompare(b.sku));
}
export function cardSnapshot(data,sku){
 return JSON.stringify({card:listCards(data).find(c=>c.sku.toLowerCase()===sku.toLowerCase())||null,rows:data.rows.filter(r=>r.sku.toLowerCase()===sku.toLowerCase()),costBands:data.costBands.filter(r=>r.sku.toLowerCase()===sku.toLowerCase())});
}
export function prepareCardUpdate(current,{action,originalSku,sku='',product=''},date=new Date().toISOString().slice(0,10)){
 if(!['add','edit','delete'].includes(action))throw new Error('Choose a card action.');
 const cards=listCards(current),original=cards.find(c=>c.sku===originalSku);
 if(action!=='add'&&!original)throw new Error('This card no longer exists. Close Manage Cards and reopen it.');
 sku=String(sku).trim();product=String(product).trim();
 if(action!=='delete'){
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(sku))throw new Error('Enter a valid SKU (letters, numbers, dots, underscores or hyphens).');
  if(!product||product.length>300||/[\x00-\x1f]/.test(product))throw new Error('Enter a Card Product Name of 1–300 characters.');
  if([...cards,...current.costBands].some(c=>c.sku.toLowerCase()===sku.toLowerCase()&&(action==='add'||c.sku!==originalSku)))throw new Error('That SKU already exists. Choose a unique SKU.');
  if(action==='edit'&&original.sku===sku&&original.product===product)throw new Error('No card details changed.');
 }
 const data=clone(current);
 data.cards=cards.filter(c=>c.sku!==originalSku||action==='add');
 if(action!=='delete')data.cards.push({sku,product});
 data.cards.sort((a,b)=>a.sku.localeCompare(b.sku));
 if(action==='delete'){
  data.rows=data.rows.filter(r=>r.sku!==originalSku);
  data.costBands=data.costBands.filter(r=>r.sku!==originalSku);
 }else if(action==='edit'){
  data.rows=data.rows.map(r=>r.sku===originalSku?{...r,sku,product}:r);
  data.costBands=data.costBands.map(r=>r.sku===originalSku?{...r,sku,...('product' in r?{product}:{})}:r);
 }
 data.generatedAt=date;
 if(data.cards.length>20000||new TextEncoder().encode(JSON.stringify(data)).length>1000000)throw new Error('The updated pricing dataset exceeds the supported size.');
 return {data,action,original,sku:action==='delete'?originalSku:sku,product:action==='delete'?original.product:product};
}
