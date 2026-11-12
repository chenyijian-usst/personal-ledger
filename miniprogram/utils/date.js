/**
 * 日期工具：日期统一用 'YYYY-MM-DD'，月份统一用 'YYYY-MM'
 */

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function pad(n) {
  return n < 10 ? '0' + n : String(n)
}

/** 今天，'YYYY-MM-DD' */
function today() {
  const d = new Date()
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

/** 当前月份，'YYYY-MM' */
function currentMonth() {
  return today().slice(0, 7)
}

/** 'YYYY-MM-DD' -> 'YYYY-MM' */
function monthOf(date) {
  return String(date || '').slice(0, 7)
}

/** 'YYYY-MM' -> 当月第一天与最后一天 */
function monthRange(month) {
  const [y, m] = String(month).split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return {
    start: month + '-01',
    end: month + '-' + pad(last),
    days: last
  }
}

/** 月份加减：shiftMonth('2026-01', -1) -> '2025-12' */
function shiftMonth(month, delta) {
  const [y, m] = String(month).split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1)
}

/** 最近 n 个月（含当月），从旧到新 */
function recentMonths(month, n) {
  const list = []
  for (let i = n - 1; i >= 0; i--) list.push(shiftMonth(month, -i))
  return list
}

/** 星期几：'2026-11-12' -> '周四' */
function weekdayCN(date) {
  const [y, m, d] = String(date).split('-').map(Number)
  return WEEKDAYS[new Date(y, m - 1, d).getDay()]
}

/** 今天 / 昨天 / 11月10日 周四 */
function dayLabel(date) {
  if (date === today()) return '今天'
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const yesterday = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  if (date === yesterday) return '昨天'
  const [, m, day] = String(date).split('-')
  return Number(m) + '月' + Number(day) + '日'
}

/** 'YYYY-MM' -> '2026年11月' */
function monthLabel(month) {
  const [y, m] = String(month).split('-')
  return y + '年' + Number(m) + '月'
}

/** 当月剩余天数（含今天），用于「日均可用」计算 */
function daysLeft(month) {
  const d = new Date()
  if (month !== currentMonth()) return monthRange(month).days
  return monthRange(month).days - d.getDate() + 1
}

/** 当月已过天数 */
function daysPassed(month) {
  if (month !== currentMonth()) return monthRange(month).days
  return new Date().getDate()
}

module.exports = {
  pad,
  today,
  currentMonth,
  monthOf,
  monthRange,
  shiftMonth,
  recentMonths,
  weekdayCN,
  dayLabel,
  monthLabel,
  daysLeft,
  daysPassed
}
