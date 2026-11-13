const dateUtil = require('../../utils/date')
const api = require('../../utils/api')

Page({
  data: {
    ready: false,
    localMode: false,
    version: '0.1.0',
    monthText: '',
    entries: [],
    statsTotal: 0,
    statsRange: '',
    statsLoading: true
  },

  onLoad() {
    this.setData({
      monthText: dateUtil.monthLabel(dateUtil.currentMonth()),
      entries: [
        { key: 'budget', icon: '预', label: '预算设置', desc: '每月额度与超支提醒' },
        { key: 'category', icon: '类', label: '分类管理', desc: '新增、改名、删除分类' },
        { key: 'import', icon: '入', label: '账单导入', desc: '微信 / 支付宝 CSV' },
        { key: 'export', icon: '出', label: '数据导出', desc: '导出 CSV 备份' }
      ]
    })
  },

  onShow() {
    const app = getApp()
    this.setData({ ready: !!app.globalData.ready, localMode: !!app.globalData.localMode })
    if (app.globalData.ready) this.loadStats()
  },

  /** 数据自检：让「数据到底存住没」这件事可以被看见 */
  async loadStats() {
    try {
      const stats = await api.call('record.stats')
      const range =
        stats.firstDate && stats.lastDate
          ? stats.firstDate === stats.lastDate
            ? stats.firstDate
            : stats.firstDate + ' ~ ' + stats.lastDate
          : ''
      this.setData({
        statsTotal: stats.total || 0,
        statsRange: range,
        statsLoading: false
      })
    } catch (err) {
      this.setData({ statsLoading: false })
    }
  },

  onEntryTap(e) {
    const key = e.currentTarget.dataset.key
    const routes = {
      budget: '/pages/budget/budget',
      category: '/pages/category/category',
      import: '/pages/import/import',
      export: '/pages/export/export'
    }
    if (routes[key]) {
      wx.navigateTo({ url: routes[key] })
      return
    }
    wx.showToast({ title: '还没做这个', icon: 'none' })
  },

  goSetup() {
    wx.navigateTo({ url: '/pages/setup/setup' })
  },

  copyEnvHint() {
    wx.setClipboardData({ data: 'miniprogram/config.js' })
  }
})
