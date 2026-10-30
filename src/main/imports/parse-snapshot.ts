/** Parse only JSON or WoW's declarative SavedVariables table syntax, never Lua code */
export function parseSnapshot(text: string): unknown {
  if (Buffer.byteLength(text, 'utf8') > 16 * 1024 * 1024) throw new Error('Snapshot exceeds the 16 MiB import limit')
  const input = text.replace(/^\uFEFF/, '').trim()
  if (input.startsWith('{') && !input.includes('WoWCompanionDB')) { try { return JSON.parse(input) } catch { /* Lua tables also start with braces */ } }
  let cursor = 0
  let nodes = 0
  function whitespace() { while(cursor < input.length) { if(/\s/.test(input[cursor]!)) {cursor++;continue} if(input.slice(cursor,cursor+2)==='--') { const end = input.indexOf('\n',cursor);cursor=end<0?input.length:end+1;continue }break } }
  function fail(): never {throw new Error(`Invalid or incomplete SavedVariables near offset ${cursor}`)}
  function char(expected: string) {whitespace();if(input[cursor]!==expected) fail();cursor++}
  function string(): string {whitespace();const quote=input[cursor++];let value='';while(cursor<input.length) {const c=input[cursor++]!;if(c===quote)return value;if(c==='\\'){const escape=input[cursor++];if(escape===undefined)fail();if(escape==='n')value+='\n';else if(escape==='r')value+='\r';else if(escape==='t')value+='\t';else if(escape==='\\'||escape==='"'||escape==="'")value+=escape;else if(/[0-9]/.test(escape)){let digits=escape;for(let i=0;i<2 && /[0-9]/.test(input[cursor]??'');i++) digits+=input[cursor++];value+=String.fromCharCode(Number(digits))}else fail()}else value+=c}return fail()}
  function parse(depth=0): unknown {
    if(depth>40||++nodes>500000)throw new Error('SavedVariables nesting or value limit exceeded')
    whitespace();const c=input[cursor]
    if(c==='"'||c==="'")return string()
    if(c==='{') {
      cursor++;const object:Record<string,unknown>=Object.create(null);let index=1;let named=false
      whitespace();while(input[cursor]!=='}') {
        if(cursor>=input.length)fail();let key:string
        if(input[cursor]==='['){cursor++;const k=parse(depth+1);if(typeof k!=='string'&&typeof k!=='number')fail();key=String(k);char(']');char('=');named=true}
        else {const match=/^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(cursor));const saved=cursor;if(match){cursor+=match[0].length;whitespace()}if(match&&input[cursor]==='='){cursor++;key=match[0];named=true}else{cursor=saved;key=String(index++)}}
        if(key==='__proto__'||key==='prototype'||key==='constructor'||Object.hasOwn(object,key))throw new Error('Unsafe or duplicate table key')
        object[key]=parse(depth+1);whitespace();if(input[cursor]===','||input[cursor]===';'){cursor++;whitespace()}else if(input[cursor]!=='}')fail()
      }
      cursor++;return !named&&index>1?Object.values(object):object
    }
    const match=/^(true|false|nil|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(?![A-Za-z_])/.exec(input.slice(cursor));if(!match)fail();cursor+=match[0].length
    if(match[0]==='true')return true;if(match[0]==='false')return false;if(match[0]==='nil')return null
    const number=Number(match[0]);if(!Number.isFinite(number))fail();return number
  }
  whitespace()
  if(input.startsWith('WoWCompanionDB',cursor)){cursor+='WoWCompanionDB'.length;char('=')}
  const result=parse();whitespace();if(input[cursor]===';'){cursor++;whitespace()}if(cursor!==input.length)fail()
  return normalizeTables(result)
}
function normalizeTables(input: unknown, parentKey=''): unknown {
  if(Array.isArray(input))return input.map(value=>normalizeTables(value,parentKey))
  if(!input||typeof input!=='object')return input
  const output:Record<string,unknown>=Object.create(null)
  for(const [key,value] of Object.entries(input)) {
    const array=['gear','gems','customization','collectedAppearanceIds','vault','lockouts','runs','inventoryObservations','items','levels','bonusIds','gemIds','specIds','primaryStats','uniqueGroups','restrictionGroups','stats','effects'].includes(key)||(key==='currencies'&&parentKey==='levels')
    if(array&&value&&typeof value==='object'&&!Array.isArray(value)) output[key]=Object.values(value).map(item=>normalizeTables(item,key))
    else output[key]=normalizeTables(value,key)
  }
  return output
}
