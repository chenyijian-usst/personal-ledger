/**
 * 全局配置
 *
 * envId：微信云开发环境 ID。开通云开发后在「云开发控制台 -> 设置 -> 环境 ID」复制过来，
 * 形如 ledger-1g2h3i4j5。留空时小程序会进入「未配置」引导页，不会白屏。
 */
module.exports = {
  envId: '',
  // 记账使用的币种符号
  currency: '¥',
  // 明细列表每页条数
  pageSize: 50
}
