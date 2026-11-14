Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '首页' },
      { pagePath: '/pages/list/list', text: '明细' },
      { pagePath: '/pages/stats/stats', text: '统计' },
      { pagePath: '/pages/me/me', text: '我的' }
    ]
  },

  methods: {
    onTap(e) {
      const { index, path } = e.currentTarget.dataset
      if (index === this.data.selected) return
      wx.switchTab({ url: path })
    }
  }
})
