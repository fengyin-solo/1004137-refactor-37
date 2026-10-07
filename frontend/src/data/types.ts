/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}

/** 机坪安全整改：三个入口（列表按钮 / 详情页 / 批量）共用的动作类型。 */
export type RectificationAction = '记录巡查' | '安排整改' | '确认闭环'

/** 调用整改动作时的上下文：操作者所属区域用于跨区域校验，expectedRevision 用于并发提交。 */
export type RectificationRequest = {
  id: number
  action: RectificationAction
  operatorRegion: string
  /** 页面打开记录时拿到的版本号；与当前版本不一致说明已被别人改过，拒绝本次提交。 */
  expectedRevision?: number
  /** 仅「确认闭环」可写入结论（复查结果）；其他动作一律不改历史结论。 */
  conclusion?: string
}

/** 单条整改动作的结果，携带记录最新版本供页面刷新比对。 */
export type RectificationResult = ActionResult & {
  id: number
  revision?: number
  status?: string
}

/** 批量入口逐条返回结果，便于区分哪些成功、哪些被规则拦下。 */
export type BatchRectificationResult = {
  results: RectificationResult[]
  /** 被拦下的原因汇总（去重后），用于页面统一提示。 */
  rejected: string[]
}

/** 对外共享的整改结论：事故上报清单（应急保障）只读同一份结论。 */
export type RectificationConclusion = {
  id: number
  巡查编号: string
  巡查区域: string
  发现问题: string
  复查结果: string
  status: string
}
