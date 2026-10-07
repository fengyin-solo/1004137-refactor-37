import type {
  EntryRow,
  RectificationAction,
  RectificationConclusion,
  RectificationRequest,
  RectificationResult,
} from './types'

/**
 * 机坪安全整改的「同一份动作规则」。
 *
 * 列表按钮、详情页、批量入口三个入口都只调用本文件的规则，页面不做任何业务判断；
 * 规则只做校验并产出「下一条记录」，不直接读写 localStorage，保证三处写法完全一致。
 */

export const APRON_SAFETY_KEY = 'apron_safety'

// 状态机：动作只能在指定的源状态下执行，从根上避免已闭环问题被重复整改。
const FLOW: Record<RectificationAction, { from: string[]; to: string; pending: boolean }> = {
  记录巡查: { from: ['待巡查'], to: '已巡查', pending: true },
  安排整改: { from: ['已巡查'], to: '待整改', pending: true },
  确认闭环: { from: ['待整改'], to: '已闭环', pending: false },
}

export const CLOSED_STATUS = '已闭环'

// 业务字段按名字取值，不再按数组下标/列序号映射，避免「复查结果」和「巡查区域」在页面间错位。
export const FIELD_REGION = '巡查区域'
export const FIELD_PROBLEM = '发现问题'
export const FIELD_REVIEW = '复查结果'
export const FIELD_CODE = '巡查编号'

// 存量记录缺失区域归属时统一落到这个公共区域；迁移只补归属，不动历史结论。
export const LEGACY_REGION = '未分区'
// 记录行内部的版本号字段：用于同一问题并发提交时只让一次闭环生效。
export const REVISION_FIELD = '__revision'

function text(row: EntryRow, field: string): string {
  return String(row[field] ?? '').trim()
}

/** 列表/详情/批量共用：当前记录在该区域的操作者视角下允许执行哪些动作。 */
export function availableActions(row: EntryRow, operatorRegion: string): RectificationAction[] {
  if (isClosed(row) || !canTouch(row, operatorRegion)) {
    return []
  }
  const status = String(row.status)
  return (Object.keys(FLOW) as RectificationAction[]).filter((action) =>
    FLOW[action].from.includes(status),
  )
}

/**
 * 跨区域人员不能改动：只有记录所属区域与操作者区域一致，或记录是存量「未分区」记录时可改。
 * 只判断区域归属；是否已闭环（结论冻结）由 applyRectification 单独判断，避免两个原因互相掩盖。
 */
export function canTouch(row: EntryRow, operatorRegion: string): boolean {
  const region = text(row, FIELD_REGION) || LEGACY_REGION
  return region === operatorRegion.trim() || region === LEGACY_REGION
}

/** 已闭环记录在任何区域、任何入口都只读。 */
export function isClosed(row: EntryRow): boolean {
  return String(row.status) === CLOSED_STATUS
}

function fail(id: number, message: string): RectificationResult {
  return { ok: false, message, id }
}

/**
 * 应用一次整改动作。返回的 nextRows 是整体替换用的新数组（按 id 定位，绝不按 index 回写）。
 * 校验顺序：记录存在 → 跨区域/已闭环 → 并发版本 → 状态机，任何一条不过都不产生写入。
 */
export function applyRectification(
  rows: EntryRow[],
  request: RectificationRequest,
): { result: RectificationResult; nextRows: EntryRow[] } {
  const { id, action, operatorRegion } = request
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { result: fail(id, `没有找到编号为 ${id} 的机坪安全记录`), nextRows: rows }
  }
  const row = rows[index]

  // 跨区域优先：他区人员无论记录处于什么状态都不能改。
  if (!canTouch(row, operatorRegion)) {
    return {
      result: fail(id, `记录属于${text(row, FIELD_REGION)}，${operatorRegion} 区域人员不能改动`),
      nextRows: rows,
    }
  }

  // 并发校验先于状态校验：拿着旧版本号提交（例如另一个入口刚闭环）一律拒绝，
  // 保证同一问题并发提交闭环只生效一次。
  const currentRevision = Number(row[REVISION_FIELD] ?? 0)
  if (request.expectedRevision !== undefined && request.expectedRevision !== currentRevision) {
    return {
      result: fail(id, '记录已被其他人更新，闭环只生效一次，请刷新后重试'),
      nextRows: rows,
    }
  }

  // 版本一致但记录已闭环：说明是同一条数据上的重复提交，结论已冻结。
  if (String(row.status) === CLOSED_STATUS) {
    return { result: fail(id, '该问题已闭环，不能重复整改'), nextRows: rows }
  }

  const rule = FLOW[action]
  const status = String(row.status)
  if (!rule.from.includes(status)) {
    return {
      result: fail(id, `当前状态「${status}」不能执行「${action}」`),
      nextRows: rows,
    }
  }

  // 只有确认闭环写结论（复查结果），并冻结历史；安排整改/记录巡查不覆盖任何历史结论。
  const updated: EntryRow = {
    ...row,
    status: rule.to,
    pending: rule.pending,
    abnormal: false,
    [REVISION_FIELD]: currentRevision + 1,
  }
  if (action === '确认闭环') {
    const conclusion = (request.conclusion ?? '').trim()
    updated[FIELD_REVIEW] = conclusion !== '' ? conclusion : '复查合格，确认闭环'
  }

  const nextRows = [...rows]
  nextRows[index] = updated
  return {
    result: {
      ok: true,
      id,
      revision: currentRevision + 1,
      status: rule.to,
      message: `已${action}，当前状态「${rule.to}」`,
    },
    nextRows,
  }
}

/** 详情页/列表拿到记录当前版本号；批量入口以此给每条记录做并发校验。 */
export function revisionOf(row: EntryRow): number {
  return Number(row[REVISION_FIELD] ?? 0)
}

/**
 * 对外共享的整改结论（只读）。事故上报清单与机坪安全页面共用同一份结论，
 * 按「发现问题」匹配；匹配不上说明该事故尚无对应整改结论。
 */
export function rectificationConclusions(
  rows: EntryRow[],
): Map<string, RectificationConclusion> {
  const map = new Map<string, RectificationConclusion>()
  for (const row of rows) {
    const problem = text(row, FIELD_PROBLEM)
    if (problem === '') {
      continue
    }
    map.set(problem, {
      id: Number(row.id),
      巡查编号: text(row, FIELD_CODE),
      巡查区域: text(row, FIELD_REGION) || LEGACY_REGION,
      发现问题: problem,
      复查结果: text(row, FIELD_REVIEW),
      status: String(row.status),
    })
  }
  return map
}
