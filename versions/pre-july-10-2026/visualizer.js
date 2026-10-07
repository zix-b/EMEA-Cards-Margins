const visualizerState = {
  rows: [],
};

const visualizerEl = {
  product: document.querySelector("#productFilter"),
  tier: document.querySelector("#tierFilter"),
  view: document.querySelector("#viewFilter"),
  stats: document.querySelector("#statGrid"),
  productBars: document.querySelector("#productBars"),
  tierBars: document.querySelector("#tierBars"),
  coverageCount: document.querySelector("#coverageCount"),
  tierCount: document.querySelector("#tierCount"),
  rowCount: document.querySelector("#rowCount"),
  rowsBody: document.querySelector("#rowsBody"),
};

const vizCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});

const tierLabels = new Map([
  ["Standard Price (EMEA License)", "Standard Price (EMEA License)"],
  ["Base Price (EMEA Premium)", "Base Price (EMEA Premium)"],
  ["Distributor Price (EMEA)", "Distributor Price (EMEA)"],
  ["EMEA Strategic Account (Magic Planet)", "EMEA Strategic Account (MAF)"],
]);

function money(value) {
  return Number.isFinite(value) ? vizCurrency.format(value) : "-";
}

function percent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "-";
}

function displayTier(tier) {
  return tierLabels.get(tier) || tier;
}

function isEmea(row) {
  return row.tier.includes("EMEA");
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function groupRows(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function fillSelect(select, values, firstLabel) {
  select.innerHTML = `<option value="">${firstLabel}</option>`;
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
}

function rowStatus(row) {
  if (!Number.isFinite(row.costPrice)) return { label: "Missing cost", level: "danger" };
  if (!Number.isFinite(row.marginPercent)) return { label: "No margin", level: "danger" };
  if (row.marginPercent < 0.4) return { label: "Low margin", level: "warn" };
  if (row.marginPercent >= 0.65) return { label: "Strong", level: "good" };
  return { label: "Normal", level: "neutral" };
}

function filteredRows() {
  const product = visualizerEl.product.value;
  const tier = visualizerEl.tier.value;
  const view = visualizerEl.view.value;

  return visualizerState.rows.filter((row) => {
    if (product && `${row.sku} - ${row.product}` !== product) return false;
    if (tier && row.tier !== tier) return false;
    if (view === "emea" && !isEmea(row)) return false;
    if (view === "missing-cost" && Number.isFinite(row.costPrice)) return false;
    if (view === "low-margin" && (!Number.isFinite(row.marginPercent) || row.marginPercent >= 0.4)) return false;
    return true;
  });
}

function renderStats(rows) {
  const emeaRows = rows.filter(isEmea);
  const missingCosts = rows.filter((row) => !Number.isFinite(row.costPrice));
  const avgMargin = average(rows.map((row) => row.marginPercent));
  const products = uniqueSorted(rows.map((row) => row.sku));

  const stats = [
    ["Rows shown", rows.length],
    ["Products", products.length],
    ["EMEA rows", emeaRows.length],
    ["Missing cost", missingCosts.length],
    ["Avg margin", percent(avgMargin)],
  ];

  visualizerEl.stats.innerHTML = stats
    .map(
      ([label, value]) => `
        <article class="stat-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");
}

function renderBars(target, groups, labelFn) {
  const summaries = [...groups.entries()]
    .map(([key, rows]) => ({
      key,
      rows,
      count: rows.length,
      missing: rows.filter((row) => !Number.isFinite(row.costPrice)).length,
      avgMargin: average(rows.map((row) => row.marginPercent)),
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  const maxCount = Math.max(...summaries.map((item) => item.count), 1);

  target.innerHTML = summaries
    .map((item) => {
      const width = Math.max(6, Math.round((item.count / maxCount) * 100));
      return `
        <div class="bar-row">
          <div class="bar-copy">
            <strong>${labelFn(item.key)}</strong>
            <span>${item.count} rows · ${item.missing} missing cost · avg ${percent(item.avgMargin)}</span>
          </div>
          <div class="bar-track" aria-hidden="true">
            <div class="bar-fill" style="width:${width}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderRows(rows) {
  const sorted = [...rows].sort((a, b) => {
    const order = { danger: 0, warn: 1, neutral: 2, good: 3 };
    return (
      order[rowStatus(a).level] - order[rowStatus(b).level] ||
      a.sku.localeCompare(b.sku) ||
      a.quantityMin - b.quantityMin
    );
  });

  visualizerEl.rowCount.textContent = `${sorted.length} rows`;
  visualizerEl.rowsBody.innerHTML = sorted
    .slice(0, 300)
    .map((row) => {
      const status = rowStatus(row);
      return `
        <tr>
          <td><strong>${row.sku}</strong><span>${row.product}</span></td>
          <td>${row.quantityLabel}</td>
          <td>${displayTier(row.tier)}</td>
          <td>${money(row.sellingPrice)}</td>
          <td>${money(row.costPrice)}</td>
          <td>${money(row.grossProfit)}</td>
          <td>${percent(row.marginPercent)}</td>
          <td><span class="status-pill ${status.level}">${status.label}</span></td>
        </tr>
      `;
    })
    .join("");
}

function render() {
  const rows = filteredRows();
  renderStats(rows);

  const productGroups = groupRows(rows, (row) => row.sku);
  visualizerEl.coverageCount.textContent = `${productGroups.size} products`;
  renderBars(visualizerEl.productBars, productGroups, (key) => key);

  const tierGroups = groupRows(rows, (row) => row.tier);
  visualizerEl.tierCount.textContent = `${tierGroups.size} types`;
  renderBars(visualizerEl.tierBars, tierGroups, displayTier);

  renderRows(rows);
}

function bootVisualizer() {
  const data = window.PRICING_DATA;
  if (!data || !Array.isArray(data.rows)) {
    throw new Error("Pricing data is missing");
  }

  visualizerState.rows = data.rows;
  fillSelect(
    visualizerEl.product,
    uniqueSorted(data.rows.map((row) => `${row.sku} - ${row.product}`)),
    "All products"
  );
  fillSelect(visualizerEl.tier, uniqueSorted(data.rows.map((row) => row.tier)), "All price types");

  for (const input of [visualizerEl.product, visualizerEl.tier, visualizerEl.view]) {
    input.addEventListener("input", render);
    input.addEventListener("change", render);
  }

  render();
}

try {
  bootVisualizer();
} catch (error) {
  console.error(error);
  visualizerEl.stats.innerHTML = `<div class="empty">Failed to load pricing data.</div>`;
}
