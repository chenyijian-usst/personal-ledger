/**
 * 账单 CSV 解析
 *
 * 现状：微信支付和支付宝导出的账单都是 CSV，但
 * - 支付宝那份通常是 GBK 编码，小程序端读出来是乱码；
 * - 微信那份是 UTF-8（带 BOM）；
 * - 两份的表头、列名、金额写法都不一样（¥35.00 / 35.00）。
 * 所以统一放在云函数里解码 + 解析，小程序端只负责选文件和预览。
 */

/* ------------------------------ 解码 ------------------------------ */

/** GBK 字节被当成 UTF-8 解，会出现替换字符，用它来判断要不要换编码重解 */
function looksBroken(text) {
  if (!text) return true
  const bad = (text.match(/\uFFFD/g) || []).length
  return bad > 0 && bad / text.length > 0.001
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * 把文件字节解成文本：先按 UTF-8 解，出现乱码再按 GBK 解
 * @param {Buffer} buffer
 */
function decode(buffer) {
  if (!buffer || !buffer.length) return ''
  let text = new TextDecoder('utf-8').decode(buffer)
  if (looksBroken(text)) {
    try {
      text = new TextDecoder('gbk').decode(buffer)
    } catch (err) {
      // 运行环境不支持 gbk，保持 utf-8 的结果
    }
  }
  return stripBom(text).replace(/\r\n/g, '\n')
}

/* ------------------------------ CSV 切分 ------------------------------ */

/** 标准 CSV 切分：支持引号包裹、字段内逗号与换行、"" 转义 */
function splitCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') {
      field += ch
    }
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((cell) => String(cell).trim() !== ''))
}

/* ------------------------------ 列定位 ------------------------------ */

const COLUMN_RULES = {
  date: [/交易时间/, /付款时间/, /交易创建时间/, /^时间$/, /日期/],
  amount: [/金额/],
  direction: [/收\/支/, /收支/, /收付/],
  peer: [/交易对方/, /对方/],
  item: [/商品名称/, /商品/, /摘要/],
  remark: [/备注/],
  status: [/当前状态/, /交易状态/]
}

function normalizeHeader(text) {
  return String(text || '')
    .replace(/[\s\u3000]/g, '')
    .replace(/[（(]/g, '(')
    .replace(/[）)]/g, ')')
    .replace(/[¥￥]/g, '')
}

function findColumn(headers, patterns) {
  for (let p = 0; p < patterns.length; p++) {
    for (let i = 0; i < headers.length; i++) {
      if (patterns[p].test(headers[i])) return i
    }
  }
  return -1
}

/** 找到表头行：同时出现「金额」和「收/支」，或者出现微信账单那套列名 */
function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const headers = rows[i].map(normalizeHeader)
    const joined = headers.join('|')
    const hasAmount = /金额/.test(joined)
    const hasDirection = /收\/支|收支/.test(joined)
    const hasDate = /交易时间|付款时间|交易创建时间|日期|时间/.test(joined)
    if (hasAmount && hasDate && (hasDirection || /商品|交易对方/.test(joined))) {
      return i
    }
  }
  return -1
}

/* ------------------------------ 值处理 ------------------------------ */

const STATUS_SKIP = /交易关闭|已关闭|交易失败|支付失败|已撤销|撤销|全额退款|已退款|退款成功/

function parseAmountToFen(raw) {
  const text = String(raw || '')
    .replace(/[¥￥,\s]/g, '')
    .replace(/元$/, '')
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null
  const value = Math.abs(Number(text))
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100)
}

function parseDate(raw) {
  const match = String(raw || '').match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/)
  if (!match) return ''
  const y = match[1]
  const m = match[2].length === 1 ? '0' + match[2] : match[2]
  const d = match[3].length === 1 ? '0' + match[3] : match[3]
  const text = y + '-' + m + '-' + d
  const dt = new Date(Number(y), Number(m) - 1, Number(d))
  if (dt.getFullYear() !== Number(y) || dt.getMonth() !== Number(m) - 1 || dt.getDate() !== Number(d)) {
    return ''
  }
  return text
}

/**
 * 关键词猜分类：命中不了就落到「其他」。
 * 顺序有讲究——「美团外卖」要先归餐饮，不能被「美团」归到购物。
 */
const CATEGORY_KEYWORDS = [
  ['餐饮', ['餐', '饭', '美食', '咖啡', '奶茶', '饮品', '外卖', '饿了么', '麦当劳', '肯德基', '星巴克', '瑞幸', '烧烤', '火锅', '面包', '食堂']],
  ['交通', ['滴滴', '地铁', '公交', '打车', '出租', '加油', '高速', '停车', '单车', '哈啰', '青桔', '12306', '火车', '高铁', '机票', '航空', '顺风车']],
  ['居住', ['房租', '租金', '物业', '公寓', '中介费', '民宿']],
  ['水电', ['电费', '水费', '燃气', '暖气', '国家电网', '供电']],
  ['通讯', ['话费', '流量', '宽带', '移动', '联通', '电信', '充话费']],
  ['医疗', ['医院', '药店', '药房', '诊所', '体检', '挂号', '口腔', '眼科']],
  ['教育', ['学费', '课程', '培训', '书店', '图书', '考试', '培训费']],
  ['娱乐', ['电影', '影城', '游戏', 'steam', '网易云', '视频会员', 'ktv', '演出', '门票', '剧院', '剧本杀']],
  ['运动', ['健身', '游泳', '瑜伽', '球馆', '运动', '跑步']],
  ['人情', ['红包', '礼金', '礼品', '份子']],
  ['旅行', ['酒店', '携程', '飞猪', '去哪儿', '景区', '旅行', '度假']],
  ['宠物', ['宠物', '猫', '狗', '兽医', '宠物医院']],
  ['服饰', ['服饰', '优衣库', '鞋', '帽', '内衣', '袜']],
  ['购物', ['超市', '便利店', '淘宝', '天猫', '京东', '拼多多', '商城', '百货', '沃尔玛', '盒马', '山姆', '名创', '网购']],
  ['工资', ['工资', '薪资', '代发']],
  ['奖金', ['奖金', '绩效', '年终']],
  ['报销', ['报销']]
]

function guessCategory(text, type) {
  const haystack = String(text || '')
  if (!haystack) return ''
  const lower = haystack.toLowerCase()
  for (let i = 0; i < CATEGORY_KEYWORDS.length; i++) {
    const name = CATEGORY_KEYWORDS[i][0]
    const words = CATEGORY_KEYWORDS[i][1]
    for (let j = 0; j < words.length; j++) {
      if (lower.indexOf(String(words[j]).toLowerCase()) >= 0) {
        // 收入类账单不该被归到餐饮这种支出分类
        if (type === 'income' && ['工资', '奖金', '报销'].indexOf(name) < 0) return ''
        if (type === 'expense' && ['工资', '奖金', '报销'].indexOf(name) >= 0) return ''
        return name
      }
    }
  }
  return ''
}

/* ------------------------------ 主流程 ------------------------------ */
/**
 * 解析账单文本
 * @param {string} text 已经解码好的 CSV 文本
 * @returns {{rows: Array, stats: object, source: string}}
 */
function parseBill(text) {
  const rows = splitCsv(String(text || ''))
  if (!rows.length) return { rows: [], stats: { total: 0, skipped: 0 }, source: 'unknown' }

  const headerIndex = findHeaderRow(rows)
  if (headerIndex < 0) {
    return { rows: [], stats: { total: 0, skipped: rows.length }, source: 'unknown' }
  }

  const headers = rows[headerIndex].map(normalizeHeader)
  const joinedHeader = headers.join('|')
  const source = /微信/.test(text.slice(0, 500))
    ? 'wechat'
    : /支付宝/.test(text.slice(0, 500))
      ? 'alipay'
      : 'unknown'

  const col = {
    date: findColumn(headers, COLUMN_RULES.date),
    amount: findColumn(headers, COLUMN_RULES.amount),
    direction: findColumn(headers, COLUMN_RULES.direction),
    peer: findColumn(headers, COLUMN_RULES.peer),
    item: findColumn(headers, COLUMN_RULES.item),
    remark: findColumn(headers, COLUMN_RULES.remark),
    status: findColumn(headers, COLUMN_RULES.status)
  }

  const out = []
  let skipped = 0

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const cells = rows[i]
    const cell = (index) => (index >= 0 && index < cells.length ? String(cells[index]).trim() : '')

    // 账单末尾常有「共 X 笔」之类的统计行，列数对不上直接跳过
    if (cells.length < 3 && cell(col.amount) === '') {
      skipped++
      continue
    }

    const direction = cell(col.direction)
    let type = ''
    if (/支出|付款|消费/.test(direction)) type = 'expense'
    else if (/收入|收款|退款/.test(direction)) type = 'income'
    else {
      // 「不计收支」「其他」「空」都跳过：转了账、还信用卡这类不该算进收支
      skipped++
      continue
    }

    const peer = cell(col.peer)
    const item = cell(col.item)
    const note = cell(col.remark)
    const status = cell(col.status)
    const tag = peer + ' ' + item + ' ' + note

    // 退款、关闭、失败的交易整体跳过：否则同一笔钱会被算成「支出 + 退款收入」两次
    if (status && STATUS_SKIP.test(status)) {
      skipped++
      continue
    }
    if (type === 'income' && /退款|退货/.test(tag)) {
      skipped++
      continue
    }

    const date = parseDate(cell(col.date))
    const amountFen = parseAmountToFen(cell(col.amount))
    if (!date || !amountFen) {
      skipped++
      continue
    }

    const label = item || peer || note || '账单导入'
    const remark = (peer && item && peer !== item ? peer + ' · ' : '') + label
    const hint = guessCategory(tag, type)

    out.push({
      date: date,
      type: type,
      amountFen: amountFen,
      remark: remark.slice(0, 50),
      categoryHint: hint
    })
  }

  return {
    rows: out,
    stats: {
      total: out.length,
      skipped: skipped,
      columns: joinedHeader.slice(0, 200)
    },
    source: source
  }
}

module.exports = {
  decode,
  splitCsv,
  parseBill,
  parseAmountToFen,
  parseDate,
  guessCategory
}
