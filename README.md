# EMEA Cards Margins

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
- `CTM-003`
- `CTM-004`
- `LIC-009`

The saved pricing dataset includes revised OPPIOT supplier cost bands.

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

## Admin ZIP updates (original GitHub Pages website)

Open `admin.html` from the calculator’s Admin portal link. ZIP validation and preview work before sign-in; publishing requires GitHub authorization and a new preview against the current repository snapshot. This is part of the same GitHub Pages site; there is no separate hosted backend. The browser validates the ZIP and uses GitHub's API to commit `pricing-data.json` and `pricing-data.js` together on `main`. The existing Pages workflow then deploys the same original URL. GitHub repository permissions authorize writes; visiting the admin page alone grants no access.

An administrator supplies a fine-grained token restricted to `zix-b/EMEA-Cards-Margins`, with **Contents: Read and write**. Keep it out of chat and source control. The portal keeps it only in memory, sends it only to `api.github.com`, and clears it on disconnect/navigation. A successful commit is not a successful deployment; use the linked GitHub Actions page to confirm deployment. Branch protection is respected and may require a maintainer's normal review workflow instead of direct publication.

Upload `selling.csv` and `costs.csv` at the ZIP root (UTF-8). A blank `costs.csv` header is allowed; unknown costs never become zero. Download `pricing-upload-template.zip` for the exact headers. The selected cost basis must match all uploaded cost rows. A single approved fixed cost uses quantityMin=1 and blank quantityMax. Both quantity endpoints are inclusive. Currency is USD, unit Each. NetSuite price levels and the EMEA applicability of costs must be verified before use.

The existing calculator's first matching cost band and stored-cost fallback are preserved. Uploads must be **current snapshots**, with no overlapping bands even across different source dates and no future dates. Source dates remain provenance, not an automatic scheduling feature. Upload behavior is explicitly selected: replace all records for included SKUs, or replace the entire dataset. Preview lists products removed by full replacement. Imported selling rows are split at cost boundaries so the original no-quantity view and visualizer also retain consistent stored costs/margins. Missing-cost gaps remain null. Unchanged SKUs retain their original records exactly.

Limits: 5 MB compressed, 15 MB expanded, 20,000 CSV rows, 1 MB combined pricing data. The archive is not committed; only validated normalized pricing is saved. Prices and source descriptions are public, like the original repository.

The original XLSX importer `build-data.py` and pricing files remain unchanged until an administrator explicitly publishes an update. The calculator now matches the reference rebuild’s light layout, purple quote headers, four metrics and source details. It defaults to CTC-007, quantity 10,000 and Premium. The original blank-quantity view, all-tier option, formulas, independent cost lookup and stored-cost fallback are retained. Prices display three to four decimal places as in the rebuild; margins display one decimal place. Invalid or fractional quantities are rejected. The existing visualizer keeps its original stylesheet. The original dataset is not replaced by the CTC-007 NetSuite example. Previous/next card controls preserve quantity and tier. Uploaded display strings are escaped in both the calculator and visualizer.

### Checks before deployment

Run from the repository root with Node.js:

```
node tests/calculator.test.mjs
node tests/import.test.mjs
node tests/github.test.mjs
node tests/admin.test.mjs
```

The calculator test compares all saved rows across quantity boundaries against original commit `c37642af474e266f9ac7a9c5db5a3a3639cbf3ea`. The import and publication tests use synthetic data and mocked GitHub writes; they never publish test pricing. Git history provides rollback of both code and pricing.
