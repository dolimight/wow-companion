/** Preserve the observed variant identifiers without interpreting patch-specific bonus IDs */
export function itemLinkVariant(link:string|null|undefined):{bonusIds:number[]|null;enchantId:number|null;gemIds:number[]|null} {
  const value=link?.match(/item:([^|\s]+)/)?.[1]
  if(!value)return {bonusIds:null,enchantId:null,gemIds:null}
  const fields=value.split(':')
  const integer=(text:string|undefined)=>text!==undefined&&/^\d*$/.test(text)?Number(text||0):null
  const enchantId=integer(fields[1])
  const gems=fields.length>=6?fields.slice(2,6).map(integer):null
  const count=integer(fields[12])
  const bonuses=count!==null&&count<=128&&fields.length>=13+count?fields.slice(13,13+count).map(integer):null
  return {enchantId,gemIds:gems?.every(value=>value!==null)?gems:null,bonusIds:bonuses?.every(value=>value!==null)?bonuses:null}
}
