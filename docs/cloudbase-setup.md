# 接入微信云开发（CloudBase）操作清单

> 依据 <https://docs.cloudbase.net/skill.md> 整理，针对「微信小程序 + 国内站」这套组合。
> 本项目已满足「项目侧」全部前提，缺的只有「创建环境」这一步——它必须由小程序绑定的微信号扫码完成。

## 0. 先分清两个概念

| | 说明 |
| --- | --- |
| **云开发（CloudBase）** | 小程序的附属能力：云数据库、云函数、云存储。不用注册新账号，不用服务器、域名、备案 |
| **微信开发者工具** | 本地写代码、编译、预览、上传的工具。云开发入口就在它里面 |

站点：本文只讲**国内站**（`cloud.tencent.com` 体系）。国际站账号体系独立，选错会表现为「登录成功但看不到环境」。

## 1. 项目侧前提（已完成 ✅）

| 检查项 | 本项目状态 |
| --- | --- |
| 根目录有 `project.config.json` | ✅ |
| `miniprogram/app.json` 存在 | ✅ |
| `appid` 是真 AppID（不是空、不是 `touristappid`） | ✅ |
| `cloudfunctionRoot` 指向云函数目录 | ✅ `cloudfunctions/` |
| Node / npm / npx / git | ✅ v24 / 11 / 11 / 2.55 |

> 换过 AppID 的话，云环境必须建在**同一个 AppID** 下；旧 AppID 下建的模型、模拟器本地缓存都不通用。

## 2. 创建云开发环境（只能由你完成）

1. 打开微信开发者工具，确认右上角登录的微信，是这个小程序的**管理员或开发者**
2. 点顶部工具栏 `上传` 右侧的**云朵图标**（悬停显示「云开发」）
3. 未开通会进引导页 → 点「开通」→ 同意协议
4. 填环境名称（如 `ledger`），选计费方式
5. 等 1~2 分钟初始化，记下 **环境 ID**（形如 `ledger-8g3k2x`）

### 计费怎么选

- 国内站每个账号可创建 **1 个免费体验环境**（约 **3,000 资源点/月**，6 个月一续，不自动续费）
- 免费体验环境**不支持加购资源包、不支持按量付费**；要升级得先转成付费
- 个人记账的调用量（每天几十次读写）远低于这个量级

### 登录方式很关键

浏览器里弹出的授权页**要选「公众平台登录」，用绑定了这个小程序的微信扫码**，不要用腾讯云账号登录——否则会「登录成功但环境列表是空的」。

> 「小程序管理员扫码」是另一件事（腾讯云账号中心绑定小程序、云开发 AI 控制台授权客服时才用），别和登录页混在一起。

## 3. 把环境接到项目上（三步）

```powershell
# ① 填环境 ID
#    编辑 miniprogram/config.js → envId: 'ledger-xxxx'

# ② 验证（本地，不需要云环境）
node tools/verify.js
$env:NODE_PATH="$PWD\tools\stub"; node tools/test-cloud.js
$env:NODE_PATH="$PWD\tools\stub"; node tools/test-pages.js

# ③ 部署云函数（任选其一）
#    A. 界面：右键 cloudfunctions/api → 上传并部署：云端安装依赖
#    B. 命令行（先在 设置 → 安全设置 打开服务端口）
& "C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat" cloud functions deploy `
    --env <环境ID> --names api --remote-npm-install `
    --project "C:\Users\chenyijian\Documents\ledger\app"
```

部署完，首页顶部的黄色「演示模式」横幅消失 = 已经连上云开发。

## 4. 可选：命令行（tcb）路线

不想点界面时可用，但登录要你自己在终端完成：

```powershell
npm i -g @cloudbase/cli
tcb --version
tcb login --flow web          # 会拉起浏览器，授权页可选「使用 API Key 登录」
tcb env list                  # 记下 EnvId
tcb env use <EnvId>
tcb fn deploy api --dir cloudfunctions/api   # 领域命令，别用 tcb deploy
```

没有腾讯云账号也能走：`tcb login --cloudbase-api-key <key> -e <EnvId>`（环境级 Key，`-e` 必填）。
凭证落在 `~/.config/.cloudbase/auth.json`。

## 5. 验收标准

1. 云开发控制台能看到环境，`envId` 能复制
2. 项目里右键 `cloudfunctions`，**当前环境**不再是「（无）」，菜单出现「上传并部署」
3. 云函数列表里有 `api`，云端日志无报错
4. 模拟器首页横幅消失，记一笔后数据库 `records` 里出现该条记录

## 6. 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 云朵图标点不动 / 是灰的 | 登录的微信不是该小程序的管理员/开发者 | 后台「成员管理」加自己为开发者，重登工具 |
| 登录成功但环境列表为空 | 用了腾讯云账号登录，或站点选错 | 改用「公众平台登录」，扫小程序绑定的微信 |
| 右键只有「新建 Node.js 云函数」 | 没有环境（当前环境显示「（无）」） | 先创建环境，再「同步云函数列表」 |
| 首页仍显示「演示模式」 | `config.js` 的 envId 没填/没重新编译 | 填好并保存，等工具自动重编译 |
| 上传按钮是灰的 | 未登录 / 无该 AppID 权限 / 还在用测试号 | 逐项排查，见上两行 |
| 集合不存在 | 首次调用未自动建表 | 云开发控制台手动建 `records`、`categories`、`budgets` |
