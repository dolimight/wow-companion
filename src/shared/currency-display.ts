import evidence from '../../data/season-rules/client-evidence.json'
export function currencyName(id:string):string{
  if(id==='money')return 'Gold'
  if(id.startsWith('item:'))return `Item ${id.slice(5)}`
  return (evidence.currencyNames as Record<string,string>)[id]??id
}
/** The game's own icon for a crest, read from the installed client when the season rules were built */
export function currencyIcon(id:string):number|null{
  return ((evidence as {currencyIcons?:Record<string,number|null>}).currencyIcons??{})[id]??null
}
export function formatCurrency(id:string,amount:number):string{
  return id==='money'?`${(amount/10000).toLocaleString(undefined,{maximumFractionDigits:4})} gold`:`${amount.toLocaleString()} ${currencyName(id)}`
}
