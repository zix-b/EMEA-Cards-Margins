# Pricing Lookup Prototype

Mobile-friendly pricing lookup tool for quick sales quoting.

## What It Does

- Lets the user choose a product.
- Lets the user enter a quantity.
- Shows EMEA pricing first.
- Displays only the essential quote numbers:
  - Sell Price
  - Cost Price
  - Gross Profit
  - Margin

## Current Data Scope

This prototype currently uses the `03 Dec 2025` pricing tab and includes:

- `CRD-004`
- `CRD-012`
- `CTC-007`
- `CTC-008`
- `CTC-011`
- `CTC-031`
- `CTM-003`
- `CTM-004`
- `LIC-009`

The revised OPPIOT pricing file is not used yet.

## How To Open Locally

Open this file in a browser:

```txt
index.html
```

No build step is required. This is a static prototype using plain HTML, CSS, and JavaScript.

## Main Files

- `index.html` - page structure
- `styles.css` - mobile-friendly layout and styling
- `app.js` - filtering and display logic
- `pricing-data.js` - browser-ready pricing data
- `pricing-data.json` - raw pricing data export
- `build-data.py` - script used to rebuild pricing data from the Excel source

## Important

This repo contains cost and margin data. Keep it private unless the data is sanitized.
