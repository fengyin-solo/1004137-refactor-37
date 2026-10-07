import { listRows, saveRows } from '@/data/local-store'
import {
  RECTIFY_ACTIONS,
  applyRectification,
  closureConclusion,
  type ApronField,
  type ApronRow,
  type ClosureConclusion,
  type Operator,
} from '@/data/apron'
import { filterRows } from './local-service'
import { useSessionStore } from '@/stores/session'

export const APRON_KEY = 'apron_safety'
export const INCIDENT_KEY = 'incident_report'

// 同一问题并发提交闭环只生效一次：闭环期间占住编号，后来的并发提交直接判重。
const closingIds = new Set<number>()

export function currentOperator(): Operator {
  const session = useSessionStore()
  return { name: session.operatorName, region: session.operatorRegion }
}

export function listApronRows(filters: Record<string, string> = {}): ApronRow[] {
  return filterRows(listRows(APRON_KEY), filters) as ApronRow[]
}

export type ApplyResult = {
  ok: boolean
  message: string
}

/**
 * 三个入口（列表按钮、详情页、批量）共用的唯一写入口。
 * 提交前从存储里重新取行，不采信页面上的旧引用，杜绝拿旧状态覆盖新结论。
 */
export function applyApronAction(
  id: number,
  actionKey: keyof typeof RECTIFY_ACTIONS,
  fields: Partial<Record<ApronField, string>> = {},
  operator: Operator = currentOperator(),
): ApplyResult {
  const rule = RECTIFY_ACTIONS[actionKey]

  if (actionKey === 'close') {
    if (closingIds.has(id)) {
      return { ok: false, message: '该问题的闭环正在提交，重复提交不会再生效' }
    }
    closingIds.add(id)
    try {
      // 拿锁后重新读取：前一个并发提交可能已经落库，绝不能拿页面/进入时的旧快照再判一次。
      const latestRows = listRows(APRON_KEY) as ApronRow[]
      const latestIndex = latestRows.findIndex((row) => Number(row.id) === id)
      if (latestIndex < 0) {
        return { ok: false, message: `没有找到编号为 ${id} 的机坪安全记录` }
      }
      if (String(latestRows[latestIndex].status) === rule.target) {
        return { ok: false, message: '问题已闭环，闭环结论只生效一次' }
      }
      const outcome = applyRectification(latestRows[latestIndex], actionKey, operator, fields)
      if (!outcome.ok || !outcome.row) {
        return { ok: false, message: outcome.message }
      }
      saveRows(APRON_KEY, latestRows.map((row, index) => (index === latestIndex ? (outcome.row as ApronRow) : row)))
      return { ok: true, message: outcome.message }
    } finally {
      closingIds.delete(id)
    }
  }

  const latestRows = listRows(APRON_KEY) as ApronRow[]
  const latestIndex = latestRows.findIndex((row) => Number(row.id) === id)
  if (latestIndex < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的机坪安全记录` }
  }
  const outcome = applyRectification(latestRows[latestIndex], actionKey, operator, fields)
  if (!outcome.ok || !outcome.row) {
    return { ok: false, message: outcome.message }
  }
  saveRows(
    APRON_KEY,
    latestRows.map((row, index) => (index === latestIndex ? (outcome.row as ApronRow) : row)),
  )
  return { ok: true, message: outcome.message }
}

export type BatchResult = {
  id: number
  ok: boolean
  message: string
}

/** 批量入口同样逐条走 applyApronAction，不另写一套判断；每条独立返回结果。 */
export function batchApronAction(
  ids: number[],
  actionKey: keyof typeof RECTIFY_ACTIONS,
  fields: Partial<Record<ApronField, string>> = {},
  operator: Operator = currentOperator(),
): BatchResult[] {
  return ids.map((id) => {
    const result = applyApronAction(id, actionKey, fields, operator)
    return { id, ok: result.ok, message: result.message }
  })
}

/** 事故上报清单共用机坪安全的闭环结论：只读引用，不复制、不改写。 */
export function sharedConclusion(patrolNo: string): ClosureConclusion {
  return closureConclusion(listRows(APRON_KEY) as ApronRow[], patrolNo)
}
