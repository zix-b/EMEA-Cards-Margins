## NetSuite cost authority from 10 October 2026

All regions now require NetSuite supplier costs. The calculator excludes historical OPPIOT, workbook and PLI costs, including stored fallback rows. Historical records remain in the dataset for traceability only. Missing costs produce unavailable gross profit and margin, never zero or a legacy substitute.

Selling prices and supplier costs have separate update paths and dates. The authenticated admin can upload the complete saved search 7072 CSV, confirm USD per Each and inclusive quantity bounds, review normalized bands and missing coverage, then apply. The backend parses and validates the original CSV independently and uses the existing atomic publication and backup flow. The full export is not committed. It is not an automatic live purchase-cost API sync.

Only EMEA has a confirmed supplier mapping: FZCO and LLC must have identical schedules for every included SKU. Conflicting, overlapping, negative or incomplete paired schedules are rejected. NASA and ROW mappings await confirmation, so those regions show unavailable costs. The supplied export covers CTC-008 among ten active cards, plus stored CTC-009 and CTC-027 which have no active selling schedules. Nine active EMEA cards need additional NetSuite records. Do not certify complete pricing until mappings and missing records are resolved.

Run `node --test tests/*.test.mjs` and `python3 tests/netsuite_test.py`. Deploy the updated authenticated Worker before the static admin UI, because the new supplier-cost operation requires server support. Review both frontend and Worker changes before release.

The remainder describes historical workflows and is retained for reference.

## Current selling-price source (7 October 2026)

The main calculator uses NetSuite USD/Each item price matrices for the 10 SKUs and populated levels listed in `netsuite-scope.json`. NetSuite level names and quantity bands are displayed directly. The regional buttons select the **cost region only**; they do not route or filter selling prices.

The initial direct-source migration was reviewed from all 10 NetSuite item records. `netsuite-preview.json` version 2 contains the source schedules. Sync fetches a new preview; Review and Apply replaces all active selling schedules. Blank levels have no spreadsheet fallback. An incomplete or unexpected price-level scope fails closed and requires review of the scope configuration.

Existing `costBands` and separately retained `legacyCosts` remain unchanged. Costs are **not** sourced from NetSuite. Enter a quantity to select the cost band; missing costs show unavailable margins. Selling uploads, manual price editing and card mutations are hidden and rejected by the backend in NetSuite-only mode. Change prices in NetSuite, then sync, review and apply. Adding SKUs or levels requires updating and verifying the approved sync scope.

The copy under `versions/pre-july-10-2026/` is historical and unchanged. The sections below document the earlier upload/mapping workflow retained for regression coverage, not the active NetSuite-only selling workflow.

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

Open `admin.html` from the calculator’s Admin portal link and sign in using the approved email address and Cloudflare email code. Keep the sign-in popup open during administration; use **Log out** to end the server session. Admins do not supply a GitHub token or need a GitHub account.

The site remains on GitHub Pages. A Cloudflare Worker verifies Cloudflare Access identity and an exact email allowlist, validates reviewed operations against current repository data, creates a backup tag, and commits `pricing-data.json` and `pricing-data.js` together on `main`. Repository authorization is stored privately as a Worker secret; NetSuite credentials remain in GitHub Actions. The existing Pages workflow deploys the site. Use **Refresh publication status** in the portal to distinguish a saved commit from a completed deployment. See [backend setup and verification](backend/README.md).

Upload CSV, Excel (.xlsx or .xls), or a ZIP containing one or more CSV/Excel pricing files. Download the CSV, Excel or ZIP template from the admin page. Use **Download Template** to choose ZIP, CSV or XLSX. Preview stays beside the dropdown. All formats use exactly the same columns, in this order:

`SKU`, `Card Product Name`, `Price Type`, `QTY 0`, `QTY 5,000`, `QTY 10,000`, `QTY 25,000`, `QTY 50,000`, `QTY 100,000`, `QTY 250,000`, `QTY 500,000`.

Each QTY header includes its range on a second line inside the same cell. QTY 0 means 1–4,999, followed by 5,000–9,999; 10,000–24,999; 25,000–49,999; 50,000–99,999; 100,000–249,999; 250,000–499,999; and 500,000+. CSV uses quoted multiline header fields (enable Wrap Text in a spreadsheet viewer if necessary). Previous plain QTY headers remain accepted; incorrect annotated ranges are rejected.

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

Sign in to `admin.html` and choose **Manage Pricing**. Review and confirm every edit or card change before publication. The draft is checked against the latest selected-card records before saving; concurrent selected-card changes require Cancel and reload, while updates to other cards are preserved. Select a registered card at the top right. Its four EMEA price rows are read-only until **Edit** is clicked. Edit numeric, non-negative selling prices, choose **Save**, review the exact changes and choose **Confirm save**. **Cancel** discards the draft. Existing missing bands may remain blank; existing prices cannot be deleted by clearing a cell. A zero selling price is accepted; the unchanged calculator shows an unavailable margin because division by zero is undefined.

New cards use the eight quantity columns 0, 5,000, 10,000, 25,000, 50,000, 100,000, 250,000 and 500,000. Existing cards keep any additional boundaries, such as 20, 1,000, 750,000 and 1,000,000, as subcolumns under the same eight standard QTY header groups. This preserves their distinct stored prices. Templates and new cards have exactly eight quantity columns. All four price types share exactly the same column boundaries; each body cell contains one price, and quantity ranges appear only in the header. QTY 0 represents the first positive-quantity band, not an order of zero. The editor never invents prices for missing tiers. Existing supplier cost bands and stored costs are unchanged when editing a card. **+ Add New Card** asks only for a unique SKU and Card Product Name above the unchanged selling-price table. Enter the selling prices in that table. New cards have no assumed cost: cost, gross profit and margin remain unavailable unless existing cost records are available. Selling-price uploads never add or change costs. Use the upload tab for bulk selling-price updates.

`pricing-editor.mjs` builds the draft; `admin-editor.mjs` handles the table and confirmation. The authenticated Worker atomically commits only `pricing-data.json` and `pricing-data.js` to `main`, retaining every other card. It checks the starting commit and uses a non-force ref update to reject concurrent repository changes. The Worker creates a backup tag for the starting commit before publishing. Save failures leave the draft and current repository data intact; an ambiguous network failure includes a commit reference to check before retrying. Modified records receive source `Admin Price Editor` and the save date (UTC). Dates are provenance, not scheduled activation dates.

The current repository snapshot is loaded after email sign-in. After saving, the editor checks the deployed JSON for up to two minutes and distinguishes a successful GitHub save from a successful live deployment. The unchanged calculator loads `pricing-data.js` initially, fetches `pricing-data.json` without cache, and refreshes on focus and every 15 seconds. Public prices become available after the existing GitHub Pages workflow succeeds; this is not an instantaneous hosted-database update.

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
