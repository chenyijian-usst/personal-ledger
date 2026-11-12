const dateUtil = require('../../utils/date')

Page({
  data: {
    ready: false,
    version: '0.1.0',
    monthText: '',
    entries: []
  },

  onLoad() {
    this.setData({
      monthText: dateUtil.monthLabel(dateUtil.currentMonth()),
      entries: [
        { key: 'budget', icon: '🎯', label: '预算设置', desc: '每月额度与超支提醒' },
        { key: 'category', icon: '🏷️', label: '分类管理', desc: '新增、改名、删除分类' },
        { key: 'import', icon: '📥', label: '账单导入', desc: '微信 / 支付宝 CSV' },
        { key: 'export', icon: '📤', label: '数据导出', desc: '导出 CSV 备份' }
      ]
    })
  },

  onShow() {
    this.setData({ ready: !!getApp().globalData.ready })
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
