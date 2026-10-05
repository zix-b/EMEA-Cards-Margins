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

## Admin selling-price uploads (original GitHub Pages website)

Open `admin.html` from the calculator’s Admin portal link. File validation and preview work before connecting GitHub; publishing requires GitHub authorization and a new preview against the current repository snapshot. This is part of the same GitHub Pages site; there is no separate hosted backend. The browser validates the pricing files and uses GitHub's API to commit `pricing-data.json` and `pricing-data.js` together on `main`. The existing Pages workflow then deploys the same original URL. GitHub repository permissions authorize writes; visiting the admin page alone grants no access.

An administrator supplies a fine-grained token restricted to `zix-b/EMEA-Cards-Margins`, with **Contents: Read and write**. Keep it out of chat and source control. The portal keeps it only in memory, sends it only to `api.github.com`, and clears it on disconnect/navigation. A successful commit is not a successful deployment; use the linked GitHub Actions page to confirm deployment. Branch protection is respected and may require a maintainer's normal review workflow instead of direct publication.

Upload CSV, Excel (.xlsx or .xls), or a ZIP containing one or more CSV/Excel pricing files. Download the CSV, Excel or ZIP template from the admin page. All formats use exactly the same columns, in this order:

`SKU`, `Card Product Name`, `Price Type`, `QTY 0`, `QTY 5,000`, `QTY 10,000`, `QTY 25,000`, `QTY 50,000`, `QTY 100,000`, `QTY 250,000`, `QTY 500,000`.

Use the four price-type names shown in the template. Repeat SKU and Card Product Name on each row. Enter non-negative numeric selling prices; zero is valid. Blank cells leave existing prices unchanged and remain unavailable on new cards. Omitted price types and unrelated SKUs are preserved. A populated quantity column applies through the next column's threshold minus one; the last column has no upper limit. QTY 0 starts at order quantity 1. The importer reuses the direct editor, preserving independent cost bands, stored costs and calculator formulas. No cost or technical fields belong in these files. New cards without existing costs show unavailable cost, gross profit and margin. Source dates are recorded internally on changed prices.

Every nonempty Excel sheet must use the template headers in row 1. Formulas, duplicate SKU/Price Type rows across files or sheets, negative prices, missing/extra/reordered headers and unsupported files are rejected before any update. ZIPs may include an optional README.txt. They must not contain nested ZIPs. The template ZIP contains only selling.csv and README.txt; its CSV and preview exactly match the separate CSV/Excel downloads. Excel parsing uses the locally bundled SheetJS CE 0.20.3 library (Apache-2.0; vendor/sheetjs-LICENSE.txt).

Limits: 5 MB total upload, 15 MB expanded, 20,000 pricing rows, 1 MB combined pricing data. Uploaded files are not committed; only validated normalized pricing is saved after explicit confirmation. Prices and card names are public, like the original repository.

The original XLSX importer `build-data.py` and pricing files remain unchanged until an administrator explicitly publishes an update. The calculator now matches the reference rebuild’s light layout, purple quote headers, four metrics and source details. It defaults to CTC-007, quantity 10,000 and Premium. The original blank-quantity view, all-tier option, formulas, independent cost lookup and stored-cost fallback are retained. Prices display three to four decimal places as in the rebuild; margins display one decimal place. Invalid or fractional quantities are rejected. The existing visualizer keeps its original stylesheet. The original dataset is not replaced by the CTC-007 NetSuite example. Previous/next card controls preserve quantity and tier. Uploaded display strings are escaped in both the calculator and visualizer.

### Checks before deployment

Run from the repository root with Node.js:

```
node tests/calculator.test.mjs
node tests/import.test.mjs
node tests/files.test.mjs
node tests/github.test.mjs
node tests/admin.test.mjs
```

The calculator test compares all saved rows across quantity boundaries against original commit `c37642af474e266f9ac7a9c5db5a3a3639cbf3ea`. The import and publication tests use synthetic data and mocked GitHub writes; they never publish test pricing. Git history provides rollback of both code and pricing.

## Admin Price Editor

Sign in to `admin.html` and choose **Update Price**. Editing and adding cards are available immediately; GitHub authorization is required only to save to the live repository. If you start a draft first, Save opens **Connect GitHub** and retains your entries through connection. The draft is checked against the latest selected-card records before saving; concurrent selected-card changes require Cancel and reload, while updates to other cards are preserved. Select a registered card at the top right. Its four EMEA price rows are read-only until **Edit** is clicked. Edit numeric, non-negative selling prices, choose **Save**, review the exact changes and choose **Confirm save**. **Cancel** discards the draft. Existing missing bands may remain blank; existing prices cannot be deleted by clearing a cell. A zero selling price is accepted; the unchanged calculator shows an unavailable margin because division by zero is undefined.

New cards use the eight quantity columns 0, 5,000, 10,000, 25,000, 50,000, 100,000, 250,000 and 500,000. Existing cards keep any additional boundaries, such as 20, 1,000, 750,000 and 1,000,000, as separate columns. All four price types share exactly the same column boundaries; each body cell contains one price, and quantity ranges appear only in the header. QTY 0 represents the first positive-quantity band, not an order of zero. The editor never invents prices for missing tiers. Existing supplier cost bands and stored costs are unchanged when editing a card. **+ Add New Card** asks only for a unique SKU and Card Product Name above the unchanged selling-price table. Enter the selling prices in that table. New cards have no assumed cost: cost, gross profit and margin remain unavailable unless existing cost records are available. Selling-price uploads never add or change costs. Use the upload tab for bulk selling-price updates.

`pricing-editor.mjs` builds the draft; `admin-editor.mjs` handles the table and confirmation. The existing GitHub publisher atomically commits only `pricing-data.json` and `pricing-data.js` to `main`, retaining every other card. It checks the starting commit and uses a non-force ref update to reject concurrent repository changes. Each successful commit's parent is the previous pricing backup. Save failures leave the draft and current repository data intact; an ambiguous network failure includes a commit reference to check before retrying. Modified records receive source `Admin Price Editor` and the save date (UTC). Dates are provenance, not scheduled activation dates.

The current repository snapshot is loaded when GitHub connects. After saving, the editor checks the deployed JSON for up to two minutes and distinguishes a successful GitHub save from a successful live deployment. The unchanged calculator loads `pricing-data.js` initially, fetches `pricing-data.json` without cache, and refreshes on focus and every 15 seconds. Public prices become available after the existing GitHub Pages workflow succeeds; this is not an instantaneous hosted-database update.

### Pricing backup and restore

Before introducing the editor, branch `backup-pricing-before-editor-2026-10-04` was created at `7377f617f123962b2c30b26f3731c77ad78f4ccb`. It contains both original active pricing files. No production price values were changed as part of implementing or testing the editor.

To restore a particular pricing update, revert that pricing-only commit in GitHub (or use `git revert <pricing-commit>` on an up-to-date `main`) and let Pages deploy. This preserves the editor and other website code. To restore the pre-editor data specifically, restore **both** `pricing-data.json` and `pricing-data.js` from the backup branch in a new commit on `main`; do not reset the entire branch. Review the two-file diff before pushing, since restoring old data also removes subsequent legitimate price updates. For a local Git checkout:

```sh
git fetch origin
git switch main
git pull --ff-only
git restore --source=origin/backup-pricing-before-editor-2026-10-04 -- pricing-data.json pricing-data.js
git add pricing-data.json pricing-data.js
git commit -m "Restore pricing from pre-editor backup"
git push origin main
```

Additional checks: `node tests/editor.test.mjs` and `node tests/editor-ui.test.mjs`. Tests exercise synthetic edits, save failures, cancellation and new-card creation without publishing test data. Deployment checks permit legitimate pricing changes while requiring both pricing files to contain the same dataset.
