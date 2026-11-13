const api = require('../../utils/api')
const dateUtil = require('../../utils/date')
const money = require('../../utils/money')

Page({
  data: {
    ready: false,
    loading: true,
    month: '',
    monthText: '',
    type: 'expense',
    totalText: '0.00',
    count: 0,
    rows: [],
    trend: [],
    hasData: false
  },

  onLoad() {
    const app = getApp()
    const month = app.globalData.month || dateUtil.currentMonth()
    this.setData({ month: month, monthText: dateUtil.monthLabel(month) })
  },

  onShow() {
    const app = getApp()
    this.setData({ ready: !!app.globalData.ready })
    if (!app.globalData.ready) return
    const month = app.globalData.month
    if (month && month !== this.data.month) {
      this.setData({ month: month, monthText: dateUtil.monthLabel(month) })
    }
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },

  switchType(e) {
    const type = e.currentTarget.dataset.type
    if (type === this.data.type) return
    this.setData({ type: type }, () => this.rebuild())
  },

  async load() {
    if (!getApp().globalData.ready) return
    this.setData({ loading: true })
    try {
      const months = dateUtil.recentMonths(this.data.month, 6)
      const [detail, trend] = await Promise.all([
        api.call('record.month', { month: this.data.month }),
        api.call('record.trend', { months: months })
      ])
      this.raw = detail.records || []
      this.rawTrend = trend || []
      const totals = detail.totals || { expense: 0, income: 0 }
      this.setData({
        totals: totals,
        trend: this.buildTrend(this.rawTrend)
      })
      this.rebuild()
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  buildTrend(list) {
    let max = 0
    list.forEach((item) => {
      max = Math.max(max, this.data.type === 'income' ? item.income : item.expense)
    })
    return (list || []).map((item) => {
      const value = this.data.type === 'income' ? item.income : item.expense
      const percent = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 4
      return {
        month: item.month,
        label: Number(String(item.month).slice(5, 7)) + '月',
        valueText: money.fenToFixed(value),
        height: percent,
        isCurrent: item.month === this.data.month
      }
    })
  },

  rebuild() {
    const type = this.data.type
    const records = (this.raw || []).filter((item) =>
      type === 'income' ? item.type === 'income' : item.type !== 'income'
    )

    let total = 0
    const map = {}
    records.forEach((item) => {
      total += item.amountFen
      const key = item.categoryId || 'unknown'
      if (!map[key]) {
        map[key] = {
          id: key,
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

    const rows = Object.keys(map)
      .map((key) => map[key])
      .sort((a, b) => b.total - a.total)
      .map((item) => ({
        id: item.id,
        seal: (item.name || '未').slice(0, 1),
        name: item.name,
        icon: item.icon,
        color: item.color,
        count: item.count,
        totalText: money.fenToFixed(item.total),
        percent: total > 0 ? Math.round((item.total / total) * 100) : 0
      }))

    // 切换类型后趋势图按新的口径重算
    const trend = this.buildTrend(this.rawTrend || [])

    this.setData({
      totalText: money.fenToFixed(total),
      count: records.length,
      rows: rows,
      trend: trend,
      hasData: rows.length > 0
    })
  },

  prevMonth() {
    this.jumpMonth(dateUtil.shiftMonth(this.data.month, -1))
  },

  nextMonth() {
    this.jumpMonth(dateUtil.shiftMonth(this.data.month, 1))
  },

  onMonthPick(e) {
    this.jumpMonth(e.detail.value)
  },

  jumpMonth(month) {
    this.setData({ month: month, monthText: dateUtil.monthLabel(month) })
    getApp().globalData.month = month
    this.load()
  },

  goSetup() {
    wx.navigateTo({ url: '/pages/setup/setup' })
  }
})
