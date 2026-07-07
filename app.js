const state = {
  rows: [],
  filtered: [],
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

function renderRows(rows) {
  const visibleRows = rows.slice(0, 150);
  if (!visibleRows.length) {
    el.body.innerHTML = `<div class="empty">No matching results yet.</div>`;
    return;
  }

  el.body.innerHTML = visibleRows
    .map(
      (row) => `
        <article class="result-card">
          <div class="result-meta">
            <div>
              <span>${row.quantityLabel || "Any quantity"}</span>
              <span>${displayTier(row.tier)}</span>
            </div>
            <strong>${row.sku}</strong>
          </div>
          <div class="price-row">
            <span>Sell Price</span>
            <strong>${money(row.sellingPrice)}</strong>
          </div>
          <div class="price-row">
            <span>Cost Price</span>
            <strong>${bracketMoney(row.costPrice)}</strong>
          </div>
          <div class="price-row">
            <span>Gross Profit</span>
            <strong>${money(row.grossProfit)}</strong>
          </div>
          <div class="price-row">
            <span>Margin</span>
            <strong>${percent(row.marginPercent)}</strong>
          </div>
        </article>
      `
    )
    .join("");
}

function applyFilters() {
  const product = el.product.value;
  const qty = Number(el.quantity.value);
  const tier = el.tier.value;

  const filtered = state.rows.filter((row) => {
    if (!row.tier.includes("EMEA")) return false;
    if (product && `${row.sku} - ${row.product}` !== product) return false;
    if (tier && row.tier !== tier) return false;
    if (!inQuantityRange(row, Number.isFinite(qty) && qty > 0 ? qty : null)) return false;
    return true;
  });

  state.filtered = filtered;
  renderRows(filtered);
}

function boot() {
  const data = window.PRICING_DATA;
  if (!data || !Array.isArray(data.rows)) {
    throw new Error("Pricing data is missing");
  }
  state.rows = data.rows;

  const products = uniqueSorted(
    state.rows.map((row) => ({ label: `${row.sku} - ${row.product}` })),
    "label"
  );
  fillSelect(el.product, products, "All products");
  const availableTiers = new Set(
    state.rows.filter((row) => row.tier.includes("EMEA")).map((row) => row.tier)
  );
  const emeaTiers = tierOptions.filter((option) => availableTiers.has(option.value));
  fillSelect(el.tier, emeaTiers, "All EMEA prices");
  if (availableTiers.has("Base Price (EMEA Premium)")) {
    el.tier.value = "Base Price (EMEA Premium)";
  }

  for (const input of [el.product, el.quantity, el.tier]) {
    input.addEventListener("input", applyFilters);
    input.addEventListener("change", applyFilters);
  }

  applyFilters();
}

try {
  boot();
} catch (error) {
  console.error(error);
  el.body.innerHTML = `<div class="empty">Failed to load pricing data.</div>`;
}
