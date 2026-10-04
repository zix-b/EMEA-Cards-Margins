const state = {
  rows: [],
  costBands: [],
  filtered: [],
  quantity: null,
};

const el = {
  product: document.querySelector("#productSelect"),
  quantity: document.querySelector("#quantityInput"),
  tier: document.querySelector("#tierSelect"),
  body: document.querySelector("#resultsBody"),
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 3,
  maximumFractionDigits: 4,
});

const tierOptions = [
  {
    value: "Standard Price (EMEA License)",
    label: "Standard Price (EMEA License)",
  },
  {
    value: "Base Price (EMEA Premium)",
    label: "Base Price (EMEA Premium)",
  },
  {
    value: "Distributor Price (EMEA)",
    label: "Distributor Price (EMEA)",
  },
  {
    value: "EMEA Strategic Account (Magic Planet)",
    label: "EMEA Strategic Account (MAF)",
  },
];

function money(value) {
  return Number.isFinite(value) ? currency.format(value) : "-";
}

function bracketMoney(value) {
  return Number.isFinite(value) ? `(${currency.format(value)})` : "-";
}

function percent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "-";
}

function inQuantityRange(row, qty) {
  if (!qty) return true;
  const min = row.quantityMin ?? 0;
  const max = row.quantityMax;
  if (qty < min) return false;
  if (max !== null && max !== undefined && qty > max) return false;
  return true;
}

function findCostBand(sku, qty) {
  if (!qty) return null;
  return (
    state.costBands.find((band) => {
      if (band.sku !== sku) return false;
      const min = band.quantityMin ?? 0;
      const max = band.quantityMax;
      if (qty < min) return false;
      if (max !== null && max !== undefined && qty > max) return false;
      return true;
    }) || null
  );
}

function displayMetrics(row) {
  const costBand = findCostBand(row.sku, state.quantity);
  const costPrice = costBand?.costPrice ?? row.costPrice;
  const grossProfit =
    Number.isFinite(row.sellingPrice) && Number.isFinite(costPrice)
      ? row.sellingPrice - costPrice
      : null;
  const marginPercent =
    Number.isFinite(grossProfit) && row.sellingPrice
      ? grossProfit / row.sellingPrice
      : null;
  return { costPrice, grossProfit, marginPercent };
}

function uniqueSorted(rows, key) {
  return [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function fillSelect(select, values, firstLabel) {
  select.innerHTML = `<option value="">${firstLabel}</option>`;
  for (const value of values) {
    const option = document.createElement("option");
    option.value = typeof value === "string" ? value : value.value;
    option.textContent = typeof value === "string" ? value : value.label;
    select.appendChild(option);
  }
}

function displayTier(tier) {
  return tierOptions.find((option) => option.value === tier)?.label || tier;
}

function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#39;"}[c])); }

const costLabels = {oppiot:'OPPIOT supplier cost', supplier_purchase:'Supplier purchase price', average_cost:'Average cost', last_purchase:'Last purchase price'};
function bandLabel(row) {
  return row.quantityMax == null ? `${(row.quantityMin ?? 1).toLocaleString()}+` : `${(row.quantityMin ?? 1).toLocaleString()}–${row.quantityMax.toLocaleString()}`;
}
function renderRows(rows) {
  if (!rows.length) {
    el.body.innerHTML = '<div class="empty">No applicable selling price for this quantity and price type.</div>';
    return;
  }
  el.body.innerHTML = rows.map(row => {
    const metrics = displayMetrics(row);
    const cost = findCostBand(row.sku, state.quantity);
    const source = cost ? `${costLabels[cost.costBasis] || 'OPPIOT supplier cost'}: ${cost.source} · ${bandLabel(cost)} units · source date ${cost.sourceDate}` : Number.isFinite(row.costPrice) ? `Stored cost from the pricing row · ${row.vendor || row.source} · ${bandLabel(row)} units` : 'No matching cost is available. Margin cannot be determined.';
    return `<article class="result-card">
      <div class="result-meta"><div><span class="sku">${escapeHtml(row.sku)}</span><h3>${escapeHtml(row.product)}</h3></div><span class="tier-badge">${escapeHtml(displayTier(row.tier))}</span></div>
      <div class="metrics"><div class="metric"><span>Sell price</span><strong>${money(row.sellingPrice)}</strong></div><div class="metric"><span>Cost price</span><strong>${bracketMoney(metrics.costPrice)}</strong></div><div class="metric"><span>Unit gross profit</span><strong>${money(metrics.grossProfit)}</strong></div><div class="metric margin"><span>Margin</span><strong>${percent(metrics.marginPercent)}</strong></div></div>
      ${Number.isFinite(metrics.costPrice) ? '' : '<p class="unavailable">No applicable cost record. Margin unavailable.</p>'}
      <details><summary>Price sources &amp; quantity bands${state.quantity === null ? ' · '+escapeHtml(bandLabel(row)) : ''}</summary><p>Selling: ${escapeHtml(row.source)} · ${escapeHtml(bandLabel(row))} units · source date ${escapeHtml(row.sourceDate)}</p><p>${escapeHtml(source)}</p></details>
    </article>`;
  }).join('');
}
function applyFilters() {
  const product = el.product.value, tier = el.tier.value;
  const raw = el.quantity.value.trim(), qty = Number(raw);
  const valid = raw === '' || (Number.isSafeInteger(qty) && qty > 0 && qty <= 1e12);
  el.quantity.setAttribute('aria-invalid', String(!valid));
  document.querySelector('#quantityError').textContent = valid ? '' : 'Enter a whole-number quantity between 1 and 1 trillion, or leave blank for all bands.';
  state.quantity = raw && valid ? qty : null;
  const products = el.product.options.length - 1;
  document.querySelector('#cardPosition').textContent = product ? `${el.product.selectedIndex} of ${products} · ${product.split(' - ')[0]}` : `All ${products} cards`;
  document.querySelector('#resultTitle').textContent = product ? 'Your quote' : 'All cards';
  if (!valid) { el.body.innerHTML=''; return; }
  state.filtered = state.rows.filter(row => row.tier.includes('EMEA') && (!product || `${row.sku} - ${row.product}` === product) && (!tier || row.tier === tier) && inQuantityRange(row,state.quantity));
  renderRows(state.filtered);
}
function setData(data, initial=false) {
  if (!data || !Array.isArray(data.rows)) throw new Error('Pricing data is missing.');
  const selected=el.product.value, selectedTier=el.tier.value;
  state.rows=data.rows;state.costBands=Array.isArray(data.costBands)?data.costBands:[];
  const registered=[...new Map([...(data.cards||[]),...state.rows.filter(r=>r.tier.includes('EMEA'))].map(r=>[r.sku,r])).values()];
  const products=uniqueSorted(registered.map(r=>({label:`${r.sku} - ${r.product}`})),'label');
  fillSelect(el.product,products,'All cards');
  el.product.value=initial ? products.find(p=>p.startsWith('CTC-007 - '))||'' : products.includes(selected)?selected:'';
  const available=new Set(state.rows.filter(r=>r.tier.includes('EMEA')).map(r=>r.tier));
  fillSelect(el.tier,tierOptions.filter(t=>available.has(t.value)),'All EMEA prices');
  el.tier.value=initial ? available.has(tierOptions[1].value)?tierOptions[1].value:'' : available.has(selectedTier)?selectedTier:'';
  el.product.disabled=false;el.tier.disabled=false;
  const uploaded=state.rows.filter(r=>r.category==='Admin pricing upload');
  const notice=document.querySelector('#dataNotice');
  notice.textContent=uploaded.length ? 'Pricing includes admin-approved uploads. Source dates and cost details are shown with each quote. Unchanged cards retain their existing prices.' : '';
  notice.hidden=!uploaded.length;
  document.querySelector('#dataDate').textContent=`Dataset: ${data.generatedAt || 'Date unavailable'}`;
  applyFilters();
}
let fingerprint='',refreshing=false,refreshFailed=false;
async function refreshData() {
  if (refreshing || document.hidden) return;
  refreshing=true;
  try {
    const response=await fetch('pricing-data.json',{cache:'no-store'});
    if(!response.ok)throw new Error('Pricing refresh failed.');
    const data=await response.json(),next=JSON.stringify(data);
    if(next!==fingerprint||refreshFailed){setData(data);fingerprint=next;}refreshFailed=false;
  } catch(error) {
    refreshFailed=true;
    document.querySelector('#dataNotice').hidden=false;
    document.querySelector('#dataNotice').textContent='Pricing could not be refreshed. The previously loaded dataset is still displayed; reload before relying on updated prices.';
  } finally {refreshing=false;}
}
function boot() {
  setData(window.PRICING_DATA,true);fingerprint=JSON.stringify(window.PRICING_DATA);
  for(const input of [el.product,el.quantity,el.tier]) {
    input.addEventListener('input',applyFilters);input.addEventListener('change',applyFilters);
  }
  for(const [id,step] of [['previousCard',-1],['nextCard',1]])document.querySelector(`#${id}`).addEventListener('click',()=>{
    const count=el.product.options.length-1;if(!count)return;const i=el.product.selectedIndex;
    el.product.selectedIndex=i===0?(step===1?1:count):((i-1+step+count)%count)+1;applyFilters();
  });
  window.addEventListener('focus',refreshData);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshData();});
  refreshData();
  setInterval(refreshData,15000);
}
try {boot();} catch(error) {console.error(error);el.body.innerHTML='<div class="empty">Failed to load pricing data. Please reload.</div>';}
