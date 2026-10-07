import { SEED_ROWS } from './seed'
import { migrateApronRow } from './apron'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'airport-ground-handling:entries'

// 个别模块的记录需要随加载做一次存量迁移（如机坪安全补齐区域归属、固化历史结论）。
const MIGRATORS: Record<string, (row: EntryRow) => EntryRow> = {
  apron_safety: migrateApronRow,
}

function migrateGroup(key: string, rows: EntryRow[]): EntryRow[] {
  const migrator = MIGRATORS[key]
  return migrator ? rows.map((row) => migrator(row)) : rows
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function seedData(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  return Object.fromEntries(
    Object.entries(fallback).map(([key, rows]) => [key, migrateGroup(key, rows)]),
  )
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = seedData()
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    const migrated = Object.fromEntries(
      Object.entries(parsed).map(([key, rows]) => [key, migrateGroup(key, rows ?? [])]),
    )
    // 旧浏览器存档里缺少新增模块时，用示例数据补齐，同时保留存档里已有的模块。
    return { ...fallback, ...migrated }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = migrateGroup(key, clone(SEED_ROWS[key] ?? []))
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}
