/**
 * 金额工具：内部统一用「分」做整数运算，避免浮点误差
 */

/** 把用户输入的字符串（元）解析成分，非法返回 null */
function parseAmount(input) {
  if (input === null || input === undefined) return null
  const text = String(input).trim()
  if (!text) return null
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null
  const fen = Math.round(Number(text) * 100)
  if (!Number.isFinite(fen) || fen <= 0) return null
  return fen
}

/** 分 -> 显示用的字符串，去掉无意义的小数位：1200 -> '12'，1234 -> '12.34' */
function fenToStr(fen) {
  const value = Math.round(Number(fen) || 0)
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  const integer = Math.floor(abs / 100)
  const decimal = abs % 100
  if (decimal === 0) return sign + String(integer)
  return sign + integer + '.' + (decimal < 10 ? '0' + decimal : String(decimal))
}

/** 分 -> 固定两位小数的金额，用于汇总展示：1200 -> '12.00' */
function fenToFixed(fen) {
  const value = Math.round(Number(fen) || 0)
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  const integer = Math.floor(abs / 100)
  const decimal = abs % 100
  return sign + integer + '.' + (decimal < 10 ? '0' + decimal : String(decimal))
}

/** 输入框里的字符串规范化：'12.' -> '12.'，'012' -> '12'，限制两位小数 */
function normalizeInput(text) {
  let next = String(text || '').replace(/[^\d.]/g, '')
  const firstDot = next.indexOf('.')
  if (firstDot >= 0) {
    next = next.slice(0, firstDot + 1) + next.slice(firstDot + 1).replace(/\./g, '')
  }
  if (next.startsWith('.')) next = '0' + next
  if (next.length > 1 && next[0] === '0' && next[1] !== '.') {
    next = next.replace(/^0+/, '')
    if (!next) next = '0'
  }
  const dot = next.indexOf('.')
  if (dot >= 0) next = next.slice(0, dot + 3)
  if (next.length > 10) next = next.slice(0, 10)
  return next
}

module.exports = {
  parseAmount,
  fenToStr,
  fenToFixed,
  normalizeInput
}
