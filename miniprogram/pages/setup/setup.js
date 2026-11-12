const config = require('../../config')

Page({
  data: {
    envId: config.envId || '',
    steps: [
      {
        title: '注册小程序，拿到 AppID',
        desc: '打开 mp.weixin.qq.com 注册「小程序」，主体选个人，免费。注册完在「开发管理 - 开发设置」里复制 AppID。',
        code: 'project.config.json -> "appid": "你的AppID"'
      },
      {
        title: '开通云开发',
        desc: '用微信开发者工具打开本项目，点顶部工具栏的「云开发」，按提示开通（选按量付费即可，个人用量很小）。开通后复制环境 ID。',
        code: '云开发控制台 -> 设置 -> 环境ID，形如 ledger-1g2h3i4j5'
      },
      {
        title: '把环境 ID 填进来',
        desc: '打开 miniprogram/config.js，把 envId 填成刚复制的环境 ID，保存后重新编译。',
        code: "envId: 'ledger-1g2h3i4j5'"
      },
      {
        title: '上传云函数',
        desc: '在开发者工具左侧文件树里，右键 cloudfunctions/api 目录，选「上传并部署：云端安装依赖」。第一次会装 wx-server-sdk，等它跑完。',
        code: '右键 cloudfunctions/api -> 上传并部署：云端安装依赖'
      },
      {
        title: '第一次打开会自动建表',
        desc: '云函数会自动创建 records、categories、budgets 三个集合，并写入默认分类。如果提示集合不存在，去云开发控制台手动新建这三个集合即可。',
        code: '集合：records / categories / budgets'
      },
      {
        title: '自己用不需要上线',
        desc: '点「预览」扫码就能在手机上用；想长期用，点「上传」做成体验版，再在小程序后台把自己加为体验成员。体验版不用提交审核。',
        code: '上传 -> 体验版 -> 添加体验成员'
      }
    ]
  },

  copyEnvId() {
    if (!this.data.envId) {
      wx.showToast({ title: '还没填环境 ID', icon: 'none' })
      return
    }
    wx.setClipboardData({ data: this.data.envId })
  },

  recheck() {
    wx.showModal({
      title: '改完配置了吗',
      content: '改完 config.js 或换了 AppID 后，需要重新编译一次小程序。点确定重新进入。',
      success: (res) => {
        if (res.confirm) wx.reLaunch({ url: '/pages/index/index' })
      }
    })
  }
})
