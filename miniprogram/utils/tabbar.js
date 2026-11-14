/**
 * 自定义 tabBar 的选中态同步。
 * 组件实例由 each 页面持有（this.getTabBar()），所以每个 tab 页在 onShow 里报一下自己是第几个。
 * 页面测试里没有 getTabBar，这里要有兜底，别让测试炸掉。
 */
module.exports = function syncTabBar(page, index) {
  if (!page || typeof page.getTabBar !== 'function') return
  const bar = page.getTabBar()
  if (bar && bar.data && bar.data.selected !== index) {
    bar.setData({ selected: index })
  }
}
