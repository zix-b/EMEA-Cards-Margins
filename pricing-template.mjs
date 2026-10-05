import {QUANTITIES} from './pricing-editor.mjs';
export const QUANTITY_BANDS=QUANTITIES.map((quantity,i)=>{
 const min=quantity||1,max=i+1<QUANTITIES.length?QUANTITIES[i+1]-1:null;
 const number=value=>value.toLocaleString('en-US');
 return {min,max,label:`QTY ${number(quantity)}`,range:max===null?`${number(min)}+`:`${number(min)}–${number(max)}`};
});
export const DISPLAY_HEADERS=['SKU','Card Product Name','Price Type',...QUANTITY_BANDS.map(band=>`${band.label}\n${band.range}`)];
// Only the exact range annotation from the template is a supported header alias.
// Keep plain headers from previously downloaded templates valid too.
export function plainTemplateHeader(value){
 const text=String(value??'').trim().replace(/\r\n/g,'\n');
 const band=QUANTITY_BANDS.find(b=>text===`${b.label}\n${b.range}`);
 return band?band.label:text;
}
