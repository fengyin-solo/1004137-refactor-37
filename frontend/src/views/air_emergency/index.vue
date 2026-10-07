<template>
  <section class="page" data-module="air_emergency">
    <header class="page-head">
      <div>
        <h2>应急保障管理（事故上报清单）</h2>
        <p class="page-desc">事故上报按事件类型关联机坪安全记录，整改结论与机坪安全页面共用同一份数据，本页只读引用。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记应急保障</button>
        <button class="btn" type="button" @click="exportRows">导出应急保障清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>机坪整改结论（共用）</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td>
            <template v-if="conclusion(row)">
              <span class="conclusion-text">{{ conclusion(row)?.复查结果 || '（暂无复查结论）' }}</span>
              <span class="conclusion-meta">{{ conclusion(row)?.status }} · {{ conclusion(row)?.巡查编号 }}</span>
            </template>
            <span v-else class="muted-text">未关联整改记录</span>
          </td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 3" class="empty-state">暂无应急保障数据，可先登记应急保障</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条事故上报记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  conclusionByProblem,
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow, RectificationConclusion } from '@/data/types'

const meta = moduleMeta('air_emergency')
const columns = ["应急编号", "事件类型", "涉及航班", "事发位置", "响应等级", "响应人员", "处置措施", "应急状态"]
const actions = ["启动响应", "落实处置", "解除应急"]
const statuses = ["待响应", "响应中", "处置中", "已解除"]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)
const stats = computed(() => [
  { label: '事故上报', value: rows.value.length },
  { label: '已关联整改结论', value: rows.value.filter((row) => conclusion(row) !== null).length },
  { label: '已闭环', value: rows.value.filter((row) => conclusion(row)?.status === '已闭环').length },
])

// 共用结论：不复制、不缓存，每次渲染直接读机坪安全同一份结论。
function conclusion(row: EntryRow): RectificationConclusion | null {
  return conclusionByProblem(String(row['事件类型'] ?? ''))
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '应急保障登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '应急保障列表读取失败'
  }
}

onMounted(reload)
</script>

<style scoped>
.muted-text { color: var(--muted); font-size: 12px; }
.conclusion-text { display: block; font-size: 13px; }
.conclusion-meta { display: block; font-size: 12px; color: var(--muted); margin-top: 2px; }
</style>
