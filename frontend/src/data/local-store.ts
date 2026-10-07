import {
  APRON_SAFETY_KEY,
  FIELD_REGION,
  FIELD_REVIEW,
  LEGACY_REGION,
  REVISION_FIELD,
} from './rectification'
import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'airport-ground-handling:entries'
const SCHEMA_VERSION = 2

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * 存量记录迁移：机坪安全记录缺「巡查区域」归属时补成「未分区」，
 * 只补归属与版本号，绝不动「复查结果」等历史结论。
 */
function migrateApronSafety(rows: EntryRow[]): EntryRow[] {
  return rows.map((row) => {
    const next: EntryRow = { ...row }
    if (String(next[FIELD_REGION] ?? '').trim() === '') {
      next[FIELD_REGION] = LEGACY_REGION
    }
    // 保留原结论：迁移前是什么复查结果，迁移后还是什么。
    if (String(next[FIELD_REVIEW] ?? '').trim() === '') {
      next[FIELD_REVIEW] = ''
    }
    if (next[REVISION_FIELD] === undefined) {
      next[REVISION_FIELD] = 0
    }
    return next
  })
}

function withVersion(entries: Record<string, EntryRow[]>): {
  version: number
  entries: Record<string, EntryRow[]>
} {
  const migrated = { ...entries }
  migrated[APRON_SAFETY_KEY] = migrateApronSafety(migrated[APRON_SAFETY_KEY] ?? [])
  return { version: SCHEMA_VERSION, entries: migrated }
}

function fallbackStore(): { version: number; entries: Record<string, EntryRow[]> } {
  return withVersion(clone(SEED_ROWS))
}

function readStorage(): { version: number; entries: Record<string, EntryRow[]> } {
  const fallback = fallbackStore()
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as
      | { version?: number; entries?: Record<string, EntryRow[]> }
      | Record<string, EntryRow[]>
    // 兼容旧版裸结构（直接是 { 模块: 行[] }）：走一遍迁移并补上版本号。
    const source =
      parsed && typeof parsed === 'object' && 'entries' in parsed
        ? (parsed as { entries: Record<string, EntryRow[]> }).entries
        : (parsed as Record<string, EntryRow[]>)
    const merged: Record<string, EntryRow[]> = { ...clone(SEED_ROWS), ...clone(source) }
    const store = withVersion(merged)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    return store
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: { version: number; entries: Record<string, EntryRow[]> } | null = null

function store(): { version: number; entries: Record<string, EntryRow[]> } {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function allRows(): Record<string, EntryRow[]> {
  return store().entries
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const current = store()
  const next = {
    version: current.version,
    entries: { ...current.entries, [key]: rows },
  }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  const migrated = key === APRON_SAFETY_KEY ? migrateApronSafety(rows) : rows
  saveRows(key, migrated)
  return migrated
}

export function storageKey(): string {
  return STORAGE_KEY
}
