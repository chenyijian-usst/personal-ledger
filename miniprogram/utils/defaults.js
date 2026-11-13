/**
 * 默认分类：首次使用时写入云数据库，之后可以自己增删改
 * 图标用 emoji，省掉图片资源，任何机型都能显示
 */

const EXPENSE = [
  { name: '餐饮', icon: '🍜', color: '#FF8A65' },
  { name: '交通', icon: '🚌', color: '#4FC3F7' },
  { name: '购物', icon: '🛍️', color: '#F06292' },
  { name: '服饰', icon: '👕', color: '#BA68C8' },
  { name: '居住', icon: '🏠', color: '#7986CB' },
  { name: '水电', icon: '💡', color: '#FFD54F' },
  { name: '通讯', icon: '📱', color: '#4DB6AC' },
  { name: '医疗', icon: '💊', color: '#E57373' },
  { name: '教育', icon: '📚', color: '#64B5F6' },
  { name: '娱乐', icon: '🎮', color: '#9575CD' },
  { name: '运动', icon: '🏃', color: '#81C784' },
  { name: '人情', icon: '🎁', color: '#FFB74D' },
  { name: '旅行', icon: '✈️', color: '#4DD0E1' },
  { name: '宠物', icon: '🐱', color: '#A1887F' },
  { name: '其他', icon: '📦', color: '#90A4AE' }
]

const INCOME = [
  { name: '工资', icon: '💰', color: '#4CAF50' },
  { name: '奖金', icon: '🏆', color: '#FFB300' },
  { name: '兼职', icon: '💼', color: '#5C6BC0' },
  { name: '理财', icon: '📈', color: '#26A69A' },
  { name: '红包', icon: '🧧', color: '#EF5350' },
  { name: '报销', icon: '报', color: '#8D6E63' },
  { name: '其他', icon: '💵', color: '#78909C' }
]

/** 生成带 type/sort 的完整默认分类列表 */
function buildDefaults() {
  const list = []
  EXPENSE.forEach((item, index) => {
    list.push({
      name: item.name,
      icon: item.icon,
      color: item.color,
      type: 'expense',
      sort: index
    })
  })
  INCOME.forEach((item, index) => {
    list.push({
      name: item.name,
      icon: item.icon,
      color: item.color,
      type: 'income',
      sort: index
    })
  })
  return list
}

module.exports = {
  buildDefaults
}
