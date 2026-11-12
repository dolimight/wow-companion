import { describe, expect, it } from 'vite-plus/test'
import { arithmetic } from './arithmetic'

describe('arithmetic without eval', () => {
  it('follows precedence, parentheses, and signs', () => {
    expect(arithmetic('1 + 2 * 3')).toBe(7)
    expect(arithmetic('(1 + 2) * 3')).toBe(9)
    expect(arithmetic('10 - 4 - 3')).toBe(3)
    expect(arithmetic('8 / 4 / 2')).toBe(1)
    expect(arithmetic('-2 * -(3 + 1)')).toBe(8)
    expect(arithmetic('1.5 * .5')).toBe(0.75)
  })
  it('gives NaN for anything that is not a whole expression', () => {
    for (const text of ['', '1 +', '(1 + 2', '1 + 2)', '2 3', 'NaN', 'alert(1)', '1 ** 2']) expect(arithmetic(text)).toBeNaN()
  })
  it('lets division by zero fall out as a non-finite number', () => {
    expect(Number.isFinite(arithmetic('1 / 0'))).toBe(false)
  })
})
