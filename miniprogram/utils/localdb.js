/**
 * 演示模式：本机数据实现（不需要云开发）
 *
 * 当 config.js 里的 envId 为空时，utils/api.js 会把所有 action 转发到这里，
 * 数据存在 wx.storage 里，接口名和返回结构与云函数完全一致，
 * 所以页面代码一行都不用改。
 *
 * 用途：拿到 AppID / 开通云开发之前，先把界面完整点一遍。
 * 注意：数据只在本机，换设备就没了；账单导入在演示模式下不可用。
 */

const defaults = require('./defaults')

const STORAGE_KEY = 'ledger_demo_db_v1'
const DEMO_FLAG = 'ledger_demo_seeded_v1'

let memory = null
let seq = 1

/* ------------------------------ 存取 ------------------------------ */

function emptyDb() {
  return { categories: [], records: [], budgets: [] }
}

function load() {
  if (memory) return memory
  try {
    const saved = wx.getStorageSync(STORAGE_KEY)
    memory = saved && saved.categories ? saved : emptyDb()
  } catch (err) {
    memory = emptyDb()
  }
  return memory
}

function save() {
  try {
    wx.setStorageSync(STORAGE_KEY, memory)
  } catch (err) {
    // 存储满了也不能让页面崩掉
  }
}

function nextId(prefix) {
  seq += 1
  return prefix + '_' + Date.now().toString(36) + '_' + seq
}

/* ------------------------------ 工具 ------------------------------ */

function pad(n) {
  return n < 10 ? '0' + n : String(n)
}

function todayStr(offsetDays) {
  const d = new Date()
  if (offsetDays) d.setDate(d.getDate() + offsetDays)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function monthRange(month) {
  const parts = String(month).split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  const days = new Date(y, m, 0).getDate()
  return { start: month + '-01', end: month + '-' + pad(days), days: days }
}

function fail(msg) {
  const err = new Error(msg)
  err.isBiz = true
  throw err
}

function assert(cond, msg) {
  if (!cond) fail(msg)
}

function summarize(records) {
  const totals = { expense: 0, income: 0 }
  const map = {}
  records.forEach((item) => {
    const type = item.type === 'income' ? 'income' : 'expense'
    totals[type] += item.amountFen
    if (type !== 'expense') return
    const key = item.categoryId || 'unknown'
    if (!map[key]) {
      map[key] = {
        categoryId: key,
        name: item.categoryName || '未分类',
        icon: item.categoryIcon || '📦',
        color: item.categoryColor || '#90A4AE',
        total: 0,
        count: 0
      }
    }
    map[key].total += item.amountFen
    map[key].count += 1
  })
  const byCategory = Object.keys(map)
    .map((key) => map[key])
    .sort((a, b) => b.total - a.total)
  return {
    totals: {
      expense: totals.expense,
      income: totals.income,
      balance: totals.income - totals.expense
    },
    byCategory: byCategory
  }
}

/* ------------------------------ 初始化 ------------------------------ */

function seedCategories(db) {
  if (db.categories.length) return
  const now = Date.now()
  db.categories = defaults.buildDefaults().map((item, index) => ({
    _id: 'cat_' + index,
    name: item.name,
    icon: item.icon,
    color: item.color,
    type: item.type,
    sort: index,
    createdAt: now
  }))
}

/** 首次进入演示模式时塞几条样例数据，免得四个页面全是空的 */
function seedDemoRecords(db) {
  try {
    if (wx.getStorageSync(DEMO_FLAG)) return
  } catch (err) {
    // 读不到就当作没塞过
  }
  if (db.records.length) return

  const find = (type, name) => {
    const hit = db.categories.filter((c) => c.type === type && c.name === name)[0]
    return hit || db.categories.filter((c) => c.type === type)[0]
  }

  const samples = [
    { type: 'expense', name: '餐饮', amountFen: 2800, date: todayStr(0), remark: '午饭 · 演示数据' },
    { type: 'expense', name: '交通', amountFen: 600, date: todayStr(0), remark: '地铁' },
    { type: 'expense', name: '购物', amountFen: 12900, date: todayStr(-1), remark: '日用品' },
    { type: 'expense', name: '餐饮', amountFen: 4500, date: todayStr(-2), remark: '和同事吃饭' },
    { type: 'expense', name: '娱乐', amountFen: 6800, date: todayStr(-4), remark: '电影票' },
    { type: 'income', name: '工资', amountFen: 1200000, date: todayStr(-5), remark: '本月工资' },
    { type: 'expense', name: '居住', amountFen: 350000, date: todayStr(-8), remark: '房租' },
    { type: 'income', name: '兼职', amountFen: 80000, date: todayStr(-10), remark: '外快' }
  ]

  const now = Date.now()
  db.records = samples.map((item, index) => {
    const category = find(item.type, item.name)
    return {
      _id: 'rec_seed_' + index,
      type: item.type,
      amountFen: item.amountFen,
      date: item.date,
      remark: item.remark,
      categoryId: category ? category._id : '',
      categoryName: category ? category.name : '未分类',
      categoryIcon: category ? category.icon : '📦',
      categoryColor: category ? category.color : '#90A4AE',
      source: 'manual',
      createdAt: now + index,
      updatedAt: now + index
    }
  })

  db.budgets = [{ _id: 'budget_seed', month: todayStr().slice(0, 7), amountFen: 600000 }]

  try {
    wx.setStorageSync(DEMO_FLAG, 1)
  } catch (err) {
    // 忽略
  }
}

function ready() {
  const db = load()
  seedCategories(db)
  seedDemoRecords(db)
  save()
  return db
}

/* ------------------------------ 动作实现 ------------------------------ */

const handlers = {
  'category.list': () => {
    const db = ready()
    return db.categories
      .slice()
      .sort((a, b) => (a.type === b.type ? a.sort - b.sort : a.type < b.type ? -1 : 1))
  },

  'category.save': (payload) => {
    const db = ready()
    const name = String(payload.name || '').trim().slice(0, 20)
    assert(name, '分类名不能为空')
    if (payload.id) {
      const target = db.categories.filter((item) => item._id === payload.id)[0]
      assert(target, '分类不存在')
      target.name = name
      target.icon = payload.icon || '📦'
      target.color = payload.color || '#90A4AE'
      if (payload.sort !== undefined) target.sort = Number(payload.sort)
    } else {
      db.categories.push({
        _id: nextId('cat'),
        name: name,
        icon: payload.icon || '📦',
        color: payload.color || '#90A4AE',
        type: payload.type === 'income' ? 'income' : 'expense',
        sort: Number.isFinite(Number(payload.sort)) ? Number(payload.sort) : 900,
        createdAt: Date.now()
      })
    }
    save()
    return { id: payload.id || db.categories[db.categories.length - 1]._id }
  },

  'category.remove': (payload) => {
    const db = ready()
    assert(payload.id, '缺少分类 ID')
    const index = db.categories.findIndex((item) => item._id === payload.id)
    assert(index >= 0, '分类不存在')
    db.categories.splice(index, 1)
    save()
    return { id: payload.id }
  },

  'record.add': (payload) => {
    const db = ready()
    const amountFen = Math.round(Number(payload.amountFen))
    assert(Number.isFinite(amountFen) && amountFen > 0, '金额不正确')
    assert(/^\d{4}-\d{2}-\d{2}$/.test(payload.date), '日期不正确')
    const category = db.categories.filter((item) => item._id === payload.categoryId)[0]
    const now = Date.now()
    const record = {
      _id: nextId('rec'),
      type: payload.type === 'income' ? 'income' : 'expense',
      amountFen: amountFen,
      date: payload.date,
      remark: String(payload.remark || '').slice(0, 100),
      categoryId: category ? category._id : '',
      categoryName: category ? category.name : '未分类',
      categoryIcon: category ? category.icon : '📦',
      categoryColor: category ? category.color : '#90A4AE',
      source: 'manual',
      createdAt: now,
      updatedAt: now
    }
    db.records.push(record)
    save()
    return { id: record._id }
  },

  'record.update': (payload) => {
    const db = ready()
    const target = db.records.filter((item) => item._id === payload.id)[0]
    assert(target, '记录不存在')
    const amountFen = Math.round(Number(payload.amountFen))
    assert(Number.isFinite(amountFen) && amountFen > 0, '金额不正确')
    assert(/^\d{4}-\d{2}-\d{2}$/.test(payload.date), '日期不正确')
    const category = db.categories.filter((item) => item._id === payload.categoryId)[0]
    target.type = payload.type === 'income' ? 'income' : 'expense'
    target.amountFen = amountFen
    target.date = payload.date
    target.remark = String(payload.remark || '').slice(0, 100)
    target.categoryId = category ? category._id : ''
    target.categoryName = category ? category.name : '未分类'
    target.categoryIcon = category ? category.icon : '📦'
    target.categoryColor = category ? category.color : '#90A4AE'
    target.updatedAt = Date.now()
    save()
    return { id: payload.id }
  },

  'record.remove': (payload) => {
    const db = ready()
    const index = db.records.findIndex((item) => item._id === payload.id)
    assert(index >= 0, '记录不存在')
    db.records.splice(index, 1)
    save()
    return { id: payload.id }
  },

  'record.get': (payload) => {
    const db = ready()
    const target = db.records.filter((item) => item._id === payload.id)[0]
    assert(target, '记录不存在')
    return target
  },

  'record.month': (payload) => {
    const db = ready()
    assert(/^\d{4}-\d{2}$/.test(payload.month), '月份不正确')
    const edge = monthRange(payload.month)
    const records = db.records
      .filter((item) => item.date >= edge.start && item.date <= edge.end)
      .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))
    const summary = summarize(records)
    return {
      month: payload.month,
      daysInMonth: edge.days,
      records: records,
      totals: summary.totals,
      byCategory: summary.byCategory
    }
  },

  'record.overview': (payload) => {
    const db = ready()
    const detail = handlers['record.month'](payload)
    const limit = Math.min(20, Math.max(1, Number(payload.recent) || 8))
    const budget = db.budgets.filter((item) => item.month === payload.month)[0]
    return {
      month: payload.month,
      daysInMonth: detail.daysInMonth,
      count: detail.records.length,
      totals: detail.totals,
      byCategory: detail.byCategory.slice(0, 30),
      recent: detail.records.slice(0, limit),
      budget: budget ? { amountFen: budget.amountFen } : null
    }
  },

  'record.trend': (payload) => {
    const db = ready()
    const months = Array.isArray(payload.months) ? payload.months : []
    return months.map((month) => {
      const edge = monthRange(month)
      const totals = { expense: 0, income: 0 }
      db.records.forEach((item) => {
        if (item.date < edge.start || item.date > edge.end) return
        totals[item.type === 'income' ? 'income' : 'expense'] += item.amountFen
      })
      return { month: month, expense: totals.expense, income: totals.income }
    })
  },

  'budget.get': (payload) => {
    const db = ready()
    assert(/^\d{4}-\d{2}$/.test(payload.month), '月份不正确')
    return db.budgets.filter((item) => item.month === payload.month)[0] || null
  },

  'budget.set': (payload) => {
    const db = ready()
    assert(/^\d{4}-\d{2}$/.test(payload.month), '月份不正确')
    const amountFen = Math.round(Number(payload.amountFen))
    assert(Number.isFinite(amountFen) && amountFen >= 0, '预算金额不正确')
    const existed = db.budgets.filter((item) => item.month === payload.month)[0]
    if (existed) {
      existed.amountFen = amountFen
    } else {
      db.budgets.push({ _id: nextId('budget'), month: payload.month, amountFen: amountFen })
    }
    save()
    return { month: payload.month, amountFen: amountFen }
  },

  /* 演示模式不做 CSV 解码（云函数里才有 TextDecoder），这里明确告知 */
  'import.parse': () => {
    fail('演示模式不支持账单导入，配置好云开发后就能用了')
  },

  'import.commit': () => {
    fail('演示模式不支持账单导入，配置好云开发后就能用了')
  }
}

/* ------------------------------ 对外接口 ------------------------------ */

function call(action, data) {
  return new Promise((resolve, reject) => {
    const handler = handlers[action]
    if (!handler) {
      reject(new Error('演示模式还没实现：' + action))
      return
    }
    try {
      resolve(handler(data || {}))
    } catch (err) {
      reject(err)
    }
  })
}

/** 清空演示数据，方便重新体验 */
function reset() {
  memory = emptyDb()
  try {
    wx.removeStorageSync(STORAGE_KEY)
    wx.removeStorageSync(DEMO_FLAG)
  } catch (err) {
    // 忽略
  }
  save()
}

module.exports = {
  call,
  reset,
  isDemo: true
}
