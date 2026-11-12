const config = require('./config')

App({
  globalData: {
    // 云开发环境是否已配置
    ready: false,
    // 是否处于本机演示模式（没配 envId 时为 true，数据存 storage）
    localMode: false,
    // 当前打开的账本月份，页面间共享，例如 2026-11
    month: '',
    // 分类缓存，避免每次进页面都请求
    categories: null
  },

  onLaunch() {
    const localMode = !config.envId
    this.globalData.localMode = localMode

    if (!wx.cloud) {
      // 基础库太老：演示模式还能用，云开发用不了
      this.globalData.ready = localMode
      if (!localMode) console.error('基础库版本过低，请使用 2.2.3 及以上版本')
      return
    }

    if (localMode) {
      // 演示模式：数据存本机，不需要云环境
      this.globalData.ready = true
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
