import type { EntryRow } from './types'
import { UNOWNED_REGION, useSessionStore } from '@/stores/session'

/**
 * 机坪安全整改的唯一动作规则。
 *
 * 列表按钮（apron_safety 列表）、详情页、批量入口三个入口都只调用本文件的
 * `applyRectification`，任何一个入口都不再自己判断状态/区域/结论，避免：
 * - 已闭环问题被重复整改；
 * - 复查结果与区域归属在页面之间错位（所有入口共用下面同一套字段名与写入时机）；
 * - 历史结论被后一次动作覆盖（结论只在对应动作发生时写入，已写入的不再改动）。
 */

export type ApronRow = EntryRow & {
  区域归属?: string
  整改记录?: RectificationLog[]
  存量未归属?: boolean
}

export type RectificationLog = {
  action: string
  by: string
  at: string
  // 当次动作落定的结论字段；历史条目原样保留，后续动作不改写。
  snapshot: Partial<Record<ApronField, string>>
}

export type Operator = { name: string; region: string }

export type RuleOutcome = {
  ok: boolean
  message: string
  row?: ApronRow
}

// 状态机：动作 -> 目标状态，且只能从指定的前态发起。
export const RECTIFY_STATUSES = ['待巡查', '已巡查', '待整改', '已闭环'] as const
export const CLOSED_STATUS = '已闭环'

export const RECTIFY_ACTIONS = {
  record: { label: '记录巡查', target: '已巡查', from: ['待巡查'] },
  rectify: { label: '安排整改', target: '待整改', from: ['已巡查'] },
  close: { label: '确认闭环', target: '已闭环', from: ['待整改'] },
} as const

// 字段名只在这一处定义：三个页面、事故上报清单都从这里取，页面之间不会再错位。
export const APRON_FIELDS = [
  '巡查编号',
  '区域归属',
  '巡查人员',
  '巡查日期',
  '发现问题',
  '整改措施',
  '复查结果',
  '安全状态',
] as const
export type ApronField = (typeof APRON_FIELDS)[number]

export const COLUMN_FIELDS: ApronField[] = [...APRON_FIELDS]

// 每个动作允许写入（落定）的字段：写过即历史，其他动作不得再改。
const WRITABLE_FIELDS: Record<string, ApronField[]> = {
  记录巡查: ['发现问题'],
  安排整改: ['整改措施'],
  确认闭环: ['复查结果', '安全状态'],
}

function text(row: ApronRow, field: ApronField): string {
  return String(row[field] ?? '').trim()
}

/** 已闭环：任何整改动作都不允许再动，三个入口共用这一闸口。 */
export function isClosed(row: ApronRow): boolean {
  return String(row.status) === CLOSED_STATUS
}

/**
 * 跨区域人员不能改动：
 * - 正常记录只允许「区域归属」与操作人员归属一致的人员处理；
 * - 存量迁移补不上区域的记录（存量未归属）对任何人只读，原结论保留。
 * operator 可显式传入（测试/批量），缺省取当前会话人员。
 */
export function canModify(row: ApronRow, operator: Operator = sessionOperator()): boolean {
  if (isClosed(row) || row.存量未归属) {
    return false
  }
  const region = text(row, '区域归属')
  if (!region || region === UNOWNED_REGION) {
    return false
  }
  return region === operator.region
}

function sessionOperator(): Operator {
  try {
    const session = useSessionStore()
    return { name: session.operatorName, region: session.operatorRegion }
  } catch {
    return { name: '', region: '' }
  }
}

export function denyReason(row: ApronRow, operator: Operator = sessionOperator(), actionLabel = '处理'): string {
  if (row.存量未归属 || !text(row, '区域归属') || text(row, '区域归属') === UNOWNED_REGION) {
    return '该记录为缺区域归属的存量记录，保留原结论且不可改动'
  }
  if (isClosed(row)) {
    return `问题已闭环，历史结论保留，不能重复${actionLabel}`
  }
  return `该问题归属${text(row, '区域归属')}，${operator.region}人员不能跨区域${actionLabel}`
}

function appendLog(row: ApronRow, actionLabel: string, operator: Operator, snapshot: Partial<Record<ApronField, string>>): ApronRow {
  const logs: RectificationLog[] = Array.isArray(row.整改记录) ? [...(row.整改记录 as RectificationLog[])] : []
  logs.push({
    action: actionLabel,
    by: operator.name,
    at: new Date().toISOString(),
    snapshot,
  })
  return { ...row, 整改记录: logs }
}

/**
 * 执行一次整改动作（三个入口共用）。
 * 入参的 fields 只能是该动作允许落定的字段，已存在的结论字段一律不覆盖。
 */
export function applyRectification(
  row: ApronRow,
  actionKey: keyof typeof RECTIFY_ACTIONS,
  operator: Operator,
  fields: Partial<Record<ApronField, string>> = {},
): RuleOutcome {
  const rule = RECTIFY_ACTIONS[actionKey]
  const actionLabel = rule.label

  if (!canModify(row, operator)) {
    return { ok: false, message: denyReason(row, operator, actionLabel) }
  }
  const fromStatuses = rule.from as readonly string[]
  if (!fromStatuses.includes(String(row.status))) {
    return {
      ok: false,
      message: `当前状态「${row.status}」不能${actionLabel}，需先完成「${fromStatuses.join('、')}」`,
    }
  }

  const snapshot: Partial<Record<ApronField, string>> = {}
  for (const field of WRITABLE_FIELDS[actionLabel] ?? []) {
    const value = String(fields[field] ?? '').trim()
    if (!value) {
      return { ok: false, message: `${actionLabel}前必须填写「${field}」` }
    }
    // 历史结论已存在则不覆盖（正常流程到不了这里，双保险）。
    if (text(row, field)) {
      return { ok: false, message: `「${field}」已有历史结论，不能被覆盖` }
    }
    snapshot[field] = value
  }

  let next: ApronRow = { ...row, ...snapshot }
  next = appendLog(next, actionLabel, operator, snapshot)
  next.status = rule.target
  next.pending = rule.target !== CLOSED_STATUS
  next.abnormal = false
  return { ok: true, message: `已${actionLabel}，当前状态「${rule.target}」`, row: next }
}

/**
 * 闭环结论访问器：事故上报清单共用这一份结论，不另存、不重算，
 * 保证机坪页面看到的复查结果与事故清单引用的是同一份历史结论。
 */
export type ClosureConclusion = {
  linked: boolean
  status: string
  region: string
  problem: string
  measure: string
  review: string
  safety: string
}

export function closureConclusion(
  rows: ApronRow[],
  patrolNo: string,
): ClosureConclusion {
  const empty: ClosureConclusion = {
    linked: false,
    status: '',
    region: '',
    problem: '',
    measure: '',
    review: '',
    safety: '',
  }
  const code = String(patrolNo ?? '').trim()
  if (!code) {
    return empty
  }
  const row = rows.find((item) => text(item, '巡查编号') === code)
  if (!row) {
    return empty
  }
  return {
    linked: true,
    status: String(row.status),
    region: text(row, '区域归属'),
    problem: text(row, '发现问题'),
    measure: text(row, '整改措施'),
    review: text(row, '复查结果'),
    safety: text(row, '安全状态'),
  }
}

/**
 * 存量记录迁移：
 * - 统一把旧字段「巡查区域」对齐到「区域归属」，消除页面间的区域错位；
 * - 缺区域归属（旧值为空或就是占位）的记录标记为「存量未归属」，保留原有
 *   整改措施/复查结果/安全状态等历史结论，不重填、不覆盖，且对任何人只读。
 */
export function migrateApronRow(raw: EntryRow): ApronRow {
  const row: ApronRow = { ...(raw as ApronRow) }
  const logs: RectificationLog[] = Array.isArray(row.整改记录) ? [...(row.整改记录 as RectificationLog[])] : []

  if (!('区域归属' in row) && '巡查区域' in row) {
    const legacyRegion = String(row.巡查区域 ?? '').trim()
    if (legacyRegion && legacyRegion !== UNOWNED_REGION && !legacyRegion.includes('样例')) {
      row.区域归属 = legacyRegion
    } else {
      row.区域归属 = UNOWNED_REGION
      row.存量未归属 = true
      row.pending = false
    }
    delete (row as Record<string, unknown>).巡查区域
  }

  if (row.存量未归属 && logs.every((log) => log.action !== '存量迁移')) {
    logs.unshift({
      action: '存量迁移',
      by: '系统迁移',
      at: '1970-01-01T00:00:00.000Z',
      // 原结论原样固化到迁移记录里，之后任何动作都不能改它们。
      snapshot: {
        整改措施: text(row, '整改措施'),
        复查结果: text(row, '复查结果'),
        安全状态: text(row, '安全状态'),
      },
    })
  }
  if (logs.length) {
    row.整改记录 = logs
  }
  return row
}
