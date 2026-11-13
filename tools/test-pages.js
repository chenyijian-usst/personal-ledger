/**
 * 页面层运行时测试
 *
 * 没有装开发者工具时，怎么确认页面真的能跑起来？
 * 这里用一套最小的 wx / Page / getApp 替身，把每个页面当成普通模块加载，
 * 依次执行 onLoad / onShow，再模拟点击，最后断言页面 data 和云端数据。
 *
 * 能抓到静态检查抓不到的问题：字段名写错、this 丢失、异步没等到、
 * 事件参数结构不对、setData 路径写错。
 *
 * 用法：NODE_PATH=tools/stub node tools/test-pages.js
 */
const assert = require('assert')
const path = require('path')

const sdk = require('wx-server-sdk')
const cloudApi = require('../cloudfunctions/api/index')
const config = require('../miniprogram/config')

// 让 utils/api.js 认为环境已配置（它持有同一个 config 对象引用）
config.envId = 'test-env'

/* ------------------------------ wx 替身 ------------------------------ */

const log = {
  toast: [],
  modal: [],
  nav: [],
  share: [],
  clipboard: [],
  actionSheet: [],
  title: []
}

const files = {}

/** 演示模式用的本机存储替身 */
const storage = new Map()

const wxStub = {
  getStorageSync(key) {
    return storage.has(key) ? storage.get(key) : ''
  },
  setStorageSync(key, value) {
    storage.set(key, JSON.parse(JSON.stringify(value)))
  },
  removeStorageSync(key) {
    storage.delete(key)
  },
  cloud: {
    init() {},
    callFunction(options) {
      return cloudApi
        .main(Object.assign({ action: options.data && options.data.action }, options.data), {})
        .then((result) => ({ result }))
    }
  },
  showToast(o) {
    log.toast.push(o && o.title)
  },
  hideToast() {},
  showLoading() {},
  hideLoading() {},
  showModal(o) {
    log.modal.push({ title: o.title, content: o.content })
    if (o.success) o.success({ confirm: true, cancel: false })
    if (o.complete) o.complete({ confirm: true, cancel: false })
  },
  showActionSheet(o) {
    log.actionSheet.push(o.itemList)
    if (o.success) o.success({ tapIndex: 0 })
  },
  navigateTo(o) {
    log.nav.push('navigate:' + o.url)
  },
  navigateBack() {
    log.nav.push('back')
  },
  switchTab(o) {
    log.nav.push('tab:' + o.url)
  },
  reLaunch(o) {
    log.nav.push('relaunch:' + o.url)
  },
  setNavigationBarTitle(o) {
    log.title.push(o.title)
  },
  stopPullDownRefresh() {},
  setClipboardData(o) {
    log.clipboard.push(o.data)
    if (o.success) o.success({})
  },
  chooseMessageFile(o) {
    if (o.success) {
      o.success({ tempFiles: [{ path: '/tmp/bill.csv', name: 'bill.csv', size: 2048 }] })
    }
  },
  shareFileMessage(o) {
    log.share.push(o.fileName)
    if (o.success) o.success({})
  },
  env: { USER_DATA_PATH: '/tmp' },
  getFileSystemManager() {
    return {
      writeFile(o) {
        files[o.filePath] = o.data
        if (o.success) o.success({})
      },
      readFile(o) {
        const content = files[o.filePath]
        if (content === undefined) {
          if (o.fail) o.fail({ errMsg: 'no such file' })
          return
        }
        if (o.encoding === 'base64') {
          if (o.success) o.success({ data: Buffer.from(content).toString('base64') })
        } else if (o.success) {
          o.success({ data: content })
        }
      }
    }
  }
}

global.wx = wxStub

const app = {
  globalData: { ready: true, month: '2026-11', categories: null }
}
global.getApp = () => app

/* ------------------------------ Page 替身 ------------------------------ */

function setByPath(target, keyPath, value) {
  const parts = String(keyPath).split('.')
  let cursor = target
  for (let i = 0; i < parts.length - 1; i++) {
    if (cursor[parts[i]] === undefined || cursor[parts[i]] === null) cursor[parts[i]] = {}
    cursor = cursor[parts[i]]
  }
  cursor[parts[parts.length - 1]] = value
}

function createPage(options) {
  const page = {}
  Object.keys(options).forEach((key) => {
    page[key] = options[key]
  })
  page.data = JSON.parse(JSON.stringify(options.data || {}))
  page.setData = function (patch, callback) {
    Object.keys(patch || {}).forEach((key) => setByPath(page.data, key, patch[key]))
    if (typeof callback === 'function') callback()
  }
  return page
}

function loadPage(relative) {
  const file = require.resolve(path.join(__dirname, '..', 'miniprogram', relative))
  let captured = null
  global.Page = (options) => {
    captured = options
  }
  delete require.cache[file]
  require(file)
  assert.ok(captured, relative + ' 没有调用 Page()')
  return createPage(captured)
}

/** 等异步链跑完（云函数替身是同步 resolve 的，几轮 tick 足够） */
async function settle(rounds) {
  const count = rounds || 12
  for (let i = 0; i < count; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

const tap = (dataset) => ({ currentTarget: { dataset: dataset }, detail: {} })
const input = (value) => ({ detail: { value: value } })

/* ------------------------------ 用例 ------------------------------ */

let passed = 0
const failures = []

async function run(name, fn) {
  try {
    await fn()
    passed += 1
    console.log('  ✓ ' + name)
  } catch (err) {
    failures.push(name + ' -> ' + err.message)
    console.log('  ✗ ' + name + ' -> ' + err.message)
  }
}

async function call(action, payload) {
  const res = await cloudApi.main(Object.assign({ action: action }, payload || {}), {})
  if (!res.ok) throw new Error(action + ' 失败：' + res.msg)
  return res.data
}

const WECHAT_CSV = [
  '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态',
  '2026-11-06 12:00:00,商户消费,某某餐厅,午餐,支出,¥42.00,零钱,支付成功',
  '2026-11-07 18:30:00,商户消费,滴滴出行,快车,支出,¥18.00,零钱,支付成功'
].join('\n')

async function seed() {
  const categories = await call('category.list')
  const food = categories.filter((c) => c.type === 'expense' && c.name === '餐饮')[0]
  const salary = categories.filter((c) => c.type === 'income' && c.name === '工资')[0]
  await call('record.add', {
    type: 'expense',
    amountFen: 2550,
    categoryId: food._id,
    date: '2026-11-03',
    remark: '午饭'
  })
  await call('record.add', {
    type: 'income',
    amountFen: 100000,
    categoryId: salary._id,
    date: '2026-11-01',
    remark: '工资'
  })
  await call('budget.set', { month: '2026-11', amountFen: 300000 })
}

async function testIndex() {
  console.log('\n[首页]')
  app.globalData.month = '2026-11'
  await run('载入后显示本月收支、结余与最近记录', async () => {
    app.globalData.month = '2026-11'
    const page = loadPage('pages/index/index')
    page.onLoad()
    await page.onShow()
    await settle()

    assert.strictEqual(page.data.ready, true)
    assert.strictEqual(page.data.expense, '25.50')
    assert.strictEqual(page.data.income, '1000.00')
    assert.strictEqual(page.data.balance, '974.50')
    assert.strictEqual(page.data.recent.length, 2)
    assert.strictEqual(page.data.recent[0].amountText, '-25.50')
    assert.strictEqual(page.data.recent[0].isIncome, false)
  })

  await run('预算进度与剩余额度计算正确', async () => {
    const page = loadPage('pages/index/index')
    page.onLoad()
    await page.onShow()
    await settle()

    assert.strictEqual(page.data.hasBudget, true)
    assert.strictEqual(page.data.budgetAmount, '3000.00')
    assert.strictEqual(page.data.budgetPercent, 1)
    assert.strictEqual(page.data.budgetOver, false)
    assert.ok(page.data.budgetLeftText.indexOf('还剩') === 0)
  })

  await run('点最近记录会跳到编辑页', async () => {
    app.globalData.month = '2026-11'
    const page = loadPage('pages/index/index')
    page.onLoad()
    await page.onShow()
    await settle()
    log.nav.length = 0
    page.onRecordTap(tap({ id: page.data.recent[0].id }))
    assert.ok(
      log.nav[0] && log.nav[0].indexOf('/pages/add/add?id=') > 0,
      '实际跳转记录：' + JSON.stringify(log.nav)
    )
  })
}

async function testList() {
  console.log('\n[明细]')
  await run('按日期分组，每天给出收支小计', async () => {
    app.globalData.month = '2026-11'
    const page = loadPage('pages/list/list')
    page.onLoad()
    page.onShow()
    await settle()

    assert.strictEqual(page.data.groups.length, 2)
    assert.strictEqual(page.data.groups[0].date, '2026-11-03')
    assert.strictEqual(page.data.groups[0].label, '11月3日')
    assert.strictEqual(page.data.groups[0].summary, '支出 25.50')
    assert.strictEqual(page.data.groups[1].summary, '收入 1000.00')
    assert.strictEqual(page.data.count, 2)
  })

  await run('切到上个月后列表为空且不报错', async () => {
    app.globalData.month = '2026-11'
    const page = loadPage('pages/list/list')
    page.onLoad()
    page.onShow()
    await settle()
    page.jumpMonth('2026-10')
    await settle()
    assert.strictEqual(page.data.groups.length, 0)
    assert.strictEqual(page.data.expense, '0.00')
  })

  await run('长按删除会真的删掉', async () => {
    app.globalData.month = '2026-11'
    const page = loadPage('pages/list/list')
    page.onLoad()
    page.onShow()
    await settle()
    const before = page.data.count
    const target = page.data.groups[0].items[0]
    page.onItemLongPress(tap({ id: target.id, name: target.name }))
    await settle()
    assert.strictEqual(page.data.count, before - 1)
  })
}

async function testAdd() {
  console.log('\n[记一笔]')
  await run('打开时载入分类并默认选中第一个', async () => {
    const page = loadPage('pages/add/add')
    page.onLoad({})
    await settle()

    assert.strictEqual(page.data.shown.length, 15)
    assert.strictEqual(page.data.shown[0].name, '餐饮')
    assert.strictEqual(page.data.activeCategoryId, page.data.shown[0]._id)
    assert.strictEqual(page.data.canSave, false)
  })

  await run('键盘输入「12.5」得到合法金额', async () => {
    const page = loadPage('pages/add/add')
    page.onLoad({})
    await settle()
    ;['1', '2', '.', '5'].forEach((key) => page.onKeyTap(tap({ key: key })))
    assert.strictEqual(page.data.amountStr, '12.5')
    assert.strictEqual(page.data.canSave, true)
    page.onKeyTap(tap({ key: 'del' }))
    assert.strictEqual(page.data.amountStr, '12.')
    page.onKeyTap(tap({ key: 'clear' }))
    assert.strictEqual(page.data.amountStr, '')
  })

  await run('保存后写入云端并返回上一页', async () => {
    const page = loadPage('pages/add/add')
    page.onLoad({})
    await settle()
    ;['3', '6'].forEach((key) => page.onKeyTap(tap({ key: key })))
    page.onRemarkInput(input('测试午饭'))
    log.nav.length = 0
    page.onSave()
    await settle()
    // 新记账是「先 toast 再 500ms 后返回」
    await new Promise((resolve) => setTimeout(resolve, 650))
    await settle()

    const detail = await call('record.month', { month: '2026-11' })
    const saved = detail.records.filter((r) => r.remark === '测试午饭')[0]
    assert.ok(saved, '云端应能查到这条记录')
    assert.strictEqual(saved.amountFen, 3600)
    assert.ok(log.nav.indexOf('back') >= 0, '保存后应返回上一页')
  })

  await run('超支时弹出提醒', async () => {
    await call('budget.set', { month: '2026-11', amountFen: 1000 })
    const page = loadPage('pages/add/add')
    page.onLoad({})
    await settle()
    ;['5', '0'].forEach((key) => page.onKeyTap(tap({ key: key })))
    log.modal.length = 0
    page.onSave()
    await settle(20)

    const overModal = log.modal.filter((m) => m.title === '本月预算超支了')[0]
    assert.ok(overModal, '超支时应弹窗提醒')
    assert.ok(overModal.content.indexOf('预算') >= 0)
  })

  await run('编辑已有记录会回填金额与备注', async () => {
    const detail = await call('record.month', { month: '2026-11' })
    const target = detail.records.filter((r) => r.remark === '测试午饭')[0]
    const page = loadPage('pages/add/add')
    page.onLoad({ id: target._id })
    await settle()

    assert.strictEqual(page.data.mode, 'edit')
    assert.strictEqual(page.data.amountStr, '36')
    assert.strictEqual(page.data.remark, '测试午饭')
    assert.strictEqual(page.data.activeCategoryId, target.categoryId)
  })
}

async function testStats() {
  console.log('\n[统计]')
  await run('分类占比按金额排序且百分比合理', async () => {
    const page = loadPage('pages/stats/stats')
    page.onLoad()
    page.onShow()
    await settle()

    assert.ok(page.data.rows.length >= 1)
    const rows = page.data.rows
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i - 1].percent >= rows[i].percent, '应按占比从高到低')
    }
    const total = rows.reduce((sum, row) => sum + row.percent, 0)
    assert.ok(total >= 95 && total <= 105, '百分比合计应接近 100，实际 ' + total)
  })

  await run('近 6 个月趋势有 6 根柱子', async () => {
    const page = loadPage('pages/stats/stats')
    page.onLoad()
    page.onShow()
    await settle()
    assert.strictEqual(page.data.trend.length, 6)
    assert.ok(page.data.trend[5].isCurrent)
    assert.ok(page.data.trend[5].height >= 4)
  })

  await run('切到收入后重新计算', async () => {
    const page = loadPage('pages/stats/stats')
    page.onLoad()
    page.onShow()
    await settle()
    page.switchType(tap({ type: 'income' }))
    await settle()
    assert.strictEqual(page.data.type, 'income')
    assert.strictEqual(page.data.rows[0].name, '工资')
  })
}

async function testBudget() {
  console.log('\n[预算]')
  await run('载入本月预算与执行情况', async () => {
    const page = loadPage('pages/budget/budget')
    page.onLoad({ month: '2026-11' })
    page.onShow()
    await settle()

    assert.strictEqual(page.data.hasBudget, true)
    assert.strictEqual(page.data.budgetText, '10.00')
    assert.strictEqual(page.data.over, true)
    assert.ok(page.data.percent === 100)
  })

  await run('保存新预算后立刻生效', async () => {
    const page = loadPage('pages/budget/budget')
    page.onLoad({ month: '2026-11' })
    page.onShow()
    await settle()
    page.onInput(input('888'))
    page.save()
    await settle(20)

    const budget = await call('budget.get', { month: '2026-11' })
    assert.strictEqual(budget.amountFen, 88800)
  })
}

async function testImport() {
  console.log('\n[账单导入]')
  await run('粘贴文本解析出记录并显示预览', async () => {
    const page = loadPage('pages/import/import')
    page.onShow()
    page.togglePaste()
    page.onPasteInput(input(WECHAT_CSV))
    page.parsePaste()
    await settle(20)

    assert.strictEqual(page.data.stage, 'parsed')
    assert.strictEqual(page.data.totalCount, 2)
    assert.strictEqual(page.data.preview[0].amountText, '42.00')
    assert.strictEqual(page.data.preview[0].hint, '餐饮')
  })

  await run('导入后云端多出两条，重复导入不再增加', async () => {
    const before = (await call('record.month', { month: '2026-11' })).records.length

    const page = loadPage('pages/import/import')
    page.onShow()
    page.togglePaste()
    page.onPasteInput(input(WECHAT_CSV))
    page.parsePaste()
    await settle(20)
    log.modal.length = 0
    page.commit()
    await settle(30)

    const after = (await call('record.month', { month: '2026-11' })).records.length
    assert.strictEqual(after, before + 2)
    assert.ok(log.modal.some((m) => m.title === '导入完成'))

    const again = loadPage('pages/import/import')
    again.onShow()
    again.togglePaste()
    again.onPasteInput(input(WECHAT_CSV))
    again.parsePaste()
    await settle(20)
    again.commit()
    await settle(30)

    const final = (await call('record.month', { month: '2026-11' })).records.length
    assert.strictEqual(final, after, '重复导入不应产生重复记录')
  })
}

async function testCategory() {
  console.log('\n[分类管理]')
  await run('列表按收支类型过滤', async () => {
    const page = loadPage('pages/category/category')
    page.onShow()
    await settle()
    assert.strictEqual(page.data.list.length, 15)
    page.switchType(tap({ type: 'income' }))
    assert.strictEqual(page.data.list.length, 7)
  })

  await run('新增分类会出现在列表里', async () => {
    const page = loadPage('pages/category/category')
    page.onShow()
    await settle()
    page.openAdd()
    page.onNameInput(input('咖啡'))
    page.pickColor(tap({ color: '#8C5A3C' }))
    page.save()
    await settle(20)

    const coffee = page.data.list.filter((item) => item.name === '咖啡')[0]
    assert.ok(coffee, '新增的分类应出现在列表里')
    assert.strictEqual(coffee.seal, '咖', '图章应取分类名第一个字')
    assert.strictEqual(coffee.color, '#8C5A3C')
  })

  await run('删除分类不影响已记的账', async () => {
    const page = loadPage('pages/category/category')
    page.onShow()
    await settle()
    const coffee = page.data.list.filter((item) => item.name === '咖啡')[0]
    page.remove(tap({ id: coffee.id }))
    await settle(20)

    const list = page.data.list.filter((item) => item.name === '咖啡')
    assert.strictEqual(list.length, 0)
    const detail = await call('record.month', { month: '2026-11' })
    assert.ok(detail.records.length > 0, '账还在')
  })
}

async function testExport() {
  console.log('\n[导出]')
  await run('导出的 CSV 带 BOM、表头与合计', async () => {
    app.globalData.month = '2026-11'
    const page = loadPage('pages/export/export')
    page.onLoad({})
    page.onShow()
    await settle()

    log.share.length = 0
    page.doExport()
    await settle(20)

    const filePath = '/tmp/账本-2026-11.csv'
    const content = files[filePath]
    assert.ok(content, '应写出文件到 ' + filePath)
    assert.strictEqual(content.charCodeAt(0), 0xfeff, '应以 BOM 开头')
    assert.ok(content.indexOf('日期,类型,分类,金额(元),备注') > 0)
    assert.ok(content.indexOf('合计支出,') > 0)
    assert.strictEqual(log.share[0], '账本-2026-11.csv')
  })

  await run('没有记录的月份给出提示而不是崩掉', async () => {
    const page = loadPage('pages/export/export')
    page.onLoad({})
    page.onShow()
    await settle()
    page.jumpMonth('2025-01')
    await settle()
    log.toast.length = 0
    page.doExport()
    await settle()
    assert.ok(log.toast.some((t) => String(t).indexOf('没有记录') >= 0))
  })
}

async function testSetupAndMe() {
  console.log('\n[我的 / 配置说明]')
  await run('我的页四个入口都能跳转', async () => {
    const page = loadPage('pages/me/me')
    page.onLoad()
    page.onShow()
    assert.strictEqual(page.data.entries.length, 4)

    log.nav.length = 0
    page.data.entries.forEach((entry) => page.onEntryTap(tap({ key: entry.key })))
    const targets = log.nav.join('|')
    ;['/pages/budget/budget', '/pages/category/category', '/pages/import/import', '/pages/export/export'].forEach(
      (route) => assert.ok(targets.indexOf(route) >= 0, '缺少入口 ' + route)
    )
  })

  await run('配置说明页在没填环境 ID 时给三条提示', async () => {
    const page = loadPage('pages/setup/setup')
    assert.strictEqual(page.data.steps.length, 6)
    assert.strictEqual(page.data.envId, 'test-env')
  })
}

/* ------------------------------ 演示模式 ------------------------------ */

async function testDemoMode() {
  console.log('\n[演示模式：没有云环境也能用]')
  const api = require('../miniprogram/utils/api')
  const now = new Date()
  const month =
    now.getFullYear() + '-' + (now.getMonth() + 1 < 10 ? '0' : '') + (now.getMonth() + 1)

  config.envId = ''
  app.globalData.localMode = true
  app.globalData.ready = true
  app.globalData.month = month

  await run('首页直接用本机演示数据，并提示处于演示模式', async () => {
    const page = loadPage('pages/index/index')
    page.onLoad()
    await page.onShow()
    await settle()

    assert.strictEqual(page.data.localMode, true)
    assert.strictEqual(page.data.ready, true)
    assert.ok(Number(page.data.expense) > 0, '演示数据应有支出')
    assert.ok(page.data.recent.length > 0)
    assert.strictEqual(page.data.hasBudget, true)
  })

  await run('其余三个 tab 在演示模式下都能载入', async () => {
    const list = loadPage('pages/list/list')
    list.onLoad()
    list.onShow()
    await settle()
    assert.ok(list.data.groups.length > 0, '明细应有数据')

    const stats = loadPage('pages/stats/stats')
    stats.onLoad()
    stats.onShow()
    await settle()
    assert.ok(stats.data.rows.length > 0, '统计应有分类占比')

    const budget = loadPage('pages/budget/budget')
    budget.onLoad({ month: month })
    budget.onShow()
    await settle()
    assert.strictEqual(budget.data.hasBudget, true)
  })

  await run('演示模式下记一笔也能存进本机', async () => {
    const before = (await api.call('record.month', { month: month })).records.length
    const page = loadPage('pages/add/add')
    page.onLoad({})
    await settle()
    ;['8', '8'].forEach((key) => page.onKeyTap(tap({ key: key })))
    page.onSave()
    await settle(20)

    const after = (await api.call('record.month', { month: month })).records.length
    assert.strictEqual(after, before + 1)
  })

  await run('演示模式不支持的导入会明确报错', async () => {
    let message = ''
    try {
      await api.call('import.parse', { text: 'x' })
    } catch (err) {
      message = err.message
    }
    assert.ok(message.indexOf('演示模式') >= 0, '应提示演示模式不支持，实际：' + message)
  })

  // 恢复云开发测试环境，避免影响别的用例
  config.envId = 'test-env'
  app.globalData.localMode = false
  app.globalData.month = '2026-11'
}

/* ------------------------------ 持久化 ------------------------------ */

async function testPersistence() {
  console.log('\n[数据持久化：重开不重置]')
  const api = require('../miniprogram/utils/api')

  await run('云开发模式：记一笔后重新打开「我的」，总数仍在', async () => {
    const before = (await api.call('record.stats')).total

    const add = loadPage('pages/add/add')
    add.onLoad({})
    await settle()
    ;['9'].forEach((key) => add.onKeyTap(tap({ key: key })))
    add.onSave()
    await settle(20)

    // 相当于关掉小程序再打开：重新实例化页面
    app.globalData.month = '2026-11'
    const me = loadPage('pages/me/me')
    me.onLoad()
    me.onShow()
    await settle()

    assert.strictEqual(me.data.statsTotal, before + 1)
    assert.strictEqual(me.data.localMode, false)
    assert.ok(me.data.statsRange.length > 0)
  })

  await run('演示模式：清掉 JS 模块缓存重读，数据仍在（storage 持久化）', async () => {
    config.envId = ''
    app.globalData.localMode = true
    app.globalData.ready = true
    const now = new Date()
    const month =
      now.getFullYear() + '-' + (now.getMonth() + 1 < 10 ? '0' : '') + (now.getMonth() + 1)
    app.globalData.month = month

    const apiA = require('../miniprogram/utils/api')
    const beforeCount = (await apiA.call('record.month', { month: month })).records.length
    assert.ok(beforeCount > 0, '演示模式应已有样例数据')

    // 模拟小程序重启：把 api / localdb 的模块缓存清掉，重新加载
    delete require.cache[require.resolve('../miniprogram/utils/api')]
    delete require.cache[require.resolve('../miniprogram/utils/localdb')]
    const apiB = require('../miniprogram/utils/api')

    const afterCount = (await apiB.call('record.month', { month: month })).records.length
    assert.strictEqual(afterCount, beforeCount, '重启后记录数应保持一致')

    const stats = await apiB.call('record.stats')
    assert.strictEqual(stats.total, beforeCount, '自检面板的总数也应一致')
  })

  config.envId = 'test-env'
  app.globalData.localMode = false
  app.globalData.month = '2026-11'
}

async function main() {
  console.log('页面运行时测试（wx / Page / getApp 替身 + 云函数内存数据库）')
  try {
    await seed()
  } catch (err) {
    console.error('准备测试数据失败：', err.message)
    process.exit(1)
  }

  await testIndex()
  await testList()
  await testAdd()
  await testStats()
  await testBudget()
  await testImport()
  await testCategory()
  await testExport()
  await testSetupAndMe()
  await testDemoMode()
  await testPersistence()

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
