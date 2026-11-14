const api = require('../../utils/api')
const dateUtil = require('../../utils/date')
const money = require('../../utils/money')

Page({
  data: {
    ready: false,
    loading: true,
    month: '',
    monthText: '',
    expense: '0.00',
    income: '0.00',
    count: 0,
    groups: []
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

  async load() {
    if (!getApp().globalData.ready) return
    this.setData({ loading: true })
    try {
      const detail = await api.call('record.month', { month: this.data.month })
      const totals = detail.totals || { expense: 0, income: 0 }
      this.setData({
        expense: money.fenToFixed(totals.expense),
        income: money.fenToFixed(totals.income),
        count: (detail.records || []).length,
        groups: this.buildGroups(detail.records || [])
      })
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  buildGroups(records) {
    const map = {}
    const order = []

    records.forEach((item) => {
      if (!map[item.date]) {
        map[item.date] = { date: item.date, expense: 0, income: 0, items: [] }
        order.push(item.date)
      }
      const group = map[item.date]
      const isIncome = item.type === 'income'
      group[isIncome ? 'income' : 'expense'] += item.amountFen
      group.items.push({
        id: item._id,
        name: item.categoryName || '未分类',
        remark: item.remark || '',
        isIncome: isIncome,
        amountText: (isIncome ? '+' : '-') + money.fenToFixed(item.amountFen)
      })
    })

    return order.map((date) => {
      const group = map[date]
      const parts = []
      if (group.expense) parts.push('支出 ' + money.fenToFixed(group.expense))
      if (group.income) parts.push('收入 ' + money.fenToFixed(group.income))
      return {
        date: date,
        label: dateUtil.dayLabel(date),
        weekday: dateUtil.weekdayCN(date),
        summary: parts.join('   '),
        items: group.items
      }
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

  onItemTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/add/add?id=' + id })
  },

  onItemLongPress(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || '这条记录'
    wx.showActionSheet({
      itemList: ['删除'],
      itemColor: '#f2544b',
      success: (res) => {
        if (res.tapIndex === 0) this.confirmRemove(id, name)
      }
    })
  },

  confirmRemove(id, name) {
    wx.showModal({
      title: '删除记录',
      content: '确定删除「' + name + '」吗？删除后无法恢复。',
      confirmColor: '#f2544b',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await api.callWithToast('record.remove', { id: id }, '删除中')
          wx.showToast({ title: '已删除', icon: 'success' })
          this.load()
        } catch (err) {
          /* 错误提示已在 callWithToast 里处理 */
        }
      }
    })
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/add/add' })
  },

  goSetup() {
    wx.navigateTo({ url: '/pages/setup/setup' })
  }
})
