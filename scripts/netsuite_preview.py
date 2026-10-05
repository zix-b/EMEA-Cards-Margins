"""Fetch a public selling-price preview; never modify active pricing or costs."""
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from netsuite_sync import fetch_schedules


def main():
    names = ['NETSUITE_ACCOUNT_ID', 'NETSUITE_CONSUMER_KEY', 'NETSUITE_CONSUMER_SECRET', 'NETSUITE_TOKEN_ID', 'NETSUITE_TOKEN_SECRET']
    credentials = tuple(os.environ.get(name, '').strip() for name in names)
    if not all(credentials) or not re.fullmatch(r'\d+', credentials[0]):
        raise ValueError('Missing NetSuite configuration')
    request_id = os.environ['SYNC_REQUEST_ID']
    if not re.fullmatch(r'[a-zA-Z0-9-]{1,80}', request_id):
        raise ValueError('Invalid request ID')
    schedules = fetch_schedules(credentials)
    rows = [dict(sku=sku, level=level, quantityMin=b['min'], quantityMax=b['max'], sellingPrice=float(b['price']))
            for sku, levels in schedules.items() for level, bands in levels.items() for b in bands]
    preview = dict(version=1, requestId=request_id, fetchedAt=datetime.now(timezone.utc).isoformat(),
                   currency='USD', unit='Each', rows=rows)
    Path('netsuite-preview.json').write_text(json.dumps(preview, indent=2, allow_nan=False)+'\n')
    print(f'Validated preview: {len(schedules)} cards, {len(rows)} selling bands. Active prices and costs unchanged.')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Do not disclose raw NetSuite responses or credential-bearing exceptions.
        print('NetSuite preview failed: check credentials, permissions and expected USD/Each price levels.')
        raise SystemExit(1)
