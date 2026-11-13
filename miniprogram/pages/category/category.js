const api = require('../../utils/api')

const COLORS = [
  '#23201B', '#6E6455', '#B03A2E', '#A8761F', '#2F6B4E', '#2B3A44',
  '#7A4E7E', '#1F6F78', '#8C5A3C', '#4A5568', '#9C3B5A', '#5B6C3F'
]

Page({
  data: {
    ready: false,
    type: 'expense',
    list: [],
    total: 0,
    colors: COLORS,
    editor: {
      visible: false,
      id: '',
      name: '',
      color: '#23201B',
      seal: '分'
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
      .map((item) => ({
        id: item._id,
        name: item.name,
        color: item.color || '#23201B',
        seal: (item.name || '未').slice(0, 1)
      }))
    this.setData({ list: list, total: (this.all || []).length })
  },

  switchType(e) {
    const type = e.currentTarget.dataset.type
    if (type === this.data.type) return
    this.setData({ type: type }, () => this.refresh())
  },

  openAdd() {
    this.setData({
      editor: { visible: true, id: '', name: '', color: '#23201B', seal: '分' }
    })
  },

  openEdit(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.list.filter((row) => row.id === id)[0]
    if (!item) return
    this.setData({
      editor: {
        visible: true,
        id: item.id,
        name: item.name,
        color: item.color,
        seal: item.seal
      }
    })
  },

  closeEditor() {
    this.setData({ 'editor.visible': false })
  },

  onNameInput(e) {
    const name = e.detail.value
    this.setData({
      'editor.name': name,
      'editor.seal': (name || '').trim().slice(0, 1) || '分'
    })
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
          // 图标字段保留，但存的是单字，不再用 emoji
          icon: (name || '分').slice(0, 1),
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
      content: '删除「' + item.name + '」？已经记过的账不受影响，仍会显示原来的名字和单字章。',
      confirmColor: '#b03a2e',
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
  }
})
