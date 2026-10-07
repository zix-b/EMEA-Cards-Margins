"""Read-only NetSuite retrieval; only approved selling-price schedules are published."""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

VERSION = '2024_2'
NS = {
    'soap': 'http://schemas.xmlsoap.org/soap/envelope/',
    'm': f'urn:messages_{VERSION}.platform.webservices.netsuite.com',
    'c': f'urn:core_{VERSION}.platform.webservices.netsuite.com',
    'b': f'urn:common_{VERSION}.platform.webservices.netsuite.com',
    'a': f'urn:accounting_{VERSION}.lists.webservices.netsuite.com',
    'xsi': 'http://www.w3.org/2001/XMLSchema-instance',
}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise RuntimeError('REDIRECT_BLOCKED')


def envelope(body, credentials, now=None, nonce=None):
    account, consumer, consumer_secret, token, token_secret = credentials
    stamp = str(int(time.time()) if now is None else now)
    nonce = nonce or secrets.token_hex(16)
    base = '&'.join([account, consumer, token, nonce, stamp])
    key = consumer_secret + '&' + token_secret
    signature = base64.b64encode(hmac.new(key.encode(), base.encode(), hashlib.sha256).digest()).decode()
    auth = ''.join(f'<c:{name}>{escape(value)}</c:{name}>' for name, value in
                   [('account', account), ('consumerKey', consumer), ('token', token),
                    ('nonce', nonce), ('timestamp', stamp)])
    declarations = ' '.join(f'xmlns:{prefix}="{uri}"' for prefix, uri in NS.items())
    return (f'<soap:Envelope {declarations}><soap:Header><m:tokenPassport>{auth}'
            f'<c:signature algorithm="HMAC_SHA256">{signature}</c:signature></m:tokenPassport>'
            '<m:searchPreferences><m:bodyFieldsOnly>false</m:bodyFieldsOnly>'
            '<m:returnSearchColumns>true</m:returnSearchColumns><m:pageSize>1000</m:pageSize>'
            f'</m:searchPreferences></soap:Header><soap:Body>{body}</soap:Body></soap:Envelope>').encode()


SEARCH = '''<m:search><m:searchRecord xsi:type="a:ItemSearchAdvanced">
  <a:criteria><a:basic><b:itemId operator="is"><c:searchValue>CTC-007</c:searchValue></b:itemId></a:basic></a:criteria>
  <a:columns>
    <a:basic><b:displayName/><b:internalId/><b:itemId/><b:type/><b:unitsType/></a:basic>
    <a:pricingJoin><b:currency/><b:maximumQuantity/><b:minimumQuantity/><b:priceLevel/><b:saleUnit/><b:unitPrice/></a:pricingJoin>
  </a:columns>
</m:searchRecord></m:search>'''


def report(stage, **fields):
    print(json.dumps({'stage': stage, **fields}), flush=True)


def call(operation, body, credentials, allow_partial=False):
    # Domain is fixed to NetSuite, account ID must be digits; never follow redirects.
    url = f'https://{credentials[0]}.suitetalk.api.netsuite.com/services/NetSuitePort_{VERSION}'
    request = urllib.request.Request(url, data=envelope(body, credentials), method='POST',
                                    headers={'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': operation})
    opener = urllib.request.build_opener(NoRedirect())
    try:
        response = opener.open(request, timeout=40)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000:
        raise RuntimeError('RESPONSE_LIMIT')
    root = ET.fromstring(raw)
    if root.find('.//soap:Fault', NS) is not None:
        known = {'INVALID_LOGIN', 'INVALID_LOGIN_ATTEMPT', 'INSUFFICIENT_PERMISSION',
                 'INVALID_VERSION', 'INVALID_CREDENTIALS', 'EXCEEDED_REQUEST_LIMIT',
                 'EXCEEDED_CONCURRENT_REQUEST_LIMIT'}
        codes = [e.text for e in root.iter() if e.tag.split('}')[-1] == 'code' and e.text in known]
        report(operation, ok=False, error=codes[0] if codes else 'SOAP_FAULT')
        raise SystemExit(1)
    for status in root.findall('.//c:status', NS):
        if status.get('isSuccess') != 'true' and not allow_partial:
            report(operation, ok=False, error='NETSUITE_STATUS_ERROR')
            raise SystemExit(1)
    return root



"""Pure checks for a read-only NetSuite pricing mapping investigation."""
from decimal import Decimal, InvalidOperation, ROUND_CEILING

SKUS = ['CTC-011', 'CTC-007', 'CRD-012', 'CTC-024', 'LIC-009', 'CTW-009']
TIERS = ['Standard Price (EMEA License)', 'Base Price (EMEA Premium)',
         'Distributor Price (EMEA)', 'EMEA Strategic Account (Magic Planet)']
def label_key(value):
    return ' '.join((value or '').casefold().split())


def decimal_value(value):
    if value is None or str(value).strip() == '':
        return None
    number = Decimal(str(value))
    if not number.is_finite() or number < 0:
        raise ValueError('INVALID_NONNEGATIVE_NUMBER')
    return number


def integer_range(minimum, maximum):
    """NetSuite uses an exclusive maximum; the website uses inclusive integers."""
    lo = decimal_value(minimum)
    hi = decimal_value(maximum)
    if lo is None:
        raise ValueError('MISSING_MINIMUM')
    start = max(1, int(lo.to_integral_value(rounding=ROUND_CEILING)))
    end = None if hi is None else int(hi.to_integral_value(rounding=ROUND_CEILING)) - 1
    if end is not None and end < start:
        raise ValueError('EMPTY_INTEGER_RANGE')
    return start, end


def normalize_schedule(records):
    """Do not invent bands or fill missing prices. Duplicate identical joins collapse."""
    output = []
    seen = {}
    for record in records:
        amount = decimal_value(record['price'])
        if amount is None:
            raise ValueError('MISSING_PRICE')
        lo, hi = integer_range(record['min'], record['max'])
        key = (lo, hi)
        if key in seen:
            if seen[key] != amount:
                raise ValueError('CONFLICTING_DUPLICATE_PRICE')
            continue
        seen[key] = amount
        output.append({'min': lo, 'max': hi, 'price': amount})
    output.sort(key=lambda r: r['min'])
    for previous, current in zip(output, output[1:]):
        if previous['max'] is None or current['min'] <= previous['max']:
            raise ValueError('OVERLAPPING_BANDS')
    return output


def values(parent, field):
    return parent.findall('b:' + field + '/c:searchValue', NS)


def scalar(parent, field):
    found = values(parent, field)
    return found[0].text if found else None


def refid(parent, field):
    found = values(parent, field)
    return found[0].get('internalId') if found else None


def read_references(pairs, credentials):
    result = {}
    for offset in range(0, len(pairs), 50):
        chunk = pairs[offset:offset + 50]
        refs = ''.join('<m:baseRef xsi:type="c:RecordRef" type="' + kind + '" internalId="' + escape(identifier, {'"': '&quot;'}) + '"/>' for kind, identifier in chunk)
        root = call('getList', '<m:getList>' + refs + '</m:getList>', credentials, allow_partial=True)
        for record in root.iter():
            if record.tag.split('}')[-1] != 'record':
                continue
            kind = record.get('{' + NS['xsi'] + '}type', '').split(':')[-1]
            kind = kind[0].lower() + kind[1:] if kind else ''
            result[(kind, record.get('internalId'))] = record
    return result


def fetch_schedules(credentials, scope=None):
    skus = scope['skus'] if scope else SKUS
    allowed_levels = scope['levels'] if scope else LEVELS
    expected = scope['expected'] if scope else EXPECTED
    roots = []
    references = set()
    for sku in skus:
        root = call('search', SEARCH.replace('CTC-007', sku), credentials)
        if root.findtext('.//c:totalPages', namespaces=NS) not in ['0', '1']:
            raise ValueError('INCOMPLETE_RESPONSE')
        roots.append(root)
        for row in root.findall('.//c:searchRow', NS):
            for node in row.findall('a:pricingJoin', NS):
                for field in ['priceLevel', 'currency']:
                    identifier = refid(node, field)
                    if identifier: references.add((field, identifier))
            for node in row.findall('a:basic', NS):
                identifier = refid(node, 'unitsType')
                if identifier: references.add(('unitsType', identifier))
                item_id = refid(node, 'internalId')
                item_type = (scalar(node, 'type') or '').lstrip('_')
                if item_id and item_type in ['inventoryItem','nonInventorySaleItem','nonInventoryResaleItem','serviceSaleItem','serviceResaleItem','otherChargeSaleItem','otherChargeResaleItem']:
                    references.add((item_type, item_id))
        time.sleep(0.3)
    refs = read_references(sorted(references), credentials)
    schedules = {}
    for sku, root in zip(skus, roots):
        groups = {}
        basics = [b for row in root.findall('.//c:searchRow', NS) for b in row.findall('a:basic', NS)]
        each_units = set()
        each_names = set()
        uom_count = 0
        for basic in basics:
            units = refs.get(('unitsType', refid(basic, 'unitsType')))
            if units is not None:
                for uom in units.findall('a:uomList/a:uom', NS):
                    uom_count += 1
                    name = label_key(uom.findtext('a:unitName', namespaces=NS))
                    abbrev = label_key(uom.findtext('a:abbreviation', namespaces=NS))
                    rate = uom.findtext('a:conversionRate', namespaces=NS)
                    if (name in ['each','ea'] or abbrev in ['each','ea']) and decimal_value(rate) == Decimal(1):
                        identifier = uom.findtext('a:internalId', namespaces=NS) or uom.get('internalId')
                        if identifier: each_units.add(identifier)
                        each_names.update(n for n in [name, abbrev] if n)
        item_records = []
        for basic in basics:
            pair = ((scalar(basic, 'type') or '').lstrip('_'), refid(basic, 'internalId'))
            record = refs.get(pair)
            if record is not None and record not in item_records: item_records.append(record)
        if not item_records:
            body = '<m:search><m:searchRecord xsi:type="a:ItemSearch"><a:basic><b:itemId operator="is"><c:searchValue>' + escape(sku) + '</c:searchValue></b:itemId></a:basic></m:searchRecord></m:search>'
            full = call('search', body, credentials)
            item_records = full.findall('.//c:record', NS)
        matrix_present = False
        matrix_unit_verified = False
        for item in item_records:
            unit_ref = item.find('a:saleUnit', NS)
            unit_id = unit_ref.get('internalId') if unit_ref is not None else None
            unit_name = label_key(unit_ref.findtext('c:name', namespaces=NS)) if unit_ref is not None else ''
            unit_verified = unit_id in each_units or unit_name in each_names
            matrix_unit_verified = matrix_unit_verified or unit_verified
            for pricing in item.findall('a:pricingMatrix/a:pricing', NS):
                matrix_present = True
                level_ref = pricing.find('a:priceLevel', NS)
                currency_ref = pricing.find('a:currency', NS)
                if level_ref is None or currency_ref is None: continue
                records = []
                for price in pricing.findall('a:priceList/a:price', NS):
                    amount = price.findtext('a:value', namespaces=NS)
                    quantity = price.findtext('a:quantity', namespaces=NS)
                    if quantity is not None: records.append({'min': quantity, 'price': amount})
                records.sort(key=lambda r: decimal_value(r['min']))
                for i, record in enumerate(records): record['max'] = records[i+1]['min'] if i+1<len(records) else None
                if records:
                    key = (level_ref.get('internalId'), currency_ref.get('internalId'), unit_id, unit_name)
                    if key in groups: raise ValueError('DUPLICATE_MATRIX')
                    groups[key] = records
        selected = {}
        for (level_id, currency_id, unit_id, unit_name), records in groups.items():
            level = refs.get(('priceLevel', level_id))
            currency = refs.get(('currency', currency_id))
            if level is None or currency is None:
                raise ValueError('UNRESOLVED_REFERENCE')
            name = level.findtext('a:name', namespaces=NS)
            if currency.findtext('a:symbol', namespaces=NS) != 'USD':
                continue
            if name not in allowed_levels:
                if scope and any(r['price'] is not None for r in records):
                    raise ValueError('UNAPPROVED_PRICE_LEVEL')
                continue
            if unit_id not in each_units and unit_name not in each_names:
                raise ValueError('SALE_UNIT_NOT_EACH')
            if name in selected:
                raise ValueError('DUPLICATE_PRICE_LEVEL')
            # Blank cells must leave a gap, never extend the preceding price.
            schedule = normalize_schedule([r for r in records if r['price'] is not None])
            if schedule:
                selected[name] = schedule
        if set(selected) != set(expected[sku]):
            raise ValueError('EXPECTED_PRICE_LEVELS_CHANGED')
        schedules[sku] = selected
    return schedules


# Only these three verified mappings may replace selling prices. MAF is untouched.
# Names of the two additional cards from the user-supplied costing spreadsheet.
PRODUCTS = {'CTC-024': 'Card, Custom 28x54mm Breakaway with Band and Toggle',
            'CTW-009': 'Contactless, Playwave Custom Tyvek Wristband'}
LEVELS = dict(zip(['EMEA License Customers', 'Base', 'Distributor'], TIERS[:3]))
EXPECTED = {sku: set(LEVELS) for sku in SKUS}
EXPECTED['CTC-024'] = {'Base', 'Distributor'}
EXPECTED['LIC-009'] = {'Base', 'Distributor'}


def row_covers(row, qty):
    return row['quantityMin'] <= qty and (row['quantityMax'] is None or qty <= row['quantityMax'])


def merge_schedules(current, schedules, date):
    """Replace only mapped pairs, preserving costs and all unrelated data."""
    import copy
    data = copy.deepcopy(current)
    replacements = {}
    for sku, levels in schedules.items():
        if sku not in SKUS or set(levels) != EXPECTED[sku]:
            raise ValueError('UNEXPECTED_MAPPING')
        existing = [r for r in current['rows'] if r['sku'] == sku]
        card = next((c for c in current.get('cards', []) if c['sku'] == sku), None)
        product = card['product'] if card else existing[0]['product'] if existing else PRODUCTS[sku]
        costs = [c for c in current['costBands'] if c['sku'] == sku]
        for level, schedule in levels.items():
            tier = LEVELS[level]
            old = [r for r in existing if r['tier'] == tier]
            rows = []
            for band in schedule:
                lo, hi, price = band['min'], band['max'], float(band['price'])
                if not decimal_value(price) == band['price'] or price > 1e12:
                    raise ValueError('UNSUPPORTED_PRICE_PRECISION')
                # Split at old fallback and supplier-cost boundaries so cost lookup stays identical.
                cuts = {lo}
                for r in old + costs:
                    for point in [r['quantityMin'], None if r['quantityMax'] is None else r['quantityMax'] + 1]:
                        if point is not None and point > lo and (hi is None or point <= hi):
                            cuts.add(point)
                bounds = sorted(cuts)
                for i, start in enumerate(bounds):
                    end = bounds[i+1]-1 if i+1 < len(bounds) else hi
                    previous = next((r for r in old if row_covers(r, start)), None)
                    cost_band = next((c for c in costs if row_covers(c, start)), None)
                    fallback = previous.get('costPrice') if previous else None
                    cost = cost_band.get('costPrice') if cost_band else fallback
                    gp = None if cost is None else price - cost
                    row = copy.deepcopy(previous or {})
                    row.update(sku=sku, product=product, tier=tier,
                               quantityMin=start, quantityMax=end,
                               quantityLabel=f'{start:,}+' if end is None else f'{start:,}–{end:,}',
                               sellingPrice=price, costPrice=fallback,
                               grossProfit=gp, marginPercent=None if gp is None or price == 0 else gp/price,
                               source='NetSuite / ' + level, sourceDate=date,
                               category='NetSuite selling prices', vendor=row.get('vendor', ''))
                    rows.append(row)
            replacements[(sku, tier)] = rows
    data['rows'] = [r for r in current['rows'] if (r['sku'], r['tier']) not in replacements]
    for rows in replacements.values():
        data['rows'].extend(rows)
    data['generatedAt'] = date
    if data['costBands'] != current['costBands']:
        raise ValueError('COSTS_CHANGED')
    if len(data['rows']) > 20000 or len(json.dumps(data).encode()) > 1000000:
        raise ValueError('DATASET_TOO_LARGE')
    return data


def main():
    from datetime import datetime, timezone
    from pathlib import Path
    names = ['NETSUITE_ACCOUNT_ID', 'NETSUITE_CONSUMER_KEY', 'NETSUITE_CONSUMER_SECRET', 'NETSUITE_TOKEN_ID', 'NETSUITE_TOKEN_SECRET']
    credentials = tuple(os.environ.get(name, '').strip() for name in names)
    if not all(credentials) or not re.fullmatch(r'\d+', credentials[0]):
        raise ValueError('MISSING_CONFIGURATION')
    current = json.loads(Path('pricing-data.json').read_text())
    schedules = fetch_schedules(credentials)
    updated = merge_schedules(current, schedules, datetime.now(timezone.utc).date().isoformat())
    encoded = json.dumps(updated, ensure_ascii=False, indent=2, allow_nan=False)
    Path('pricing-data.json').write_text(encoded + '\n')
    Path('pricing-data.js').write_text('window.PRICING_DATA = ' + encoded + ';\n')
    report('prepared', items=len(schedules), mapped_price_types=sum(len(v) for v in schedules.values()),
           existing_costs_preserved=True, maf_prices_preserved=True)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Never include raw response, request, credentials or server exception text in logs.
        report('sync', ok=False, error='SYNC_VALIDATION_OR_CONNECTION_FAILED')
        sys.exit(1)
