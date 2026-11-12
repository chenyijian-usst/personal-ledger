const config = require('./config')

App({
  globalData: {
    // 云开发环境是否已配置
    ready: false,
    // 当前打开的账本月份，页面间共享，例如 2026-11
    month: '',
    // 分类缓存，避免每次进页面都请求
    categories: null
  },

  onLaunch() {
    if (!wx.cloud) {
      this.globalData.ready = false
      console.error('基础库版本过低，请使用 2.2.3 及以上版本')
      return
    }

    if (!config.envId) {
      // 未配置环境：不初始化云开发，由页面展示引导
      this.globalData.ready = false
      return
    }

    try {
      wx.cloud.init({ env: config.envId, traceUser: true })
      this.globalData.ready = true
    } catch (err) {
      this.globalData.ready = false
      console.error('云开发初始化失败', err)
    }
  }
})
