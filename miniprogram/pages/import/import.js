const api = require('../../utils/api')
const money = require('../../utils/money')

const CHUNK = 300

Page({
  data: {
    ready: false,
    stage: 'idle', // idle | parsed
    fileName: '',
    sourceText: '',
    totalCount: 0,
    skippedCount: 0,
    preview: [],
    previewMore: 0,
    pasteMode: false,
    pasteText: '',
    busy: false
  },

  onShow() {
    this.setData({ ready: !!getApp().globalData.ready })
  },

  /* ------------------------------ 选文件 ------------------------------ */

  chooseFile() {
    if (this.data.busy) return
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['csv', 'txt'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) return
        if (file.size > 3 * 1024 * 1024) {
          wx.showToast({ title: '文件超过 3MB，建议按月导出', icon: 'none' })
          return
        }
        this.readAndParse(file.path, file.name)
      },
      fail: () => {
        // 用户取消，不提示
      }
    })
  },

  readAndParse(filePath, fileName) {
    const fs = wx.getFileSystemManager()
    this.setData({ busy: true })
    fs.readFile({
      filePath: filePath,
      encoding: 'base64',
      success: (res) => {
        this.parse({ contentBase64: res.data }, fileName || '账单.csv')
      },
      fail: (err) => {
        this.setData({ busy: false })
        wx.showToast({ title: '读不到这个文件：' + (err.errMsg || ''), icon: 'none' })
      }
    })
  },

  /* ------------------------------ 粘贴解析 ------------------------------ */

  togglePaste() {
    this.setData({ pasteMode: !this.data.pasteMode })
  },

  onPasteInput(e) {
    this.setData({ pasteText: e.detail.value })
  },

  parsePaste() {
    const text = (this.data.pasteText || '').trim()
    if (!text) {
      wx.showToast({ title: '先粘贴账单内容', icon: 'none' })
      return
    }
    if (text.length > 500000) {
      wx.showToast({ title: '内容太长，建议用文件导入', icon: 'none' })
      return
    }
    this.parse({ text: text }, '粘贴的内容')
  },

  /* ------------------------------ 解析 ------------------------------ */

  async parse(payload, fileName) {
    this.setData({ busy: true })
    try {
      const result = await api.callWithToast('import.parse', payload, '解析中')
      const rows = result.rows || []
      const preview = rows.slice(0, 20).map((row, index) => ({
        idx: index,
        date: row.date,
        typeText: row.type === 'income' ? '收入' : '支出',
        isIncome: row.type === 'income',
        amountText: money.fenToFixed(row.amountFen),
        remark: row.remark || '（无备注）',
        hint: row.categoryHint || ''
      }))

      this.rows = rows
      this.setData({
        stage: 'parsed',
        fileName: fileName,
        sourceText:
          result.source === 'wechat' ? '微信支付账单' : result.source === 'alipay' ? '支付宝账单' : '通用账单',
        totalCount: rows.length,
        skippedCount: (result.stats && result.stats.skipped) || 0,
        preview: preview,
        previewMore: Math.max(0, rows.length - preview.length),
        busy: false
      })
    } catch (err) {
      this.setData({ busy: false })
    }
  },

  reset() {
    this.rows = null
    this.setData({
      stage: 'idle',
      fileName: '',
      preview: [],
      totalCount: 0,
      skippedCount: 0,
      pasteText: ''
    })
  },

  /* ------------------------------ 写入 ------------------------------ */

  async commit() {
    const rows = this.rows || []
    if (!rows.length) {
      wx.showToast({ title: '没有可导入的记录', icon: 'none' })
      return
    }
    if (this.data.busy) return

    this.setData({ busy: true })
    wx.showLoading({ title: '导入中', mask: true })
    let added = 0
    let skipped = 0
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const part = rows.slice(i, i + CHUNK)
        const res = await api.call('import.commit', { rows: part })
        added += res.added || 0
        skipped += res.skipped || 0
      }
      wx.hideLoading()
      this.setData({ busy: false })

      const app = getApp()
      app.globalData.categories = null
      if (rows.length) app.globalData.month = rows[0].date.slice(0, 7)

      wx.showModal({
        title: '导入完成',
        content:
          '新增 ' + added + ' 条，跳过 ' + skipped + ' 条（重复或无效）。\n记账分类是自动猜的，可能不准，可以在明细里改。',
        showCancel: false,
        confirmText: '去看明细',
        complete: () => wx.switchTab({ url: '/pages/list/list' })
      })
    } catch (err) {
      wx.hideLoading()
      this.setData({ busy: false })
      wx.showToast({ title: err.message || '导入失败', icon: 'none' })
    }
  },

  goSetup() {
    wx.navigateTo({ url: '/pages/setup/setup' })
  }
})
