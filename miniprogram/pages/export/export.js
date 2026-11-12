const api = require('../../utils/api')
const dateUtil = require('../../utils/date')
const money = require('../../utils/money')

/** CSV 单元格转义：含逗号、引号、换行时要包起来 */
function cell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
}

/** 生成带 BOM 的 UTF-8 CSV，Excel / WPS 打开中文不乱码 */
function buildCsv(records, month) {
  const lines = ['日期,类型,分类,金额(元),备注']
  records
    .slice()
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1))
    .forEach((item) => {
      lines.push(
        [
          item.date,
          item.type === 'income' ? '收入' : '支出',
          item.categoryName || '未分类',
          money.fenToFixed(item.amountFen),
          item.remark || ''
        ]
          .map(cell)
          .join(',')
      )
    })
  lines.push('')
  lines.push('合计支出,' + money.fenToFixed(sum(records, 'expense')))
  lines.push('合计收入,' + money.fenToFixed(sum(records, 'income')))
  lines.push('导出月份,' + month)
  return '\ufeff' + lines.join('\r\n')
}

function sum(records, type) {
  return records.reduce((acc, item) => acc + (item.type === type ? item.amountFen : 0), 0)
}

Page({
  data: {
    ready: false,
    month: '',
    monthText: '',
    count: 0,
    expenseText: '0.00',
    incomeText: '0.00',
    busy: false
  },

  onLoad() {
    const app = getApp()
    const month = app.globalData.month || dateUtil.currentMonth()
    this.setData({ month: month, monthText: dateUtil.monthLabel(month) })
  },

  onShow() {
    const app = getApp()
    this.setData({ ready: !!app.globalData.ready })
    if (app.globalData.ready) this.load()
    else if (app.globalData.month && app.globalData.month !== this.data.month) {
      this.jumpMonth(app.globalData.month)
    }
  },

  async load() {
    try {
      const detail = await api.call('record.month', { month: this.data.month })
      this.records = detail.records || []
      this.setData({
        count: this.records.length,
        expenseText: money.fenToFixed(detail.totals.expense || 0),
        incomeText: money.fenToFixed(detail.totals.income || 0)
      })
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    }
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

  async doExport() {
    if (this.data.busy) return
    if (!this.records || !this.records.length) {
      wx.showToast({ title: '这个月没有记录可导出', icon: 'none' })
      return
    }

    this.setData({ busy: true })
    try {
      this.csvText = buildCsv(this.records, this.data.month)
      const filePath = wx.env.USER_DATA_PATH + '/账本-' + this.data.month + '.csv'
      const fs = wx.getFileSystemManager()
      await new Promise((resolve, reject) => {
        fs.writeFile({
          filePath: filePath,
          data: this.csvText,
          encoding: 'utf8',
          success: resolve,
          fail: reject
        })
      })
      this.setData({ busy: false })
      this.share(filePath)
    } catch (err) {
      this.setData({ busy: false })
      wx.showToast({ title: '导出失败：' + (err.errMsg || err.message || ''), icon: 'none' })
    }
  },

  share(filePath) {
    const fileName = '账本-' + this.data.month + '.csv'
    if (!wx.shareFileMessage) {
      this.copyFallback()
      return
    }
    wx.shareFileMessage({
      filePath: filePath,
      fileName: fileName,
      success: () => {
        wx.showToast({ title: '已发送', icon: 'success' })
      },
      fail: () => this.copyFallback()
    })
  },

  copyFallback() {
    wx.showModal({
      title: '文件已生成',
      content: '可以把它发给「文件传输助手」保存；如果分享失败，也可以把整份 CSV 内容复制出来，粘到表格软件里。',
      confirmText: '复制内容',
      cancelText: '算了',
      success: (res) => {
        if (!res.confirm) return
        wx.setClipboardData({
          data: this.csvText || '',
          success: () => wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
        })
      }
    })
  },

  goSetup() {
    wx.navigateTo({ url: '/pages/setup/setup' })
  }
})
