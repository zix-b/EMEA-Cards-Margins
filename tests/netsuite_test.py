"""Regression checks for NetSuite range normalization and cost preservation."""
import copy
import importlib.util
import json
from pathlib import Path
from decimal import Decimal
import unittest

spec = importlib.util.spec_from_file_location('sync', 'scripts/netsuite_sync.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)

class SyncTests(unittest.TestCase):
    def test_exclusive_ranges_and_zero_price(self):
        rows = sync.normalize_schedule([{'min': '0', 'max': '5000', 'price': '0'}, {'min': '5000', 'max': None, 'price': '.25'}])
        self.assertEqual([(r['min'], r['max']) for r in rows], [(1,4999),(5000,None)])
        self.assertEqual(rows[0]['price'],0)

    def test_invalid_schedules(self):
        for price in ['-1','NaN','Infinity','']:
            with self.assertRaises(ValueError):
                sync.normalize_schedule([{'min':'0','max':None,'price':price}])
        with self.assertRaises(ValueError):
            sync.normalize_schedule([{'min':'0','max':None,'price':'.2'}, {'min':'5000','max':None,'price':'.3'}])

    def test_costs_unmapped_and_unrelated_prices_unchanged(self):
        data=json.loads(Path('pricing-data.json').read_text())
        original=copy.deepcopy(data)
        schedule=[{'min':1,'max':4999,'price':Decimal('.91')},{'min':5000,'max':None,'price':Decimal('.37')}]
        schedules={sku:{level:schedule for level in sync.EXPECTED[sku]} for sku in sync.SKUS}
        out=sync.merge_schedules(data,schedules,'2026-10-05')
        self.assertEqual(data,original)
        self.assertEqual(data['costBands'],out['costBands'])
        mapped={(sku,sync.LEVELS[level]) for sku,v in schedules.items() for level in v}
        self.assertEqual([r for r in data['rows'] if (r['sku'],r['tier']) not in mapped],[r for r in out['rows'] if (r['sku'],r['tier']) not in mapped])
        def cost(rows,bands,sku,tier,q):
            r=next((r for r in rows if r['sku']==sku and r['tier']==tier and sync.row_covers(r,q)),None)
            c=next((c for c in bands if c['sku']==sku and sync.row_covers(c,q)),None)
            return c['costPrice'] if c else (r.get('costPrice') if r else None)
        points={1,4999,5000,10000,10**12}
        for r in data['rows']+data['costBands']:
            points.add(max(1,r['quantityMin']))
            if r['quantityMax'] is not None: points.update([r['quantityMax'],r['quantityMax']+1])
        for sku,tier in mapped:
            for q in points:
                rows=[r for r in out['rows'] if r['sku']==sku and r['tier']==tier and sync.row_covers(r,q)]
                self.assertEqual(len(rows),1)
                r=rows[0]
                self.assertEqual(r['sellingPrice'],.91 if q<5000 else .37)
                old_cost=cost(data['rows'],data['costBands'],sku,tier,q)
                new_cost=cost(out['rows'],out['costBands'],sku,tier,q)
                self.assertEqual(old_cost,new_cost,(sku,tier,q))
                if sku=='CTC-024': self.assertIsNone(new_cost)

    def test_unknown_mapping_rejected(self):
        with self.assertRaises(ValueError):
            sync.merge_schedules({'rows':[],'costBands':[]},{'OTHER':{}},'2026-10-05')

if __name__ == '__main__': unittest.main()
