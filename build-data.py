from __future__ import annotations

import json
import re
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "pricing-data.json"
JS_OUT = ROOT / "pricing-data.js"
EXCLUDED_SKUS = {"CTC-031"}

MARGIN_FILE = Path(
    "/tmp/codex-remote-attachments/019ec67d-c7cc-7a22-9856-9bb42b6a6700/858EA98C-C692-49FA-9FFE-A649D16DB1FE/1-Cards-Wearables-Costing-Margins-14-April-2026-.xlsx"
)
OPPIOT_FILE = Path(
    "/tmp/codex-remote-attachments/019ec67d-c7cc-7a22-9856-9bb42b6a6700/858EA98C-C692-49FA-9FFE-A649D16DB1FE/2-Revised-OPPIOT_card_pricing_-20260421.xlsx"
)
NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
RELNS = {"rel": "http://schemas.openxmlformats.org/package/2006/relationships"}


def col_to_num(col: str) -> int:
    n = 0
    for ch in col:
        n = n * 26 + ord(ch) - 64
    return n


def cell_parts(ref: str) -> tuple[int, int]:
    match = re.match(r"([A-Z]+)(\d+)", ref)
    if not match:
        raise ValueError(f"Bad cell reference: {ref}")
    return col_to_num(match.group(1)), int(match.group(2))


def node_text(el: ET.Element | None) -> str:
    if el is None:
        return ""
    return "".join(t.text or "" for t in el.findall(".//a:t", NS))


def workbook_sheets(zf: ZipFile) -> list[tuple[str, str]]:
    wb = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rel_map = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels.findall("rel:Relationship", RELNS)
    }
    sheets = []
    for sheet in wb.findall("a:sheets/a:sheet", NS):
        rid = sheet.attrib[
            "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
        ]
        sheets.append((sheet.attrib["name"], "xl/" + rel_map[rid].lstrip("/")))
    return sheets


def shared_strings(zf: ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    return [node_text(si) for si in root.findall("a:si", NS)]


def sheet_rows(zf: ZipFile, target: str) -> dict[int, dict[int, str]]:
    shared = shared_strings(zf)
    root = ET.fromstring(zf.read(target))
    rows: dict[int, dict[int, str]] = {}
    for row in root.findall(".//a:sheetData/a:row", NS):
        row_num = int(row.attrib["r"])
        values: dict[int, str] = {}
        for cell in row.findall("a:c", NS):
            col, _ = cell_parts(cell.attrib["r"])
            typ = cell.attrib.get("t")
            value_node = cell.find("a:v", NS)
            formula_node = cell.find("a:f", NS)
            value = ""
            if formula_node is not None:
                value = "=" + (formula_node.text or "")
            elif value_node is not None:
                raw = value_node.text or ""
                if typ == "s" and raw.isdigit() and int(raw) < len(shared):
                    value = shared[int(raw)]
                else:
                    value = raw
            elif typ == "inlineStr":
                value = node_text(cell.find("a:is", NS))
            if value:
                values[col] = clean_text(value)
        if values:
            rows[row_num] = values
    return rows


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", str(value).replace("\n", " ")).strip()


def number(value: str | None) -> float | None:
    if value is None:
        return None
    text = clean_text(value).replace(",", "")
    if text.startswith("=") or text in {"", "X", "?", "TBD", "N.A.", "N/A"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def parse_range(label: str) -> tuple[int | None, int | None]:
    text = clean_text(label).replace(",", "")
    nums = [int(x) for x in re.findall(r"\d+", text)]
    if ("+" in text or "more" in text.lower()) and nums:
        return nums[0], None
    if len(nums) >= 2:
        return nums[0], nums[1]
    if len(nums) == 1:
        return nums[0], nums[0]
    return None, None


def is_official_quantity_band(label: str) -> bool:
    text = clean_text(label).lower()
    if not text or text == "x":
        return False
    qty_min, qty_max = parse_range(text)
    if qty_min is None:
        return False
    return qty_max is None or qty_max > qty_min


def sku_codes(value: str) -> list[str]:
    return re.findall(r"\b[A-Z]{3}-\d{3}\b", clean_text(value).upper())


def extract_oppiot_card_costs() -> dict[tuple[str, int | None, int | None], float]:
    costs: dict[tuple[str, int | None, int | None], float] = {}
    with ZipFile(OPPIOT_FILE) as zf:
        target = dict(workbook_sheets(zf))["Card Prices"]
        rows = sheet_rows(zf, target)
        qty_cols = {
            col: parse_range(label)
            for col, label in rows[5].items()
            if col >= 4 and label and label != "Price"
        }

        active_skus: list[str] = []
        for row_num in sorted(rows):
            values = rows[row_num]
            row_skus = sku_codes(values.get(1, ""))
            if row_skus:
                active_skus = row_skus
                continue

            date_label = clean_text(values.get(2, "")).replace(" ", "").lower()
            if date_label != "20th,april,2026":
                continue

            for col, qty_range in qty_cols.items():
                cost = number(values.get(col))
                if cost is None:
                    continue
                for sku in active_skus:
                    costs[(sku, qty_range[0], qty_range[1])] = cost
    return costs


def cost_for_quantity(
    costs: dict[tuple[str, int | None, int | None], float],
    sku: str,
    qty: int | None,
) -> float | None:
    if qty is None:
        return None
    for cost_sku, qty_min, qty_max in sorted(
        costs,
        key=lambda item: (
            item[0],
            item[1] if item[1] is not None else -1,
            item[2] if item[2] is not None else 10**12,
        ),
    ):
        if cost_sku != sku:
            continue
        if qty_min is not None and qty < qty_min:
            continue
        if qty_max is not None and qty > qty_max:
            continue
        return costs[(cost_sku, qty_min, qty_max)]
    return None


def extract_december_rows() -> list[dict]:
    output = []
    oppiot_costs = extract_oppiot_card_costs()
    with ZipFile(MARGIN_FILE) as zf:
        target = dict(workbook_sheets(zf))["03 Dec 2025"]
        rows = sheet_rows(zf, target)
        official_quantity_row = rows[11]
        qty_cols = {}
        for col in range(9, 25):
            label = official_quantity_row.get(col, "")
            if not is_official_quantity_band(label):
                continue
            qty_min, qty_max = parse_range(label)
            qty_cols[col] = {
                "label": label,
                "min": qty_min,
                "max": qty_max,
            }

        by_sku: dict[str, list[tuple[int, dict[int, str]]]] = {}
        for row_num, values in rows.items():
            sku = values.get(3)
            pnl = values.get(5)
            if not sku or not pnl or sku == "Item Code":
                continue
            by_sku.setdefault(sku, []).append((row_num, values))

        for sku, sku_rows in by_sku.items():
            if sku in EXCLUDED_SKUS:
                continue
            product = sku_rows[0][1].get(4, "")
            cost_rows = [
                row
                for row in sku_rows
                if row[1].get(5, "").upper() in {"COGS", "COGS"}
                or row[1].get(5, "").lower() == "cogs"
                or row[1].get(5, "").lower() == "cogs"
            ]
            if not cost_rows:
                cost_rows = [row for row in sku_rows if row[1].get(5, "").lower().startswith("cog")]

            selling_rows = [row for row in sku_rows if row[1].get(5) == "Selling"]
            for _row_num, selling_values in selling_rows:
                tier = selling_values.get(6, "Selling Price")
                use_emea_cost = "EMEA" in tier or "Distributor" in tier
                matching_cost = None
                for _cost_row_num, cost_values in cost_rows:
                    desc = cost_values.get(6, "")
                    if use_emea_cost and "EMEA" in desc:
                        matching_cost = cost_values
                        break
                    if not use_emea_cost and "NASA" in desc:
                        matching_cost = cost_values
                        break
                if matching_cost is None and cost_rows:
                    matching_cost = cost_rows[0][1]

                for col, qty in qty_cols.items():
                    selling_price = number(selling_values.get(col))
                    if selling_price is None:
                        continue
                    cost = number(matching_cost.get(col)) if matching_cost else None
                    if use_emea_cost:
                        cost = cost_for_quantity(oppiot_costs, sku, qty["min"]) or cost
                    gross_profit = None
                    margin = None
                    if cost is not None:
                        gross_profit = selling_price - cost
                        margin = gross_profit / selling_price if selling_price else None
                    output.append(
                        {
                            "source": "Cards & Wearables Costing & Margins",
                            "sourceDate": "2025-12-03",
                            "category": "03 Dec 2025",
                            "sku": sku,
                            "product": product,
                            "tier": tier,
                            "quantityLabel": qty["label"],
                            "quantityMin": qty["min"],
                            "quantityMax": qty["max"],
                            "sellingPrice": round(selling_price, 4),
                            "costPrice": round(cost, 4) if cost is not None else None,
                            "grossProfit": round(gross_profit, 4) if gross_profit is not None else None,
                            "marginPercent": round(margin, 4) if margin is not None else None,
                            "vendor": matching_cost.get(8) if matching_cost else "",
                        }
                    )
    return output


def cost_bands() -> list[dict]:
    bands = []
    for (sku, qty_min, qty_max), cost in sorted(
        extract_oppiot_card_costs().items(),
        key=lambda item: (
            item[0][0],
            item[0][1] if item[0][1] is not None else -1,
            item[0][2] if item[0][2] is not None else 10**12,
        ),
    ):
        bands.append(
            {
                "sku": sku,
                "quantityMin": qty_min,
                "quantityMax": qty_max,
                "costPrice": round(cost, 4),
                "sourceDate": "2026-04-20",
                "source": "Revised OPPIOT card pricing",
            }
        )
    return bands


def main() -> None:
    data = {
        "generatedAt": "2026-07-09",
        "rows": extract_december_rows(),
        "costBands": cost_bands(),
    }
    OUT.write_text(json.dumps(data, indent=2), encoding="utf-8")
    JS_OUT.write_text(
        "window.PRICING_DATA = " + json.dumps(data, indent=2) + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(data['rows'])} pricing rows to {OUT}")
    print(f"Wrote browser data to {JS_OUT}")


if __name__ == "__main__":
    main()
