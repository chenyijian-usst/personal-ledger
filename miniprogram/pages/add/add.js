const api = require('../../utils/api')
const dateUtil = require('../../utils/date')
const money = require('../../utils/money')

Page({
  data: {
    mode: 'add', // add | edit
    editId: '',
    type: 'expense',
    date: '',
    today: '',
    remark: '',
    amountStr: '',
    categories: [],
    shown: [],
    activeCategoryId: '',
    keypadVisible: false,
    saving: false,
    canSave: false
  },

  onLoad(options) {
    const today = dateUtil.today()
    this.setData({ today: today, date: today })
    if (options && options.id) {
      this.setData({ mode: 'edit', editId: options.id })
      wx.setNavigationBarTitle({ title: '编辑记录' })
    }
    this.loadCategories().then(() => {
      if (options && options.id) this.loadRecord(options.id)
    })
  },

  async loadCategories() {
    try {
      // 用缓存，分类只在「分类管理」里会变，改完那边会清缓存
      const list = await api.ensureCategories()
      this.setData({ categories: list })
      this.refreshShown()
    } catch (err) {
      wx.showToast({ title: err.message || '分类加载失败', icon: 'none' })
    }
  },

  refreshShown(keepActive) {
    const type = this.data.type
    const shown = this.data.categories
      .filter((item) => item.type === type)
      .map((item) =>
        Object.assign({}, item, { seal: (item.name || '未').slice(0, 1) })
      )
    const keep = keepActive && shown.some((item) => item._id === this.data.activeCategoryId)
    this.setData({
      shown: shown,
      activeCategoryId: keep ? this.data.activeCategoryId : shown.length ? shown[0]._id : ''
    })
    this.refreshCanSave()
  },

  async loadRecord(id) {
    wx.showLoading({ title: '加载中', mask: true })
    try {
      const record = await api.call('record.get', { id: id })
      wx.hideLoading()
      this.setData(
        {
          type: record.type || 'expense',
          date: record.date || dateUtil.today(),
          remark: record.remark || '',
          amountStr: money.fenToStr(record.amountFen),
          activeCategoryId: record.categoryId || ''
        },
        () => {
          this.refreshShown(true)
        }
      )
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '记录加载失败', icon: 'none' })
    }
  },

  switchType(e) {
    const type = e.currentTarget.dataset.type
    if (type === this.data.type) return
    this.setData({ type: type, activeCategoryId: '' }, () => this.refreshShown())
  },

  pickCategory(e) {
    this.setData({ activeCategoryId: e.currentTarget.dataset.id })
    this.refreshCanSave()
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value })
  },

  openKeypad() {
    this.setData({ keypadVisible: true })
  },

  closeKeypad() {
    this.setData({ keypadVisible: false })
  },

  onKeyTap(e) {
    const key = e.currentTarget.dataset.key
    let next = this.data.amountStr
    if (key === 'del') {
      next = next.slice(0, -1)
    } else if (key === 'clear') {
      next = ''
    } else {
      next = money.normalizeInput(next + key)
    }
    this.setData({ amountStr: next })
    this.refreshCanSave()
  },

  refreshCanSave() {
    const fen = money.parseAmount(this.data.amountStr)
    this.setData({ canSave: !!fen && !!this.data.activeCategoryId })
  },

  /** 本月是否已经超预算，返回提示文案（没有预算或没超支返回空） */
  async overBudgetTip(month) {
    try {
      const [budget, detail] = await Promise.all([
        api.call('budget.get', { month: month }),
        api.call('record.month', { month: month })
      ])
      if (!budget || !budget.amountFen) return ''
      const spent = (detail.totals && detail.totals.expense) || 0
      if (spent <= budget.amountFen) return ''
      return (
        '本月已花 ' +
        money.fenToFixed(spent) +
        '，预算 ' +
        money.fenToFixed(budget.amountFen) +
        '，已超支 ' +
        money.fenToFixed(spent - budget.amountFen)
      )
    } catch (err) {
      return ''
    }
  },

  async save(again) {
    if (this.data.saving) return
    const fen = money.parseAmount(this.data.amountStr)
    if (!fen) {
      wx.showToast({ title: '请输入正确的金额', icon: 'none' })
      return
    }
    if (!this.data.activeCategoryId) {
      wx.showToast({ title: '选一个分类', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    const payload = {
      type: this.data.type,
      amountFen: fen,
      categoryId: this.data.activeCategoryId,
      date: this.data.date,
      remark: this.data.remark
    }

    try {
      if (this.data.mode === 'edit') {
        payload.id = this.data.editId
        await api.callWithToast('record.update', payload, '保存中')
        this.setData({ saving: false })
        wx.navigateBack()
        return
      }

      await api.callWithToast('record.add', payload, '保存中')
      const app = getApp()
      app.globalData.month = dateUtil.monthOf(this.data.date)
      this.setData({ saving: false })

      const tip = this.data.type === 'expense' ? await this.overBudgetTip(dateUtil.monthOf(this.data.date)) : ''

      if (again) {
        this.setData({ amountStr: '', remark: '' }, () => this.refreshCanSave())
        wx.showToast({ title: '已记一笔', icon: 'success' })
        return
      }

      if (tip) {
        wx.showModal({
          title: '本月预算超支了',
          content: tip,
          showCancel: false,
          confirmText: '知道了',
          complete: () => wx.navigateBack()
        })
        return
      }

      wx.showToast({ title: '已记录', icon: 'success', duration: 600 })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (err) {
      this.setData({ saving: false })
    }
  },

  onSave() {
    this.save(false)
  },

  onSaveAgain() {
    this.save(true)
  }
})
