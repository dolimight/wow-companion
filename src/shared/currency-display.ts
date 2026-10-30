import evidence from '../../data/season-rules/client-evidence.json'
export function currencyName(id:string):string{
  if(id==='money')return 'Gold'
  if(id.startsWith('item:'))return `Item ${id.slice(5)}`
  return (evidence.currencyNames as Record<string,string>)[id]??id
}
export function formatCurrency(id:string,amount:number):string{
  return id==='money'?`${(amount/10000).toLocaleString(undefined,{maximumFractionDigits:4})} gold`:`${amount.toLocaleString()} ${currencyName(id)}`
}
