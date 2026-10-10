import {prepareSellingUpdate} from '../pricing-files.mjs';
import {prepareEditorUpdate} from '../pricing-editor.mjs';
import {prepareCardUpdate} from '../card-management.mjs';
import {prepareNetSuite} from '../netsuite-pricing.mjs';
import {SUPPORTED_TIERS} from '../pricing-import.mjs';

const reject = message => { throw new Error(message); };
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
export function validateUpload(rows) {
 if (!Array.isArray(rows) || !rows.length || rows.length > 20000) reject('Invalid upload rows.');
 const seen = new Set(), names = new Map();
 return rows.map(row => {
  if (!row || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(row.sku) || typeof row.product !== 'string' || !row.product.trim() || row.product.length > 300 || /[\x00-\x1f]/.test(row.product) || !SUPPORTED_TIERS.includes(row.tier) || !Array.isArray(row.prices) || row.prices.length !== 8 || row.prices.some(p => p !== null && (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1e12))) reject('Invalid selling-price upload.');
  const key = row.sku.toLowerCase()+'|'+row.tier, prior = names.get(row.sku.toLowerCase());
  if (seen.has(key) || (prior && (prior.sku !== row.sku || prior.product !== row.product))) reject('Duplicate or inconsistent upload card.');
  seen.add(key); names.set(row.sku.toLowerCase(),row);
  return {sku:row.sku,product:row.product,tier:row.tier,prices:row.prices};
 });
}
export function buildUpdate(current, operation, preview) {
 if (!operation || typeof operation !== 'object') reject('A reviewed operation is required.');
 if(current.priceSource==='netsuite'&&!['netsuite','editor'].includes(operation.kind))reject('Selling prices and cards are managed in NetSuite. Sync and review NetSuite changes.');
 const date=operation.date;
 if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date) reject('Invalid review date.');
 let result;
 switch(operation.kind) {
  case 'upload': result=prepareSellingUpdate(validateUpload(operation.rows),current,date); break;
  case 'editor':
   if(current.priceSource==='netsuite'&&(!operation.edit||operation.edit.isNew||!Array.isArray(operation.edit.matrix)||operation.edit.matrix.some(r=>!current.rows.some(x=>x.sku===operation.edit.sku&&x.tier===r.tier))))reject('Only existing NetSuite prices can be overridden.');
   result=prepareEditorUpdate(current,operation.edit,date); break;
  case 'card': result=prepareCardUpdate(current,operation.edit,date); break;
  case 'netsuite':
   if (!same(preview,operation.preview)) reject('NetSuite preview changed. Reload and review again.');
   result=prepareNetSuite(current,preview,operation.mapping); break;
  default: reject('Unsupported admin operation.');
 }
 if (operation.kind!=='card' && !same(current.costBands,result.data.costBands)) reject('Selling-price changes cannot change costs.');
 if (new TextEncoder().encode(JSON.stringify(result.data)).length>1000000) reject('Updated pricing exceeds 1 MB.');
 return result.data;
}
