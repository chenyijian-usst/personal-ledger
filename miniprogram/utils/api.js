/**
 * 云函数调用封装
 *
 * 所有数据读写都走云函数 `api`，一个入口 + action 路由，方便一次部署。
 * 客户端不直连数据库，避免权限规则写错导致数据越权或写入失败。
 */

const config = require('../config')

/** 云函数返回的错误信息友好化 */
function friendlyError(err) {
  const raw = (err && (err.errMsg || err.message)) || '未知错误'
  if (/env.*not.*exist|invalid env|envId/i.test(raw)) {
    return '云开发环境 ID 不正确，请检查 miniprogram/config.js'
  }
  if (/FUNCTION_NOT_FOUND|function not found|-501000/i.test(raw)) {
    return '云函数 api 还没部署，请先在开发者工具里上传它'
  }
  if (/cloud.*init|not initialized/i.test(raw)) {
    return '云开发尚未初始化，请检查环境配置'
  }
  return raw
}

/**
 * 调用云函数
 * @param {string} action 动作名，如 'record.add'
 * @param {object} data 参数
 * @returns {Promise<any>} 成功时 resolve 云函数返回的 data
 */
function call(action, data) {
  return new Promise((resolve, reject) => {
    if (!config.envId) {
      reject(new Error('还没有配置云开发环境 ID'))
      return
    }
    if (!wx.cloud) {
      reject(new Error('当前基础库不支持云开发'))
      return
    }

    wx.cloud
      .callFunction({
        name: 'api',
        data: Object.assign({ action: action }, data || {})
      })
      .then((res) => {
        const result = res && res.result
        if (!result) {
          reject(new Error('云函数没有返回结果'))
          return
        }
        if (result.ok) {
          resolve(result.data)
        } else {
          reject(new Error(result.msg || '操作失败'))
        }
      })
      .catch((err) => reject(new Error(friendlyError(err))))
  })
}

/** 带 loading 与失败提示的调用，页面里最常用 */
async function callWithToast(action, data, loadingText) {
  wx.showLoading({ title: loadingText || '处理中', mask: true })
  try {
    const result = await call(action, data)
    wx.hideLoading()
    return result
  } catch (err) {
    wx.hideLoading()
    wx.showToast({ title: err.message || '操作失败', icon: 'none', duration: 2500 })
    throw err
  }
}

/** 首次使用时写入默认分类，已有分类则直接返回 */
async function ensureCategories(force) {
  const app = getApp()
  if (!force && app.globalData.categories && app.globalData.categories.length) {
    return app.globalData.categories
  }
  const categories = await call('category.list')
  app.globalData.categories = categories || []
  return app.globalData.categories
}

module.exports = {
  call,
  callWithToast,
  ensureCategories
}
