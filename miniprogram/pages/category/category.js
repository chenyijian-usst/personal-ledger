const api = require('../../utils/api')

const EMOJIS = [
  '🍜', '🍚', '☕', '🍎', '🍺', '🍰', '🛒', '👕', '👟', '💄',
  '🏠', '💡', '📱', '🚌', '🚗', '✈️', '🏥', '💊', '📚', '🎓',
  '🎮', '🎬', '🎵', '🏃', '🎁', '🧧', '🐱', '🐶', '💰', '🏆',
  '💼', '📈', '🧾', '💵', '💳', '🏦', '📦', '🧸', '🔧', '🌷'
]

const COLORS = [
  '#FF8A65', '#4FC3F7', '#F06292', '#BA68C8', '#7986CB', '#FFD54F',
  '#4DB6AC', '#E57373', '#64B5F6', '#9575CD', '#81C784', '#FFB74D',
  '#4DD0E1', '#A1887F', '#90A4AE', '#4CAF50', '#FFB300', '#5C6BC0',
  '#26A69A', '#EF5350'
]

Page({
  data: {
    ready: false,
    type: 'expense',
    list: [],
    total: 0,
    emojis: EMOJIS,
    colors: COLORS,
    editor: {
      visible: false,
      id: '',
      name: '',
      icon: '📦',
      color: '#90A4AE'
    }
  },

  onShow() {
    const app = getApp()
    this.setData({ ready: !!app.globalData.ready })
    if (app.globalData.ready) this.load()
  },

  async load() {
    try {
      const all = await api.ensureCategories(true)
      this.all = all
      this.refresh()
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    }
  },

  refresh() {
    const type = this.data.type
    const list = (this.all || [])
      .filter((item) => item.type === type)
      .map((item) => ({ id: item._id, name: item.name, icon: item.icon, color: item.color }))
    this.setData({ list: list, total: (this.all || []).length })
  },

  switchType(e) {
    const type = e.currentTarget.dataset.type
    if (type === this.data.type) return
    this.setData({ type: type }, () => this.refresh())
  },

  openAdd() {
    this.setData({
      editor: { visible: true, id: '', name: '', icon: '📦', color: '#90A4AE' }
    })
  },

  openEdit(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.list.filter((row) => row.id === id)[0]
    if (!item) return
    this.setData({
      editor: { visible: true, id: item.id, name: item.name, icon: item.icon, color: item.color }
    })
  },

  closeEditor() {
    this.setData({ 'editor.visible': false })
  },

  onNameInput(e) {
    this.setData({ 'editor.name': e.detail.value })
  },

  pickEmoji(e) {
    this.setData({ 'editor.icon': e.currentTarget.dataset.emoji })
  },

  pickColor(e) {
    this.setData({ 'editor.color': e.currentTarget.dataset.color })
  },

  async save() {
    const editor = this.data.editor
    const name = (editor.name || '').trim()
    if (!name) {
      wx.showToast({ title: '给分类起个名字', icon: 'none' })
      return
    }
    try {
      await api.callWithToast(
        'category.save',
        {
          id: editor.id || undefined,
          name: name,
          icon: editor.icon,
          color: editor.color,
          type: this.data.type,
          sort: editor.id ? undefined : 900
        },
        '保存中'
      )
      getApp().globalData.categories = null
      this.setData({ 'editor.visible': false })
      wx.showToast({ title: '已保存', icon: 'success' })
      this.load()
    } catch (err) {
      /* 已提示 */
    }
  },

  remove(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.list.filter((row) => row.id === id)[0]
    if (!item) return
    wx.showModal({
      title: '删除分类',
      content: '删除「' + item.name + '」？已经记过的账不受影响，仍会显示原来的名字和图标。',
      confirmColor: '#f2544b',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await api.callWithToast('category.remove', { id: id }, '删除中')
          getApp().globalData.categories = null
          this.load()
        } catch (err) {
          /* 已提示 */
        }
      }
    })
  },

  stopPropagation() {}
})
