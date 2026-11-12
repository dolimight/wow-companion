/**
 * Works out a plain arithmetic expression such as `(12 + 3) * 2 / 100`: numbers, + - * /, unary signs, and parentheses
 * Returns NaN for anything else. Spell descriptions need this, and the renderer's CSP rightly forbids eval
 */
export function arithmetic(text: string): number {
  const tokens = text.match(/\d+(?:\.\d+)?|\.\d+|[-+*/()]|\S/g) ?? []
  let index = 0
  const peek = () => tokens[index]
  function factor(): number {
    const token = tokens[index++]
    if (token === '-') return -factor()
    if (token === '+') return factor()
    if (token === '(') {
      const inner = sum()
      return tokens[index++] === ')' ? inner : NaN
    }
    return token !== undefined && /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(token) ? Number(token) : NaN
  }
  function product(): number {
    let result = factor()
    while (peek() === '*' || peek() === '/') result = tokens[index++] === '*' ? result * factor() : result / factor()
    return result
  }
  function sum(): number {
    let result = product()
    while (peek() === '+' || peek() === '-') result = tokens[index++] === '+' ? result + product() : result - product()
    return result
  }
  const result = sum()
  return index === tokens.length ? result : NaN
}
