/**
 * 云函数业务逻辑的本地回归测试（内存版数据库）
 * 用法：NODE_PATH=tools/stub node tools/test-cloud.js
 */
const assert = require('assert')

const sdk = require('wx-server-sdk')
const api = require('../cloudfunctions/api/index')

const money = require('../miniprogram/utils/money')
const dateUtil = require('../miniprogram/utils/date')

let passed = 0
const failures = []

function ok(name) {
  passed += 1
  console.log('  ✓ ' + name)
}

async function run(name, fn) {
  try {
    await fn()
    ok(name)
  } catch (err) {
    failures.push(name + ' -> ' + err.message)
    console.log('  ✗ ' + name + ' -> ' + err.message)
  }
}

async function call(action, payload) {
  const res = await api.main(Object.assign({ action: action }, payload || {}), {})
  if (!res.ok) throw new Error(action + ' 失败：' + res.msg)
  return res.data
}

async function expectFail(action, payload, keyword) {
  const res = await api.main(Object.assign({ action: action }, payload || {}), {})
  assert.strictEqual(res.ok, false, action + ' 本应失败，却成功了')
  if (keyword) {
    assert.ok(res.msg.indexOf(keyword) >= 0, '错误信息里应包含「' + keyword + '」，实际：' + res.msg)
  }
}

/* ------------------------------ 工具函数 ------------------------------ */

async function testUtils() {
  console.log('\n[金额与日期工具]')
  await run('金额解析接受两位小数、拒绝脏值', async () => {
    assert.strictEqual(money.parseAmount('12.34'), 1234)
    assert.strictEqual(money.parseAmount('12'), 1200)
    assert.strictEqual(money.parseAmount('0.1'), 10)
    assert.strictEqual(money.parseAmount('12.345'), null)
    assert.strictEqual(money.parseAmount('abc'), null)
    assert.strictEqual(money.parseAmount(''), null)
    assert.strictEqual(money.parseAmount('-5'), null)
  })

  await run('分与元互转不丢精度', async () => {
    assert.strictEqual(money.fenToStr(1234), '12.34')
    assert.strictEqual(money.fenToStr(1200), '12')
    assert.strictEqual(money.fenToFixed(1200), '12.00')
    assert.strictEqual(money.fenToFixed(5), '0.05')
  })

  await run('键盘输入规范化', async () => {
    assert.strictEqual(money.normalizeInput('012'), '12')
    assert.strictEqual(money.normalizeInput('.'), '0.')
    assert.strictEqual(money.normalizeInput('1.2.3'), '1.23')
    assert.strictEqual(money.normalizeInput('1.239'), '1.23')
  })

  await run('月份区间与跨年切换', async () => {
    assert.deepStrictEqual(dateUtil.monthRange('2026-02'), { start: '2026-02-01', end: '2026-02-28', days: 28 })
    assert.deepStrictEqual(dateUtil.monthRange('2024-02'), { start: '2024-02-01', end: '2024-02-29', days: 29 })
    assert.strictEqual(dateUtil.shiftMonth('2026-01', -1), '2025-12')
    assert.strictEqual(dateUtil.shiftMonth('2025-12', 1), '2026-01')
    assert.deepStrictEqual(dateUtil.recentMonths('2026-02', 3), ['2025-12', '2026-01', '2026-02'])
  })
}

/* ------------------------------ 分类 ------------------------------ */

async function testCategories() {
  console.log('\n[分类]')
  await run('首次调用自动写入默认分类', async () => {
    const list = await call('category.list')
    assert.strictEqual(list.length, 22)
    assert.strictEqual(list.filter((c) => c.type === 'expense').length, 15)
    assert.strictEqual(list.filter((c) => c.type === 'income').length, 7)
  })

  await run('重复调用不会重复写入', async () => {
    await call('category.list')
    const list = await call('category.list')
    assert.strictEqual(list.length, 22)
  })

  await run('自定义分类可增改删', async () => {
    const created = await call('category.save', { name: '咖啡', icon: '☕', color: '#8D6E63', type: 'expense' })
    assert.ok(created.id)
    const list = await call('category.list')
    assert.strictEqual(list.length, 23)
    await call('category.remove', { id: created.id })
    const after = await call('category.list')
    assert.strictEqual(after.length, 22)
  })
}

/* ------------------------------ 记账 ------------------------------ */

async function testRecords() {
  console.log('\n[记账]')
  const categories = await call('category.list')
  const food = categories.filter((c) => c.type === 'expense' && c.name === '餐饮')[0]
  const salary = categories.filter((c) => c.type === 'income' && c.name === '工资')[0]

  await run('新增支出并快照分类信息', async () => {
    const res = await call('record.add', {
      type: 'expense',
      amountFen: 2550,
      categoryId: food._id,
      date: '2026-11-03',
      remark: '午饭'
    })
    assert.ok(res.id)
    const record = await call('record.get', { id: res.id })
    assert.strictEqual(record.categoryName, '餐饮')
    assert.strictEqual(record.categoryIcon, '🍜')
    assert.strictEqual(record.amountFen, 2550)
  })

  await run('新增收入', async () => {
    await call('record.add', {
      type: 'income',
      amountFen: 1200000,
      categoryId: salary._id,
      date: '2026-11-01',
      remark: '11 月工资'
    })
  })

  await run('月度汇总：总额与分类占比', async () => {
    const detail = await call('record.month', { month: '2026-11' })
    assert.strictEqual(detail.totals.expense, 2550)
    assert.strictEqual(detail.totals.income, 1200000)
    assert.strictEqual(detail.totals.balance, 1197450)
    assert.strictEqual(detail.byCategory.length, 1)
    assert.strictEqual(detail.byCategory[0].name, '餐饮')
    assert.strictEqual(detail.byCategory[0].percent, undefined)
  })

  await run('记录按日期倒序返回', async () => {
    const detail = await call('record.month', { month: '2026-11' })
    assert.strictEqual(detail.records[0].date, '2026-11-03')
  })

  await run('非法金额、非法日期被拒绝', async () => {
    await expectFail('record.add', { type: 'expense', amountFen: 0, categoryId: food._id, date: '2026-11-01' }, '金额')
    await expectFail('record.add', { type: 'expense', amountFen: 100, categoryId: food._id, date: '2026-13-01' }, '日期')
    await expectFail('record.add', { type: 'expense', amountFen: 100, categoryId: food._id, date: '2026-02-30' }, '日期')
  })

  await run('编辑记录会更新金额', async () => {
    const detail = await call('record.month', { month: '2026-11' })
    const target = detail.records.filter((r) => r.type === 'expense')[0]
    await call('record.update', {
      id: target._id,
      type: 'expense',
      amountFen: 3000,
      categoryId: food._id,
      date: '2026-11-03',
      remark: '午饭改'
    })
    const after = await call('record.month', { month: '2026-11' })
    assert.strictEqual(after.totals.expense, 3000)
  })

  await run('删除记录后汇总减少', async () => {
    const detail = await call('record.month', { month: '2026-11' })
    const target = detail.records.filter((r) => r.type === 'expense')[0]
    await call('record.remove', { id: target._id })
    const after = await call('record.month', { month: '2026-11' })
    assert.strictEqual(after.totals.expense, 0)
  })

  await run('别人的记录读不到（越权拦截）', async () => {
    const res = await call('record.add', {
      type: 'expense',
      amountFen: 100,
      categoryId: food._id,
      date: '2026-11-05',
      remark: '越权测试'
    })
    sdk.__setOpenId('another-openid')
    try {
      await expectFail('record.get', { id: res.id }, '记录不存在')
      await expectFail('record.remove', { id: res.id }, '记录不存在')
    } finally {
      sdk.__setOpenId('test-openid')
    }
  })

  await run('趋势接口按月返回汇总', async () => {
    const list = await call('record.trend', { months: ['2026-09', '2026-10', '2026-11'] })
    assert.strictEqual(list.length, 3)
    assert.strictEqual(list[2].month, '2026-11')
    assert.strictEqual(list[2].expense, 100)
  })
}

/* ------------------------------ 预算 ------------------------------ */

async function testBudget() {
  console.log('\n[预算]')
  await run('没有预算时返回 null', async () => {
    const budget = await call('budget.get', { month: '2026-12' })
    assert.strictEqual(budget, null)
  })

  await run('设置预算后能读回', async () => {
    await call('budget.set', { month: '2026-11', amountFen: 300000 })
    const budget = await call('budget.get', { month: '2026-11' })
    assert.strictEqual(budget.amountFen, 300000)
  })

  await run('重复设置是覆盖而不是新增', async () => {
    await call('budget.set', { month: '2026-11', amountFen: 500000 })
    const budget = await call('budget.get', { month: '2026-11' })
    assert.strictEqual(budget.amountFen, 500000)
    const all = (await api.main({ action: 'budget.get', month: '2026-11' }, {})).data
    assert.strictEqual(all.month, '2026-11')
  })

  await run('非法预算被拒绝', async () => {
    await expectFail('budget.set', { month: '2026-11', amountFen: -1 }, '预算')
    await expectFail('budget.set', { month: 'bad', amountFen: 100 }, '月份')
  })
}

/* ------------------------------ 导入 ------------------------------ */

async function testImport() {
  console.log('\n[账单导入]')
  await run('导入去重：同一条账单只进一次', async () => {
    const rows = [
      { date: '2026-10-01', type: 'expense', amountFen: 1200, remark: '早餐', categoryHint: '餐饮' },
      { date: '2026-10-02', type: 'expense', amountFen: 3400, remark: '打车', categoryHint: '交通' },
      { date: '2026-10-02', type: 'expense', amountFen: 3400, remark: '打车', categoryHint: '交通' }
    ]
    const first = await call('import.commit', { rows: rows })
    assert.strictEqual(first.added, 2)
    assert.strictEqual(first.skipped, 1)

    const second = await call('import.commit', { rows: rows })
    assert.strictEqual(second.added, 0)
    assert.strictEqual(second.skipped, 3)
  })

  await run('导入后能按分类归到对应的分类上', async () => {
    const detail = await call('record.month', { month: '2026-10' })
    const names = detail.byCategory.map((c) => c.name).sort()
    assert.deepStrictEqual(names, ['交通', '餐饮'])
  })

  await run('导入里的脏数据被跳过而不是整体失败', async () => {
    const res = await call('import.commit', {
      rows: [
        { date: '2026-10-05', type: 'expense', amountFen: 500, remark: '好数据' },
        { date: '2026-10-32', type: 'expense', amountFen: 500, remark: '坏日期' },
        { date: '2026-10-06', type: 'expense', amountFen: 0, remark: '坏金额' }
      ]
    })
    assert.strictEqual(res.added, 1)
    assert.strictEqual(res.skipped, 2)
  })
}

/* ------------------------------ 入口 ------------------------------ */

async function main() {
  console.log('云函数本地回归测试')
  await testUtils()
  await testCategories()
  await testRecords()
  await testBudget()
  await testImport()

  console.log('\n' + (failures.length ? '有失败用例：' : '全部通过：') + passed + ' 个用例')
  if (failures.length) {
    failures.forEach((f) => console.log('  ✗ ' + f))
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
