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

/* ------------------------------ 账单 CSV ------------------------------ */

const WECHAT_CSV = [
  '微信支付账单明细,,,,,,,',
  '微信昵称：[测试],,,,,,,',
  '----------------------微信支付账单明细列表--------------------,,,,,,,',
  '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注',
  '2026-11-02 12:01:00,商户消费,某某餐厅,午餐,支出,¥35.00,零钱,支付成功,1,11,',
  '2026-11-03 09:15:00,转账,张三,转账,收入,¥200.00,零钱,已存入零钱,2,12,',
  '2026-11-04 20:00:00,商户消费,滴滴出行,快车,支出,¥18.50,零钱,已全额退款,3,13,',
  '2026-11-05 10:00:00,商户消费,某某超市,购物,不计收支,¥50.00,零钱,支付成功,4,14,'
].join('\n')

const ALIPAY_CSV = [
  '支付宝交易记录明细查询,,,,,,,,,,,,,,,,',
  '账号:[test@example.com],,,,,,,,,,,,,,,,',
  '---------------------------------交易记录明细列表------------------------------------,,,,,,,,,,,,,,,,',
  '交易号,商家订单号,交易创建时间,付款时间,最近修改时间,交易来源地,类型,交易对方,商品名称,金额（元）,收/支,交易状态,服务费（元）,成功退款（元）,备注,资金状态',
  '2026110122001,order1,2026-11-01 08:00:00,2026-11-01 08:00:05,2026-11-01 08:00:05,其他,即时到账交易,肯德基,早餐,28.00,支出,交易成功,0.00,0.00,,已支出',
  '2026110222002,order2,2026-11-02 12:00:00,2026-11-02 12:00:05,2026-11-02 12:00:05,其他,即时到账交易,某某公司,工资,15000.00,收入,交易成功,0.00,0.00,,已收入',
  '2026110322003,order3,2026-11-03 12:00:00,,,,其他,即时到账交易,余额宝,转入,1000.00,不计收支,交易成功,0.00,0.00,,已支出'
].join('\n')

async function testCsv() {
  console.log('\n[账单 CSV 解析]')
  const csv = require('../cloudfunctions/api/csv')

  await run('CSV 切分支持引号、字段内逗号与转义引号', async () => {
    const rows = csv.splitCsv('a,b\n"x,1","他""说"\n')
    assert.deepStrictEqual(rows[0], ['a', 'b'])
    assert.deepStrictEqual(rows[1], ['x,1', '他"说'])
  })

  await run('UTF-8 的 BOM 会被去掉', async () => {
    const buffer = Buffer.from('\uFEFF交易时间,金额', 'utf8')
    assert.strictEqual(csv.decode(buffer).slice(0, 4), '交易时间')
  })

  await run('GBK 字节能正确解码（支付宝常见）', async () => {
    const buffer = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]) // “中文” 的 GBK 编码
    assert.strictEqual(csv.decode(buffer), '中文')
  })

  await run('金额写法兼容 ¥ / ￥ / 千分位 / 元 / 负号', async () => {
    assert.strictEqual(csv.parseAmountToFen('¥35.00'), 3500)
    assert.strictEqual(csv.parseAmountToFen('￥1,234.50'), 123450)
    assert.strictEqual(csv.parseAmountToFen('35元'), 3500)
    assert.strictEqual(csv.parseAmountToFen('-12.00'), 1200)
    assert.strictEqual(csv.parseAmountToFen('abc'), null)
    assert.strictEqual(csv.parseAmountToFen('0'), null)
  })

  await run('日期能从带时间的字符串里取出', async () => {
    assert.strictEqual(csv.parseDate('2026-11-02 12:01:00'), '2026-11-02')
    assert.strictEqual(csv.parseDate('2026/1/2 08:00'), '2026-01-02')
    assert.strictEqual(csv.parseDate('2026-02-30'), '')
    assert.strictEqual(csv.parseDate('不是日期'), '')
  })

  await run('关键词猜分类：外卖归餐饮、滴滴归交通', async () => {
    assert.strictEqual(csv.guessCategory('美团外卖', 'expense'), '餐饮')
    assert.strictEqual(csv.guessCategory('滴滴出行 快车', 'expense'), '交通')
    assert.strictEqual(csv.guessCategory('某某公司 工资', 'income'), '工资')
    assert.strictEqual(csv.guessCategory('不认识的商户', 'expense'), '')
  })

  await run('微信账单：跳过退款与不计收支，备注合并交易对方', async () => {
    const parsed = csv.parseBill(WECHAT_CSV)
    assert.strictEqual(parsed.source, 'wechat')
    assert.strictEqual(parsed.rows.length, 2)
    assert.strictEqual(parsed.stats.skipped, 2)
    assert.strictEqual(parsed.rows[0].date, '2026-11-02')
    assert.strictEqual(parsed.rows[0].amountFen, 3500)
    assert.strictEqual(parsed.rows[0].categoryHint, '餐饮')
    assert.strictEqual(parsed.rows[0].remark, '某某餐厅 · 午餐')
    assert.strictEqual(parsed.rows[1].type, 'income')
    assert.strictEqual(parsed.rows[1].amountFen, 20000)
  })

  await run('支付宝账单：识别全角列名与「不计收支」', async () => {
    const parsed = csv.parseBill(ALIPAY_CSV)
    assert.strictEqual(parsed.source, 'alipay')
    assert.strictEqual(parsed.rows.length, 2)
    assert.strictEqual(parsed.stats.skipped, 1)
    assert.strictEqual(parsed.rows[0].amountFen, 2800)
    assert.strictEqual(parsed.rows[0].categoryHint, '餐饮')
    assert.strictEqual(parsed.rows[1].type, 'income')
    assert.strictEqual(parsed.rows[1].amountFen, 1500000)
  })

  await run('看不懂的内容会明确报错而不是静默成功', async () => {
    const res = await api.main({ action: 'import.parse', text: 'hello world\nfoo,bar' }, {})
    assert.strictEqual(res.ok, false)
    assert.ok(res.msg.indexOf('没解析出记录') >= 0)
  })

  await run('导入接口端到端：解析 → 写入 → 汇总', async () => {
    const parsed = await api.main({ action: 'import.parse', text: WECHAT_CSV }, {})
    assert.strictEqual(parsed.ok, true)
    const committed = await call('import.commit', { rows: parsed.data.rows })
    assert.strictEqual(committed.added, 2)

    const again = await call('import.commit', { rows: parsed.data.rows })
    assert.strictEqual(again.added, 0, '同一份账单重复导入不应重复记账')

    const detail = await call('record.month', { month: '2026-11' })
    assert.ok(detail.totals.expense >= 3500)
  })
}

/* ------------------------------ 概览与权限 ------------------------------ */

async function testOptimizations() {
  console.log('\n[首页概览与权限加固]')

  await run('概览一次返回汇总、最近几条和预算', async () => {
    const res = await call('record.overview', { month: '2026-11', recent: 3 })
    assert.ok(res.totals && typeof res.totals.expense === 'number')
    assert.ok(res.recent.length <= 3)
    assert.ok(res.budget && res.budget.amountFen === 500000)
    assert.ok(res.count >= 1)
  })

  await run('没有预算的月份，概览里 budget 为 null', async () => {
    const res = await call('record.overview', { month: '2026-09', recent: 3 })
    assert.strictEqual(res.budget, null)
    assert.strictEqual(res.totals.expense, 0)
  })

  await run('趋势接口一次查询即可给出每月汇总', async () => {
    const list = await call('record.trend', { months: ['2026-09', '2026-10', '2026-11'] })
    assert.deepStrictEqual(
      list.map((item) => item.month),
      ['2026-09', '2026-10', '2026-11']
    )
  })

  await run('别人的分类改不了也删不掉', async () => {
    const created = await call('category.save', {
      name: '临时分类',
      icon: '📦',
      color: '#90A4AE',
      type: 'expense'
    })
    sdk.__setOpenId('intruder')
    try {
      await expectFail('category.save', { id: created.id, name: '黑掉你', type: 'expense' }, '分类不存在')
      await expectFail('category.remove', { id: created.id }, '分类不存在')
    } finally {
      sdk.__setOpenId('test-openid')
    }
    const all = await call('category.list')
    const target = all.filter((item) => item._id === created.id)[0]
    assert.strictEqual(target.name, '临时分类', '分类不应被外人改掉')
    await call('category.remove', { id: created.id })
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
  await testCsv()
  await testOptimizations()

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
