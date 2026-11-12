/**
 * 本地静态检查：开发者工具之外先把低级错误挡掉
 * 用法：node tools/verify.js
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const mp = path.join(root, 'miniprogram')
const problems = []
const notes = []

function walk(dir, filter, out) {
  out = out || []
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, filter, out)
    else if (filter(entry.name)) out.push(full)
  })
  return out
}

/* 1. JSON 合法性 */
walk(root, (n) => n.endsWith('.json')).forEach((file) => {
  if (file.includes('node_modules')) return
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    problems.push(`JSON 解析失败 ${path.relative(root, file)}: ${err.message}`)
  }
})

/* 2. JS 语法（用 vm 编译，不执行） */
walk(root, (n) => n.endsWith('.js')).forEach((file) => {
  if (file.includes('node_modules') || file.includes('miniprogram_npm')) return
  const code = fs.readFileSync(file, 'utf8')
  try {
    new vm.Script(code, { filename: file })
  } catch (err) {
    problems.push(`JS 语法错误 ${path.relative(root, file)}: ${err.message}`)
  }
})

/* 3. app.json 里声明的页面，四件套是否齐全 */
const appJson = JSON.parse(fs.readFileSync(path.join(mp, 'app.json'), 'utf8'))
appJson.pages.forEach((page) => {
  ;['.js', '.json', '.wxml'].forEach((ext) => {
    const file = path.join(mp, page + ext)
    if (!fs.existsSync(file)) problems.push(`缺少页面文件：${page}${ext}`)
  })
  const wxss = path.join(mp, page + '.wxss')
  if (!fs.existsSync(wxss)) notes.push(`提示：${page}.wxss 不存在（不是错误，但样式可能缺失）`)
})

/* tabBar 指向的页面必须在 pages 里 */
;(appJson.tabBar && appJson.tabBar.list ? appJson.tabBar.list : []).forEach((item) => {
  if (appJson.pages.indexOf(item.pagePath) < 0) {
    problems.push(`tabBar 指向的页面没在 pages 中声明：${item.pagePath}`)
  }
})

/* 4. WXML 标签配对 */
const VOID_TAGS = new Set(['input', 'image', 'import', 'include', 'wxs', 'br'])
function checkWxml(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '')
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g
  const stack = []
  let match
  while ((match = tagRe.exec(source))) {
    const closing = match[1] === '/'
    const name = match[2]
    const selfClosing = match[4] === '/'
    if (VOID_TAGS.has(name) || selfClosing) continue
    if (!closing) {
      stack.push({ name, index: match.index })
    } else {
      const top = stack.pop()
      if (!top || top.name !== name) {
        problems.push(`${path.relative(root, file)}: 标签不配对，期望 </${top ? top.name : '?'}>，实际 </${name}>`)
        return
      }
    }
  }
  if (stack.length) {
    const top = stack[stack.length - 1]
    problems.push(`${path.relative(root, file)}: <${top.name}> 没有闭合`)
  }
}

walk(mp, (n) => n.endsWith('.wxml')).forEach(checkWxml)

/* 5. 事件处理函数是否存在 */
const handlerAttrs = [
  'bindtap',
  'catchtap',
  'bindinput',
  'bindchange',
  'bindlongpress',
  'bindconfirm',
  'bindblur',
  'bindsubmit'
]
walk(mp, (n) => n.endsWith('.wxml')).forEach((wxmlFile) => {
  const jsFile = wxmlFile.replace(/\.wxml$/, '.js')
  if (!fs.existsSync(jsFile)) return
  const js = fs.readFileSync(jsFile, 'utf8')
  const wxml = fs.readFileSync(wxmlFile, 'utf8')
  handlerAttrs.forEach((attr) => {
    const re = new RegExp(attr + '="([A-Za-z_$][\\w$]*)"', 'g')
    let match
    while ((match = re.exec(wxml))) {
      const fn = match[1]
      const defined = new RegExp('(^|[\\s,{])' + fn + '\\s*[:(]').test(js)
      if (!defined) {
        problems.push(`${path.relative(root, wxmlFile)}: 绑定的事件 ${attr}="${fn}" 在 ${path.basename(jsFile)} 里找不到`)
      }
    }
  })
})

/* 6. 页面里调用的云函数 action 必须在云函数里注册 */
const apiIndex = fs.readFileSync(path.join(root, 'cloudfunctions/api/index.js'), 'utf8')
const usedActions = new Set()
walk(mp, (n) => n.endsWith('.js')).forEach((file) => {
  const source = fs.readFileSync(file, 'utf8')
  const re = /(?:call|callWithToast)\(\s*'([a-z]+\.[a-zA-Z]+)'/g
  let match
  while ((match = re.exec(source))) usedActions.add(match[1])
})
usedActions.forEach((action) => {
  if (apiIndex.indexOf("'" + action + "'") < 0) {
    problems.push(`云函数里没有注册 action：${action}`)
  }
})

/* 输出 */
notes.forEach((n) => console.log('· ' + n))
if (problems.length) {
  console.log('\n发现 ' + problems.length + ' 个问题：')
  problems.forEach((p) => console.log('  ✗ ' + p))
  process.exit(1)
}
console.log('\n✓ 静态检查通过：JSON/JS 语法、页面文件、WXML 标签、事件绑定、云函数 action')
console.log('· 页面数：' + appJson.pages.length + '，已用 action：' + usedActions.size)
