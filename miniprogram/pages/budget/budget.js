const api = require('../../utils/api')
const dateUtil = require('../../utils/date')
const money = require('../../utils/money')

Page({
  data: {
    ready: false,
    loading: true,
    month: '',
    monthText: '',
    input: '',
    hasBudget: false,
    spentText: '0.00',
    budgetText: '0.00',
    leftText: '0.00',
    percent: 0,
    over: false,
    dailyText: '0.00',
    daysLeft: 0
  },

  onLoad(options) {
    const app = getApp()
    const month = (options && options.month) || app.globalData.month || dateUtil.currentMonth()
    this.setData({ month: month, monthText: dateUtil.monthLabel(month) })
  },

  onShow() {
    const app = getApp()
    this.setData({ ready: !!app.globalData.ready })
    if (app.globalData.ready) this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const month = this.data.month
      const [budget, detail] = await Promise.all([
        api.call('budget.get', { month: month }),
        api.call('record.month', { month: month })
      ])
      const spent = (detail.totals && detail.totals.expense) || 0
      const amount = (budget && budget.amountFen) || 0
      this.apply(spent, amount)
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  apply(spent, amount) {
    this.spentFen = spent
    const hasBudget = amount > 0
    const left = amount - spent
    const percent = hasBudget ? Math.min(100, Math.round((spent / amount) * 100)) : 0
    const leftDays = dateUtil.daysLeft(this.data.month)
    const daily = hasBudget && left > 0 && leftDays > 0 ? Math.floor(left / leftDays) : 0

    this.setData({
      hasBudget: hasBudget,
      input: hasBudget ? money.fenToStr(amount) : this.data.input,
      spentText: money.fenToFixed(spent),
      budgetText: money.fenToFixed(amount),
      leftText: money.fenToFixed(left),
      percent: percent,
      over: left < 0,
      dailyText: money.fenToFixed(daily),
      daysLeft: leftDays
    })
  },

  onInput(e) {
    this.setData({ input: money.normalizeInput(e.detail.value) })
  },

  async save() {
    const fen = money.parseAmount(this.data.input)
    if (!fen) {
      wx.showToast({ title: '请输入大于 0 的金额', icon: 'none' })
      return
    }
    try {
      await api.callWithToast('budget.set', { month: this.data.month, amountFen: fen }, '保存中')
      wx.showToast({ title: '预算已保存', icon: 'success' })
      this.load()
    } catch (err) {
      /* 已提示 */
    }
  },

  goSetup() {
    wx.navigateTo({ url: '/pages/setup/setup' })
  }
})
