# 交接简报（给下一个对话的自己或 AI）

> 换新会话时，让 AI 先读这个文件，再开始干活。它记录了「已经做完什么、为什么这么做、下一步做什么」。

## 一句话现状

个人记账微信小程序已完整可用（原生小程序 + 微信云开发），云环境与云函数已部署，代码已推 GitHub。**视觉改造进行中**：已切到「纸质账簿」风格，正在微调列表行呈现。

## 硬信息

| 项 | 值 |
| --- | --- |
| 项目路径 | `C:\Users\chenyijian\Documents\ledger\app` |
| 小程序 AppID | `wxc35e079087c50168` |
| 云开发环境 ID | `cloud1-d3gq3h0wie7fbc669`（`miniprogram/config.js`） |
| 云函数 | `cloudfunctions/api`（单入口 action 路由，已部署） |
| GitHub | `https://github.com/chenyijian-usst/personal-ledger`（**公开**仓库） |
| 开发者工具 | 2.02.2609250 Stable，装在 `C:\Program Files (x86)\Tencent\微信web开发者工具` |

⚠️ 历史坑：曾经存在过另一个 AppID `wx3ae538eb0490ea03`，那是最早的，已弃用。环境和代码都以 `wxc35e...` 为准。

## 已完成功能

- 记一笔：收支切换、分类九宫格、自绘数字键盘、日期、备注、编辑回填
- 明细：按月切换、按日分组、每日小计、长按删除
- 统计：分类占比、近 6 月趋势（纯 CSS 绘制，未引 canvas/ECharts）
- 预算：按月额度、进度条、日均可用、超支保存后弹窗提醒
- 账单导入：微信/支付宝 CSV，UTF-8/GBK 自动解码、表头定位、关键词猜分类、内容哈希去重
- 分类管理：增改删、单字图章 + 印章颜色
- 数据导出：UTF-8 CSV（带 BOM，Excel 不乱码）
- 数据自检：「我的」页显示当前模式、累计条数、记录跨度
- 演示模式：未填 envId 时走本机 storage，自动塞 8 条样例数据

## 视觉方案（重要，别推翻重做）

**主题：纸质账簿**

- 暖纸底 `#f5f1e8` + 极淡横线纹理；卡片 = 纸片（细边线 + 3rpx 硬投影）
- 主色墨青 `#2b3a44`；朱红 `#b03a2e` 只表示支出；墨绿 `#2f6b4e` 只表示收入
- 字体：中文标题/栏名用宋体（`Songti SC`/`SimSun`），金额数字用 DIN 系（`DIN Alternate` → `Roboto Condensed` → 系统无衬线）
- 分类图标：**单字方章**（取分类名第一个字，宋体），不用 emoji（用户明确说 emoji "太 AI"）
- 列表行：**不用方章，也不放任何图标**。去掉方章后曾短暂用过 12rpx 收支方向小圆点，现已删掉——因为金额本身就带 `-`/`+` 前缀（`list.js` / `index.js` 的 `amountText`），圆点是在重复表达同一件事。现在一行只有：分类名（+备注）+ 金额，收支靠符号和朱红/墨绿区分
- 同理，`pages/list`、`pages/index`、`pages/stats` 都不再生成 `seal` 字段（方章只用在记一笔的九宫格、分类管理）
- **同一个名字只出现一次**：统计页原来「餐 餐饮」叠着，用户指出重复，现只留「餐饮」；分类管理保留方章（那里方章是可编辑的色块预览）
- **底部 tabBar 是自定义的**（`miniprogram/custom-tab-bar/`）。原因：原生 tabBar 字号写死、`app.json` 没有 `fontSize` 配置，用户要求把「首页/明细/统计/我的」调大，只能用 `"custom": true` + 自己画。字号在 `custom-tab-bar/index.wxss` 的 `.tab-label`（当前 30rpx），选中态是加粗 + 一道 4rpx 墨青短横
- 自定义 tabBar 是浮层，占不到文档流高度：带 tabBar 的页面要自己留底部空白（`.page` 已有 180rpx；「我的」页用 `.page-tab`）
- 每个 tab 页 `onShow` 第一行调 `syncTabBar(this, n)`（`utils/tabbar.js`），负责点亮当前项

字体/颜色都在 `miniprogram/app.wxss` 的 `page { }` 里以 CSS 变量定义，改一处全站生效。

## 待决 / 待办

1. **列表行 / 统计页 / 底栏已定稿**（详见上一节）。等用户在开发者工具里看观感；若列表行嫌太素，备选 B = 行尾加「支出/收入」小字标签。
2. **已 push 到 `c0786ae`**；之后这一轮（统计页去重 + 自定义 tabBar + 删掉过期的 `docs/preview.html`）还在本地，GitHub 网络恢复后 `git push` 即可（命令重试几次通常会通）。
3. **体验版还没上传到手机**，这是「手机上能用」的最后一步。
4. 可选功能：备注快捷输入、明细分页/搜索、年视图、分类预算、多账本。

## 环境限制（别浪费时间重试）

- 默认沙箱禁止子进程命名管道：`git push`（凭据助手要拉 `sh.exe`）会直接报 `couldn't create signal pipe`。**用 danger-full-access 重试一次就正常**，别再判定「push 只能用户手动做」
- 但网络本身不稳（GitHub 在我国大陆经常 `Connection was reset` / `Failed to connect`），**同一命令重试 3 次以内通常会通**（实测第 3 次成功）
- `curl`、headless Chrome/Edge 截图在默认沙箱下跑不了（要截图得同样放宽权限）
- 开发者工具 CLI（`cli.bat`）会失败：它要写 `%LOCALAPPDATA%\微信开发者工具\...\.cli`，沙箱拒绝
- 因此：**部署云函数、上传体验版仍必须让用户在自己界面里执行**；`git push` 可以自己做（加重试）

## 常用命令

```powershell
cd C:\Users\chenyijian\Documents\ledger\app

# 三套检查（改完代码必跑）
node tools\verify.js
$env:NODE_PATH="$PWD\tools\stub"; node tools\test-cloud.js   # 38 个用例
$env:NODE_PATH="$PWD\tools\stub"; node tools\test-pages.js    # 31 个用例

# 部署云函数（用户执行）
& "C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat" cloud functions deploy `
  --env cloud1-d3gq3h0wie7fbc669 --names api --remote-npm-install `
  --project "C:\Users\chenyijian\Documents\ledger\app"

# 推送（用户执行，需先开 设置→安全设置→服务端口 才走 CLI；直接 git push 也行）
git push
```

## 测试是怎么做的（别删）

- `tools/verify.js`：JSON/JS 语法、页面文件齐全、WXML 标签配对、事件绑定、`wx:key` 合法、action 已注册
- `tools/test-cloud.js`：内存版 `wx-server-sdk`（`tools/stub/`）跑云函数真实逻辑
- `tools/test-pages.js`：`wx`/`Page`/`getApp` 替身，真实执行页面生命周期与点击
- 改 WXML/JS 后若测试挂了，先看是不是断言过期（例如分类图标从 emoji 改成单字时，断言要跟着改）

## 开局建议（新会话第一条消息可以这样发）

> 读 `docs/HANDOFF.md`，然后我们继续：把体验版上传到手机，再决定要不要做备注快捷输入。
