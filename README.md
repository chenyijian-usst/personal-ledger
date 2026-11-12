# 个人记账小程序

一个只给自己用的收支记账微信小程序。原生小程序 + 微信云开发，**不需要服务器、不需要域名、不需要备案**，代码零构建，用微信开发者工具直接打开就能跑。

## 为什么不是直接 fork 现成项目

调研过 [洁账 jiezhang](https://github.com/yigger/jiezhang) 和 [小明记账簿 xiaoming_bookkeeping](https://github.com/xiaoxiaoyuanwang/xiaoming_bookkeeping)，两者都不适合「个人自用」这个场景：

| 项目 | 问题 |
| --- | --- |
| 洁账（486★） | 后端 217 个 Go 文件、108 个接口、只支持 MySQL，仓库没给完整建库脚本，需要自备服务器 + 已备案域名 |
| 小明记账簿 | 只开源了前端，仓库里没有云函数和数据库定义；Vue2 + HBuilderX 工程、页面是 `.nvue`，无构建脚本，拉下来跑不起来 |

所以这里沿用它们成熟的部分——**数据模型**（记录 / 分类 / 预算，金额按整数「分」存）和**交互结构**（九宫格分类 + 数字键盘、明细按日分组、月/年统计），代码自己写，换来的是：能直接跑、没有构建链、逻辑都能本地测。

> 想学怎么从零做出这套东西（选型、数据模型、每层的取舍、踩过的坑），看 **[docs/build-from-scratch.md](docs/build-from-scratch.md)**（《从零搭建这个记账小程序》）。

## 已实现

- 记一笔：支出/收入切换、分类九宫格、自绘数字键盘、日期选择、备注
- 编辑 / 删除：明细里点一下编辑，长按删除
- 明细：按月切换、按日分组、每日收支小计
- 统计：本月分类占比（条形图 + 百分比）、近 6 个月趋势（柱状图）
- 预算：按月设置额度、进度条、剩余额度、日均可用、**超支时保存后弹窗提醒**
- 账单导入：微信支付 / 支付宝 CSV（自动识别编码与表头、猜分类、内容哈希去重）
- 分类管理：增删改、emoji 图标、20 色可选
- 数据导出：按月导出 UTF-8 CSV（Excel 直接打开不乱码），可发给文件传输助手
- 默认 22 个中文分类，首次运行自动写入
- 37 个云函数回归用例 + 静态检查脚本

## 待办

- [ ] 明细分页加载（现在整月一次取回，账单很多时才需要）
- [ ] 云函数定时触发 + 订阅消息，每月推上月账单
- [ ] 年视图 / 同比环比
- [ ] 备注快捷输入（常用备注）

## 目录结构

```
project.config.json        开发者工具工程配置（appid / 云函数目录）
cloudfunctions/api/        唯一的数据接口云函数（action 路由）
  index.js                 记账、分类、预算、导入、汇总全部逻辑
  csv.js                   账单 CSV 解析（编码识别、表头定位、去重哈希）
  package.json             只依赖 wx-server-sdk
miniprogram/
  app.js / app.json        入口、页面与 tabBar
  config.js                ← 只需要改这里：填云开发环境 ID（留空 = 演示模式）
  utils/api.js             云函数调用封装（没配 envId 时自动转到 localdb）
  utils/localdb.js         演示模式：本机 storage 实现同一套 action
  utils/money.js           金额：元 ↔ 分，整数运算
  utils/date.js            月份区间、今天/昨天、星期
  pages/index/             首页：本月概览、预算进度、最近记录
  pages/list/              明细：按月、按日分组
  pages/add/               记一笔 / 编辑
  pages/stats/             统计：分类占比、近 6 月趋势
  pages/budget/            预算设置
  pages/import/            账单导入（选文件 / 粘贴 → 预览 → 写入）
  pages/category/          分类管理
  pages/export/            导出 CSV
  pages/me/                我的
  pages/setup/             配置说明（没配好环境时首页会引导进来）
docs/
  build-from-scratch.md     《从零搭建这个记账小程序》：选型、数据模型、每层取舍与踩坑记录
tools/
  verify.js                静态检查
  test-cloud.js            云函数逻辑回归测试（内存数据库）
  stub/wx-server-sdk/      上面测试用的 wx-server-sdk 替身
```

## 先试试：不用 AppID 的演示模式

没注册小程序、没开通云开发，也能把界面完整点一遍。

1. 装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)，用微信扫码登录
2. 「导入项目」→ 选这个目录 → 点「测试号」/「游客模式」也可以，AppID 不用改
3. 打开就能用：首次进入会**自动写入 8 条样例账单和一个月预算**，四个 tab、记一笔、预算、分类管理、导出全部可用

怎么实现的：`utils/api.js` 在 `envId` 为空时，把所有 `action` 转发给 `utils/localdb.js`（数据存在 `wx.storage`）。接口名、返回结构、页面代码**一行都不用改**，所以演示时看到的就是真正跑起来的样子。

限制（会在界面上明说）：

- 数据只存在这台设备，换机/清缓存就没了；换成云开发后演示数据不会同步过去
- 账单导入不可用（GBK 解码依赖云函数的 Node 环境）
- 首页顶部有一条黄色「演示模式」提示，点它进配置说明，那里可以清空演示数据

也可以不进开发者工具、先看设计：直接双击 **`docs/preview.html`**（静态渲染稿，含首页/明细/记一笔/统计四屏）。

## 跑起来（约 5 分钟）

> 云开发怎么开通、环境 ID 在哪、常见报错怎么查：见 **[docs/cloudbase-setup.md](docs/cloudbase-setup.md)**。

1. **注册小程序**：<https://mp.weixin.qq.com> → 立即注册 → 小程序 → 主体选「个人」。在「开发管理 → 开发设置」复制 AppID。
   - 一定要真 AppID，**测试号不支持云开发**。
2. **改 appid**：把 `project.config.json` 里的 `"appid": "touristappid"` 换成你的 AppID（或在开发者工具「详情 → 基本信息」里改）。
3. **开通云开发**：用微信开发者工具打开本目录，点顶部「云开发」按钮按提示开通，复制「环境 ID」（形如 `ledger-1g2h3i4j5`）。
4. **填环境 ID**：编辑 `miniprogram/config.js`，`envId` 填上刚才的值，保存重编译。
5. **部署云函数**：文件树里右键 `cloudfunctions/api` → **上传并部署：云端安装依赖**。等它装完。

第一次打开会自动创建 `records`、`categories`、`budgets` 三个集合，并写入默认分类；如果提示集合不存在，去云开发控制台手动建这三个集合再试。

## 只给自己用，怎么长期在手机上打开

点「预览」扫码就能用。想固定下来：点「上传」→ 到小程序后台「版本管理」把它设为**体验版** → 在「成员管理 → 体验成员」里把自己加进去。体验版不用提交审核，也不用发布。数据只存在于你自己的云开发环境里。

## 数据存在哪（会不会重置）

| 模式 | 存放位置 | 清微信缓存 | 换手机 |
| --- | --- | --- | --- |
| **云开发**（填了 `envId`） | 云数据库 `records` / `categories` / `budgets` | 不丢 | 不丢 |
| 演示模式（`envId` 为空） | 这台设备的 `wx.storage` | 会丢 | 会丢 |

每次打开小程序只是**查询**，不会覆盖已有数据。「我的」页顶部有一张**数据自检卡**：显示当前模式、累计记录条数、记录跨度——数字在、跨度在，说明数据确实存住了。

## 本地检查

```bash
# 静态检查：JSON/JS 语法、页面文件齐全、WXML 标签配对、事件绑定、云函数 action 是否注册
node tools/verify.js

# 云函数业务逻辑回归测试（不需要云环境，用内存数据库）
# Windows PowerShell:
$env:NODE_PATH="$PWD\tools\stub"; node tools/test-cloud.js
# macOS / Linux:
NODE_PATH=tools/stub node tools/test-cloud.js
```

```bash
# 页面运行时测试：用 wx / Page / getApp 替身把每个页面真跑一遍（载入、点击、保存、导入、导出）
$env:NODE_PATH="$PWD\tools\stub"; node tools/test-pages.js
```

三套加起来：37 个云函数用例 + 25 个页面用例 + 静态检查，全部在本地几秒内跑完，不需要开发者工具和云环境。

## 数据模型

```js
// records：一笔账
{ uid, type: 'expense' | 'income', amountFen, date: 'YYYY-MM-DD',
  categoryId, categoryName, categoryIcon, categoryColor,
  remark, source: 'manual' | 'import', importHash, createdAt, updatedAt }

// categories：分类（首次运行自动写入 15 个支出 + 7 个收入）
{ uid, name, icon, color, type, sort }

// budgets：按月预算，一个月一条
{ uid, month: 'YYYY-MM', amountFen }
```

金额一律按**分**存整数，避免 `0.1 + 0.2` 这类浮点误差；记录里冗余存了分类名称和图标，改分类名不会让历史账单变成「未分类」。

## 接口（云函数 action）

| action | 说明 |
| --- | --- |
| `category.list` / `category.save` / `category.remove` | 分类读写（首次调用自动建默认分类） |
| `record.add` / `record.update` / `record.remove` / `record.get` | 单条记录 CRUD |
| `record.month` | 某月全部记录 + 总额 + 分类汇总（明细页用） |
| `record.overview` | 本月汇总 + 最近 N 条 + 预算，一次返回（首页用） |
| `record.trend` | 多个月份的收支趋势（一次查询覆盖整个区间） |
| `budget.get` / `budget.set` | 按月预算 |
| `import.parse` | 解析 CSV：自动识别 UTF-8 / GBK、定位表头、猜分类，不写库 |
| `import.commit` | 批量写入（按 日期+类型+金额+备注 去重） |

所有接口都在云函数里校验 `uid`，只能读写自己的数据；分类的改/删同样校验归属。

## 性能与健壮性

- **首页一次请求**：`record.overview` 只回汇总 + 最近 8 条 + 预算，不再把整月明细传给客户端
- **趋势一次查询**：`record.trend` 把首尾月份之间一次取回再内存分组，6 个月从 6 次往返降到 1 次
- **弱网重试**：只读接口失败自动重试一次；写接口**不重试**，避免重复记账
- **分类缓存**：`app.globalData.categories`，分类管理里改完会清缓存
- **金额零浮点**：全链路整数「分」
- **越权校验**：任何按 `_id` 操作前都先取文档比对 `uid`

### 建议手动加索引

云开发控制台 → 数据库 → 索引管理，为 `records` 建 `uid + date` 复合索引。账单上千条后差别明显。
