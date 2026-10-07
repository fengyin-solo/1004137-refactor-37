import { MODULE_BY_KEY } from '@/data/modules'
import {
  APRON_SAFETY_KEY,
  applyRectification,
  availableActions as actionsFor,
  canTouch,
  isClosed,
  rectificationConclusions,
  revisionOf,
} from '@/data/rectification'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type {
  ActionResult,
  BatchRectificationResult,
  EntryRow,
  ModuleMeta,
  OverviewResult,
  PageResult,
  RectificationAction,
  RectificationRequest,
  RectificationResult,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  // 机坪安全整改必须走统一入口（带操作者区域）；通用入口不受理，避免绕过跨区域校验。
  if (key === APRON_SAFETY_KEY) {
    return { ok: false, message: '机坪安全整改请使用整改动作入口' }
  }
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

/* ── 机坪安全整改：列表按钮 / 详情页 / 批量入口共用的唯一写入口 ─────────────── */

export function listRectifications(filters: Record<string, string> = {}): PageResult {
  return listEntries(APRON_SAFETY_KEY, filters)
}

export function getRectification(id: number): EntryRow | undefined {
  return listRows(APRON_SAFETY_KEY).find((row) => Number(row.id) === id)
}

/** 页面用：当前记录在该操作者区域下可执行的动作，三处入口都从这里取。 */
export function rectificationActions(
  row: EntryRow,
  operatorRegion: string,
): RectificationAction[] {
  return actionsFor(row, operatorRegion)
}

export function rectificationRevision(row: EntryRow): number {
  return revisionOf(row)
}

export function canRectify(row: EntryRow, operatorRegion: string): boolean {
  // 可整改 = 区域可改 且 未闭环（结论冻结）。三个入口共用这一判定。
  return !isClosed(row) && canTouch(row, operatorRegion)
}

/**
 * 唯一整改提交入口。三个入口都调它，规则全部在 data/rectification.ts 里。
 */
export function submitRectification(request: RectificationRequest): RectificationResult {
  const rows = listRows(APRON_SAFETY_KEY)
  const { result, nextRows } = applyRectification(rows, request)
  if (result.ok) {
    saveRows(APRON_SAFETY_KEY, nextRows)
  }
  return result
}

/**
 * 批量入口：逐条调用同一份规则。每条都在最新数据上按 id 校验版本，
 * 因此同一问题并发提交闭环时只有第一条生效，其余被判为已更新/已闭环而拦下。
 */
export function batchSubmitRectification(
  requests: RectificationRequest[],
): BatchRectificationResult {
  const results: RectificationResult[] = []
  for (const request of requests) {
    const result = submitRectification(request)
    results.push({ ...result, id: request.id })
  }
  const rejected = [...new Set(results.filter((r) => !r.ok).map((r) => r.message))]
  return { results, rejected }
}

/* ── 事故上报清单（应急保障）共用整改结论：只读同一份数据 ──────────────────── */

export function conclusionByProblem(problem: string) {
  return rectificationConclusions(listRows(APRON_SAFETY_KEY)).get(problem.trim()) ?? null
}

export function allRectificationConclusions() {
  return [...rectificationConclusions(listRows(APRON_SAFETY_KEY)).values()]
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `﻿${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}
