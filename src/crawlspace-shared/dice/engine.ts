export type DiceResult = { formula: string; total: number; detail: string }

// Small expression parser keeps dice evaluation isolated from the sheet UI.
export function rollFormula(input: string, random = Math.random): DiceResult {
  const formula = input
    .trim()
    .replace(/^\/(?:r|roll)\s*/i, '')
    .replace(/\s+/g, '')
  if (!formula || formula.length > 160) throw new Error('Enter a dice formula.')
  const tokens = formula.match(/\d*d(?:\d+|%)?|\d+|kh\d*|kl\d*|[()+*/-]/gi) ?? []
  if (tokens.join('').toLowerCase() !== formula.toLowerCase()) throw new Error('Unsupported dice formula.')
  let pos = 0
  const take = () => tokens[pos++]
  const peek = () => tokens[pos]
  const expression = (): number => {
    let n = term()
    while (peek() === '+' || peek() === '-') {
      const op = take()
      const rhs = term()
      n = op === '+' ? n + rhs : n - rhs
    }
    return n
  }
  const term = (): number => {
    let n = atom()
    while (peek() === '*' || peek() === '/') {
      const op = take()
      const rhs = atom()
      if (op === '/' && rhs === 0) throw new Error('Cannot divide by zero.')
      n = op === '*' ? n * rhs : n / rhs
    }
    return n
  }
  const atom = (): number => {
    if (peek() === '+' || peek() === '-') {
      const sign = take()
      return (sign === '-' ? -1 : 1) * atom()
    }
    if (peek() === '(') {
      take()
      const n = expression()
      if (take() !== ')') throw new Error('Missing closing parenthesis.')
      return n
    }
    const first = take()
    if (!first) throw new Error('Incomplete formula.')
    if (/^\d*d(?:\d+|%)?$/i.test(first)) {
      const count = first.toLowerCase().startsWith('d') ? 1 : Number(first.slice(0, first.toLowerCase().indexOf('d')))
      const sides = first.endsWith('%') ? 100 : Number(first.toLowerCase().split('d')[1] || 20)
      if (!count || count > 100 || !sides || sides > 10000)
        throw new Error('Dice count must be 1–100 and sides 1–10000.')
      const rolls = Array.from({ length: count }, () => 1 + Math.floor(random() * sides))
      let kept = rolls.slice()
      let keep = ''
      if (/^kh/i.test(peek() ?? '')) {
        const mod = take()
        const k = Number(mod.slice(2)) || 1
        if (k > count) throw new Error('Keep count exceeds dice count.')
        keep = `kh${k}`
        kept = rolls
          .slice()
          .sort((a, b) => b - a)
          .slice(0, k)
      } else if (/^kl/i.test(peek() ?? '')) {
        const mod = take()
        const k = Number(mod.slice(2)) || 1
        if (k > count) throw new Error('Keep count exceeds dice count.')
        keep = `kl${k}`
        kept = rolls
          .slice()
          .sort((a, b) => a - b)
          .slice(0, k)
      }
      details.push(
        `${count}d${sides}${keep} [${rolls.join(', ')}]${kept.length < rolls.length ? ` → ${kept.join(', ')}` : ''}`,
      )
      return kept.reduce((a, b) => a + b, 0)
    }
    if (!/^\d+$/.test(first)) throw new Error('Expected a number or dice expression.')
    return Number(first)
  }
  const details: string[] = []
  const total = expression()
  if (pos !== tokens.length || !Number.isFinite(total) || Math.abs(total) > 1e9)
    throw new Error('Invalid or out-of-range formula.')
  return { formula, total: Number.isInteger(total) ? total : Number(total.toFixed(2)), detail: details.join(' · ') }
}

/** Check syntax without spending a random roll before the actual cast. */
export function validateRollFormula(input: string) {
  return rollFormula(input, () => 0)
}
