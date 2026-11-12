/**
 * wx-server-sdk 的最小内存实现，只用于本地跑云函数的业务逻辑。
 * 不追求行为完全等价，覆盖本项目用到的 API：
 * database().collection().where/orderBy/skip/limit/get/add/doc().get/update/remove、command.gte/lte、createCollection
 */

let seq = 1

const state = {
  collections: {},
  openid: 'test-openid'
}

function clone(doc) {
  return JSON.parse(JSON.stringify(doc))
}

function ensure(name) {
  if (!state.collections[name]) state.collections[name] = []
  return state.collections[name]
}

/* ---------- command ---------- */

function makeCond(op, v) {
  return {
    __cond: true,
    op: op,
    v: v,
    and(other) {
      return {
        __cond: true,
        op: 'and',
        list: [this, other]
      }
    }
  }
}

const command = {
  gte: (v) => makeCond('gte', v),
  lte: (v) => makeCond('lte', v),
  gt: (v) => makeCond('gt', v),
  lt: (v) => makeCond('lt', v),
  eq: (v) => makeCond('eq', v),
  neq: (v) => makeCond('neq', v),
  in: (v) => makeCond('in', v)
}

function matchValue(docValue, cond) {
  if (cond && cond.__cond) {
    switch (cond.op) {
      case 'and':
        return cond.list.every((item) => matchValue(docValue, item))
      case 'gte':
        return docValue >= cond.v
      case 'lte':
        return docValue <= cond.v
      case 'gt':
        return docValue > cond.v
      case 'lt':
        return docValue < cond.v
      case 'neq':
        return docValue !== cond.v
      case 'in':
        return cond.v.indexOf(docValue) >= 0
      case 'eq':
      default:
        return docValue === cond.v
    }
  }
  return docValue === cond
}

function matchDoc(doc, query) {
  const keys = Object.keys(query || {})
  return keys.every((key) => matchValue(doc[key], query[key]))
}

/* ---------- query ---------- */

class Query {
  constructor(name, options) {
    this.name = name
    this.options = options || { where: {}, orders: [], skip: 0, limit: 100 }
  }

  copy(patch) {
    return new Query(this.name, Object.assign({}, this.options, patch))
  }

  where(query) {
    return this.copy({ where: Object.assign({}, this.options.where, query) })
  }

  orderBy(field, dir) {
    const orders = this.options.orders.concat([{ field, dir: dir || 'asc' }])
    return this.copy({ orders })
  }

  skip(n) {
    return this.copy({ skip: n })
  }

  limit(n) {
    return this.copy({ limit: n })
  }

  async get() {
    let list = ensure(this.name).filter((doc) => matchDoc(doc, this.options.where))
    const orders = this.options.orders
    if (orders.length) {
      list = list.slice().sort((a, b) => {
        for (let i = 0; i < orders.length; i++) {
          const { field, dir } = orders[i]
          const av = a[field]
          const bv = b[field]
          if (av === bv) continue
          const result = av > bv ? 1 : -1
          return dir === 'desc' ? -result : result
        }
        return 0
      })
    }
    const start = this.options.skip || 0
    const rows = list.slice(start, start + (this.options.limit || 100))
    return { data: clone(rows) }
  }

  async add(payload) {
    const items = Array.isArray(payload.data) ? payload.data : [payload.data]
    const ids = []
    items.forEach((item) => {
      const id = 'doc_' + seq++
      ensure(this.name).push(Object.assign({ _id: id }, clone(item)))
      ids.push(id)
    })
    return { _id: ids[0], ids }
  }

  doc(id) {
    return new DocRef(this.name, id)
  }

  async remove() {
    const list = ensure(this.name)
    const keep = list.filter((doc) => !matchDoc(doc, this.options.where))
    state.collections[this.name] = keep
    return { stats: { removed: list.length - keep.length } }
  }
}

class DocRef {
  constructor(name, id) {
    this.name = name
    this.id = id
  }

  find() {
    return ensure(this.name).find((doc) => doc._id === this.id)
  }

  async get() {
    const doc = this.find()
    if (!doc) {
      const err = new Error('document does not exist')
      err.errCode = -502004
      throw err
    }
    return { data: clone(doc) }
  }

  async update(payload) {
    const doc = this.find()
    if (!doc) return { stats: { updated: 0 } }
    Object.assign(doc, clone(payload.data))
    return { stats: { updated: 1 } }
  }

  async remove() {
    const list = ensure(this.name)
    const index = list.findIndex((doc) => doc._id === this.id)
    if (index >= 0) list.splice(index, 1)
    return { stats: { removed: index >= 0 ? 1 : 0 } }
  }
}

/* ---------- database ---------- */

function database() {
  return {
    command,
    collection(name) {
      return new Query(name)
    },
    async createCollection(name) {
      if (state.collections[name]) {
        const err = new Error('collection already exists')
        err.errCode = -502002
        throw err
      }
      state.collections[name] = []
      return { errMsg: 'createCollection:ok' }
    }
  }
}

module.exports = {
  DYNAMIC_CURRENT_ENV: 'dynamic',
  init() {},
  database,
  getWXContext() {
    return { OPENID: state.openid, APPID: 'wxtest', UNIONID: '' }
  },
  __state: state,
  __reset() {
    state.collections = {}
    seq = 1
  },
  __setOpenId(openid) {
    state.openid = openid
  }
}
