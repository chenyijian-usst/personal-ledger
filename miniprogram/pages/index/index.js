const api = require('../../utils/api')
const dateUtil = require('../../utils/date')
const money = require('../../utils/money')
const syncTabBar = require('../../utils/tabbar')

Page({
  data: {
    ready: false,
    localMode: false,
    errorMsg: '',
    loading: true,
    month: '',
    monthText: '',
    expense: '0.00',
    income: '0.00',
    balance: '0.00',
    balanceNegative: false,
    count: 0,
    ticks: [25, 50, 75],
    hasBudget: false,
    budgetAmount: '0.00',
    budgetUsed: '0.00',
    budgetPercent: 0,
    budgetLeftText: '',
    budgetOver: false,
    recent: []
  },

  onLoad() {
    const app = getApp()
    const month = app.globalData.month || dateUtil.currentMonth()
    app.globalData.month = month
    this.setData({
      month: month,
      monthText: dateUtil.monthLabel(month),
      localMode: !!app.globalData.localMode
    })
  },

  onShow() {
    syncTabBar(this, 0)
    const app = getApp()
    this.setData({ ready: !!app.globalData.ready, localMode: !!app.globalData.localMode })
    // 在别的页面切过月份时，首页跟着切到同一个月
    if (app.globalData.month && app.globalData.month !== this.data.month) {
      this.setData({
        month: app.globalData.month,
        monthText: dateUtil.monthLabel(app.globalData.month)
      })
    }
    if (app.globalData.ready) this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },

  async load() {
    this.setData({ loading: true })
    try {
      const month = this.data.month
      // 一次请求拿齐：本月汇总 + 最近 8 条 + 预算，比分别拉整月明细快很多
      const overview = await api.call('record.overview', { month: month, recent: 8 })
      this.setData({ errorMsg: '' })
      this.applyDetail(overview, overview.budget)
    } catch (err) {
      // 典型情况：envId 填了但云函数还没部署，把原因直接显示在首页上
      this.setData({ errorMsg: err.message || '加载失败' })
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  applyDetail(detail, budget) {
    const totals = detail.totals || { expense: 0, income: 0, balance: 0 }
    const records = detail.recent || []

    const recent = records.map((item) => ({
      id: item._id,
      name: item.categoryName || '未分类',
      remark: item.remark || '',
      dateText: dateUtil.dayLabel(item.date),
      amountText: (item.type === 'income' ? '+' : '-') + money.fenToFixed(item.amountFen),
      isIncome: item.type === 'income'
    }))

    let patch = {
      expense: money.fenToFixed(totals.expense),
      income: money.fenToFixed(totals.income),
      balance: money.fenToFixed(totals.balance),
      balanceNegative: totals.balance < 0,
      count: detail.count || records.length,
      recent: recent,
      hasBudget: false
    }

    if (budget && budget.amountFen > 0) {
      const used = totals.expense
      const percent = Math.min(100, Math.round((used / budget.amountFen) * 100))
      const left = budget.amountFen - used
      patch.hasBudget = true
      patch.budgetAmount = money.fenToFixed(budget.amountFen)
      patch.budgetUsed = money.fenToFixed(used)
      patch.budgetPercent = percent
      patch.budgetOver = left < 0
      patch.budgetLeftText = left < 0
        ? '超支 ' + money.fenToFixed(-left)
        : '还剩 ' + money.fenToFixed(left)
    }

    this.setData(patch)
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/add/add' })
  },

  goList() {
    wx.switchTab({ url: '/pages/list/list' })
  },

  goBudget() {
    wx.navigateTo({ url: '/pages/budget/budget?month=' + this.data.month })
  },

  goSetup() {
    wx.navigateTo({ url: '/pages/setup/setup' })
  },

  async onRecordTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/add/add?id=' + id })
  }
})
