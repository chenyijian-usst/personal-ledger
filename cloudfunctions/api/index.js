/**
 * 个人记账小程序：统一数据接口云函数
 *
 * 设计要点：
 * 1. 一个云函数 + action 路由，只需要上传一次，改代码也只上传一次；
 * 2. 所有读写都在云函数里做（管理员权限），客户端不直连数据库，避免权限规则踩坑；
 * 3. 金额统一用整数「分」存储，避免浮点误差；
 * 4. 记录里冗余保存分类的名称/图标/颜色，改分类名不会让历史账单变空。
 */

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const COL_RECORDS = 'records'
const COL_CATEGORIES = 'categories'
const COL_BUDGETS = 'budgets'

const TYPES = ['expense', 'income']

/* ------------------------------ 工具函数 ------------------------------ */

function fail(msg) {
  const err = new Error(msg)
  err.isBiz = true
  throw err
}

function assert(cond, msg) {
  if (!cond) fail(msg)
}

function toInt(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return NaN
  return Math.round(n)
}

function cleanText(value, max) {
  return String(value === undefined || value === null ? '' : value)
    .trim()
    .slice(0, max || 100)
}

function validDate(date) {
  const text = String(date || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const [y, m, d] = text.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

function validMonth(month) {
  return /^\d{4}-\d{2}$/.test(String(month || ''))
}

function monthEdge(month) {
  const [y, m] = String(month).split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  return { start: month + '-01', end: month + '-' + (days < 10 ? '0' + days : days), days }
}

/** 分批把区间内的记录全部取回（个人账单量级足够） */
async function fetchRange(uid, start, end, maxTotal) {
  const pageSize = 200
  const limitTotal = maxTotal || 3000
  const out = []
  let skip = 0
  for (;;) {
    const res = await db
      .collection(COL_RECORDS)
      .where({ uid: uid, date: _.gte(start).and(_.lte(end)) })
      .orderBy('date', 'desc')
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()
    out.push.apply(out, res.data)
    if (res.data.length < pageSize || out.length >= limitTotal) break
    skip += pageSize
  }
  return out.slice(0, limitTotal)
}

/** 汇总：总额 + 分类占比 */
function summarize(records) {
  const totals = { expense: 0, income: 0 }
  const byCategory = {}
  records.forEach((item) => {
    const type = item.type === 'income' ? 'income' : 'expense'
    totals[type] += item.amountFen
    if (type !== 'expense') return
    const key = item.categoryId || 'unknown'
    if (!byCategory[key]) {
      byCategory[key] = {
        categoryId: key,
        name: item.categoryName || '未分类',
        icon: item.categoryIcon || '📦',
        color: item.categoryColor || '#90A4AE',
        total: 0,
        count: 0
      }
    }
    byCategory[key].total += item.amountFen
    byCategory[key].count += 1
  })

  const categories = Object.keys(byCategory)
    .map((key) => byCategory[key])
    .sort((a, b) => b.total - a.total)

  return {
    totals: {
      expense: totals.expense,
      income: totals.income,
      balance: totals.income - totals.expense
    },
    byCategory: categories
  }
}

/* ------------------------------ 分类 ------------------------------ */

const DEFAULT_CATEGORIES = [
  { name: '餐饮', icon: '🍜', color: '#FF8A65', type: 'expense' },
  { name: '交通', icon: '🚌', color: '#4FC3F7', type: 'expense' },
  { name: '购物', icon: '🛍️', color: '#F06292', type: 'expense' },
  { name: '服饰', icon: '👕', color: '#BA68C8', type: 'expense' },
  { name: '居住', icon: '🏠', color: '#7986CB', type: 'expense' },
  { name: '水电', icon: '💡', color: '#FFD54F', type: 'expense' },
  { name: '通讯', icon: '📱', color: '#4DB6AC', type: 'expense' },
  { name: '医疗', icon: '💊', color: '#E57373', type: 'expense' },
  { name: '教育', icon: '📚', color: '#64B5F6', type: 'expense' },
  { name: '娱乐', icon: '🎮', color: '#9575CD', type: 'expense' },
  { name: '运动', icon: '🏃', color: '#81C784', type: 'expense' },
  { name: '人情', icon: '🎁', color: '#FFB74D', type: 'expense' },
  { name: '旅行', icon: '✈️', color: '#4DD0E1', type: 'expense' },
  { name: '宠物', icon: '🐱', color: '#A1887F', type: 'expense' },
  { name: '其他', icon: '📦', color: '#90A4AE', type: 'expense' },
  { name: '工资', icon: '💰', color: '#4CAF50', type: 'income' },
  { name: '奖金', icon: '🏆', color: '#FFB300', type: 'income' },
  { name: '兼职', icon: '💼', color: '#5C6BC0', type: 'income' },
  { name: '理财', icon: '📈', color: '#26A69A', type: 'income' },
  { name: '红包', icon: '🧧', color: '#EF5350', type: 'income' },
  { name: '报销', icon: '🧾', color: '#8D6E63', type: 'income' },
  { name: '其他', icon: '💵', color: '#78909C', type: 'income' }
]

async function listCategories(uid) {
  const res = await db
    .collection(COL_CATEGORIES)
    .where({ uid: uid })
    .orderBy('type', 'asc')
    .orderBy('sort', 'asc')
    .limit(200)
    .get()
  return res.data
}

async function seedCategories(uid) {
  const now = Date.now()
  const data = DEFAULT_CATEGORIES.map((item, index) => ({
    uid: uid,
    name: item.name,
    icon: item.icon,
    color: item.color,
    type: item.type,
    sort: index,
    createdAt: now
  }))
  // 云函数里支持一次性插入多条
  await db.collection(COL_CATEGORIES).add({ data: data })
  return listCategories(uid)
}

async function ensureCategories(uid) {
  const list = await listCategories(uid)
  if (list.length) return list
  return seedCategories(uid)
}

/* ------------------------------ 预算 ------------------------------ */

async function getBudget(uid, month) {
  const res = await db
    .collection(COL_BUDGETS)
    .where({ uid: uid, month: month })
    .limit(1)
    .get()
  return res.data[0] || null
}

async function setBudget(uid, month, amountFen) {
  const existed = await getBudget(uid, month)
  if (existed) {
    await db
      .collection(COL_BUDGETS)
      .doc(existed._id)
      .update({ data: { amountFen: amountFen, updatedAt: Date.now() } })
  } else {
    await db.collection(COL_BUDGETS).add({
      data: { uid: uid, month: month, amountFen: amountFen, createdAt: Date.now() }
    })
  }
  return getBudget(uid, month)
}

/* ------------------------------ 记录 ------------------------------ */

function normalizeRecordInput(input) {
  const type = TYPES.indexOf(input.type) >= 0 ? input.type : 'expense'
  const amountFen = toInt(input.amountFen)
  assert(Number.isFinite(amountFen) && amountFen > 0, '金额不正确')
  assert(amountFen <= 100000000, '金额超出范围')
  assert(validDate(input.date), '日期不正确')

  return {
    type: type,
    amountFen: amountFen,
    categoryId: cleanText(input.categoryId, 64),
    date: input.date,
    remark: cleanText(input.remark, 100)
  }
}

async function categorySnapshot(uid, categoryId) {
  if (!categoryId) return { categoryName: '未分类', categoryIcon: '📦', categoryColor: '#90A4AE' }
  const res = await db.collection(COL_CATEGORIES).doc(categoryId).get()
  const doc = res.data || {}
  if (doc.uid !== uid) return { categoryName: '未分类', categoryIcon: '📦', categoryColor: '#90A4AE' }
  return {
    categoryName: doc.name || '未分类',
    categoryIcon: doc.icon || '📦',
    categoryColor: doc.color || '#90A4AE'
  }
}

async function addRecord(uid, input) {
  const base = normalizeRecordInput(input)
  const snapshot = await categorySnapshot(uid, base.categoryId)
  const now = Date.now()
  const res = await db.collection(COL_RECORDS).add({
    data: Object.assign({}, base, snapshot, {
      uid: uid,
      source: input.source === 'import' ? 'import' : 'manual',
      importHash: input.importHash ? cleanText(input.importHash, 64) : '',
      createdAt: now,
      updatedAt: now
    })
  })
  return { id: res._id }
}

async function updateRecord(uid, input) {
  assert(!!input.id, '缺少记录 ID')
  const existed = await db.collection(COL_RECORDS).doc(input.id).get()
  assert(existed.data && existed.data.uid === uid, '记录不存在')

  const base = normalizeRecordInput(input)
  const snapshot = await categorySnapshot(uid, base.categoryId)
  await db
    .collection(COL_RECORDS)
    .doc(input.id)
    .update({
      data: Object.assign({}, base, snapshot, { updatedAt: Date.now() })
    })
  return { id: input.id }
}

async function removeRecord(uid, id) {
  assert(!!id, '缺少记录 ID')
  const existed = await db.collection(COL_RECORDS).doc(id).get()
  assert(existed.data && existed.data.uid === uid, '记录不存在')
  await db.collection(COL_RECORDS).doc(id).remove()
  return { id: id }
}

async function monthDetail(uid, month, opts) {
  assert(validMonth(month), '月份不正确')
  const edge = monthEdge(month)
  const records = await fetchRange(uid, edge.start, edge.end, (opts && opts.max) || 3000)
  const summary = summarize(records)
  return {
    month: month,
    daysInMonth: edge.days,
    records: records,
    totals: summary.totals,
    byCategory: summary.byCategory
  }
}

async function trend(uid, months) {
  const list = Array.isArray(months) ? months.slice(0, 12) : []
  const out = []
  for (let i = 0; i < list.length; i++) {
    const month = list[i]
    if (!validMonth(month)) continue
    const edge = monthEdge(month)
    const records = await fetchRange(uid, edge.start, edge.end, 3000)
    const totals = { expense: 0, income: 0 }
    records.forEach((item) => {
      const type = item.type === 'income' ? 'income' : 'expense'
      totals[type] += item.amountFen
    })
    out.push({ month: month, expense: totals.expense, income: totals.income })
  }
  return out
}

/* ------------------------------ 导入 ------------------------------ */

function hashOf(row) {
  return [row.date, row.type, row.amountFen, cleanText(row.remark, 40)].join('|')
}

async function importCommit(uid, rows) {
  const list = Array.isArray(rows) ? rows : []
  assert(list.length > 0, '没有可导入的数据')
  assert(list.length <= 1000, '一次最多导入 1000 条')

  const categories = await ensureCategories(uid)
  const byName = {}
  categories.forEach((item) => {
    byName[item.type + ':' + item.name] = item
  })

  const dates = list.map((row) => row.date).filter(validDate).sort()
  assert(dates.length > 0, '导入数据里没有可识别的日期')
  const start = dates[0]
  const end = dates[dates.length - 1]

  const existed = await fetchRange(uid, start, end, 5000)
  const existedHash = {}
  existed.forEach((item) => {
    if (item.importHash) existedHash[item.importHash] = true
    existedHash[hashOf(item)] = true
  })

  const now = Date.now()
  const toInsert = []
  let skipped = 0
  const seen = {}

  list.forEach((raw) => {
    if (!validDate(raw.date)) {
      skipped += 1
      return
    }
    const amountFen = toInt(raw.amountFen)
    if (!Number.isFinite(amountFen) || amountFen <= 0) {
      skipped += 1
      return
    }
    const type = TYPES.indexOf(raw.type) >= 0 ? raw.type : 'expense'
    const remark = cleanText(raw.remark, 100)
    const hash = hashOf({ date: raw.date, type: type, amountFen: amountFen, remark: remark })
    if (existedHash[hash] || seen[hash]) {
      skipped += 1
      return
    }
    seen[hash] = true

    const keyword = cleanText(raw.categoryHint, 20)
    const category =
      (keyword && byName[type + ':' + keyword]) ||
      byName[type + ':其他'] ||
      categories.filter((c) => c.type === type)[0]

    toInsert.push({
      uid: uid,
      type: type,
      amountFen: amountFen,
      categoryId: category ? category._id : '',
      categoryName: category ? category.name : '未分类',
      categoryIcon: category ? category.icon : '📦',
      categoryColor: category ? category.color : '#90A4AE',
      date: raw.date,
      remark: remark,
      source: 'import',
      importHash: hash,
      createdAt: now,
      updatedAt: now
    })
  })

  let added = 0
  const chunk = 100
  for (let i = 0; i < toInsert.length; i += chunk) {
    const slice = toInsert.slice(i, i + chunk)
    if (!slice.length) continue
    await db.collection(COL_RECORDS).add({ data: slice })
    added += slice.length
  }

  return { added: added, skipped: skipped, total: list.length }
}

/* ------------------------------ 初始化 ------------------------------ */

let collectionsReady = null

/** 首次调用时把集合建好，省得手动去控制台新建（已存在会报错，忽略即可） */
function ensureCollections() {
  if (!collectionsReady) {
    collectionsReady = (async () => {
      const names = [COL_RECORDS, COL_CATEGORIES, COL_BUDGETS]
      for (let i = 0; i < names.length; i++) {
        try {
          await db.createCollection(names[i])
        } catch (err) {
          // -502003 / 已存在 都忽略
        }
      }
    })()
  }
  return collectionsReady
}

/* ------------------------------ 入口 ------------------------------ */

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const uid = wxContext.OPENID
  const action = (event && event.action) || ''

  try {
    if (!uid) fail('没拿到用户身份，请在小程序内访问')
    await ensureCollections()

    switch (action) {
      case 'category.list':
        return { ok: true, data: await ensureCategories(uid) }

      case 'category.save': {
        const name = cleanText(event.name, 20)
        assert(!!name, '分类名不能为空')
        const type = TYPES.indexOf(event.type) >= 0 ? event.type : 'expense'
        const payload = {
          name: name,
          icon: cleanText(event.icon, 8) || '📦',
          color: cleanText(event.color, 16) || '#90A4AE',
          type: type,
          sort: Number.isFinite(Number(event.sort)) ? Number(event.sort) : 999,
          updatedAt: Date.now()
        }
        if (event.id) {
          await db.collection(COL_CATEGORIES).doc(event.id).update({ data: payload })
          return { ok: true, data: { id: event.id } }
        }
        payload.uid = uid
        payload.createdAt = Date.now()
        const res = await db.collection(COL_CATEGORIES).add({ data: payload })
        return { ok: true, data: { id: res._id } }
      }

      case 'category.remove': {
        assert(!!event.id, '缺少分类 ID')
        await db.collection(COL_CATEGORIES).doc(event.id).remove()
        return { ok: true, data: { id: event.id } }
      }

      case 'record.add':
        return { ok: true, data: await addRecord(uid, event) }

      case 'record.update':
        return { ok: true, data: await updateRecord(uid, event) }

      case 'record.remove':
        return { ok: true, data: await removeRecord(uid, event.id) }

      case 'record.get': {
        assert(!!event.id, '缺少记录 ID')
        const doc = await db.collection(COL_RECORDS).doc(event.id).get()
        assert(doc.data && doc.data.uid === uid, '记录不存在')
        return { ok: true, data: doc.data }
      }

      case 'record.month':
        return { ok: true, data: await monthDetail(uid, event.month, { max: event.max }) }

      case 'record.trend':
        return { ok: true, data: await trend(uid, event.months) }

      case 'budget.get': {
        assert(validMonth(event.month), '月份不正确')
        return { ok: true, data: await getBudget(uid, event.month) }
      }

      case 'budget.set': {
        assert(validMonth(event.month), '月份不正确')
        const amountFen = toInt(event.amountFen)
        assert(Number.isFinite(amountFen) && amountFen >= 0, '预算金额不正确')
        return { ok: true, data: await setBudget(uid, event.month, amountFen) }
      }

      case 'import.commit':
        return { ok: true, data: await importCommit(uid, event.rows) }

      default:
        return { ok: false, msg: '未知操作：' + action }
    }
  } catch (err) {
    return {
      ok: false,
      msg: err && err.isBiz ? err.message : '服务异常：' + ((err && err.message) || '未知错误')
    }
  }
}
