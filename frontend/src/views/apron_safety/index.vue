<template>
  <section class="page" data-module="apron_safety">
    <header class="page-head">
      <div>
        <h2>机坪安全管理</h2>
        <p class="page-desc">巡查发现问题后统一走整改动作规则：列表按钮、详情页、批量入口三处共用同一份规则与结论。</p>
      </div>
      <div class="page-actions">
        <span class="region-tag">当前人员区域：{{ store.region }}</span>
        <button class="btn primary" type="button" @click="openCreate">登记机坪安全</button>
        <button class="btn" type="button" @click="exportRows">导出机坪安全清单</button>
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

    <!-- 批量入口：仅对勾选、且本区域可改的记录，调用同一份规则逐条提交。 -->
    <div v-if="selectedIds.length" class="batch-bar">
      <span>已选 {{ selectedIds.length }} 条（跨区域、已闭环记录不可选）</span>
      <button class="btn" type="button" @click="runBatch('安排整改')">批量安排整改</button>
      <button class="btn primary" type="button" @click="runBatch('确认闭环')">批量确认闭环</button>
      <button class="btn ghost" type="button" @click="clearSelection">清除选择</button>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th class="col-check"></th>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
          <th>详情</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td class="col-check">
            <input
              type="checkbox"
              :checked="isSelected(row)"
              :disabled="!canRectify(row, store.region)"
              @change="toggleSelect(row)"
            />
          </td>
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <!-- 列表按钮入口：只渲染规则允许的动作。 -->
            <template v-if="canRectify(row, store.region)">
              <button
                v-for="action in allowedActions(row)"
                :key="action"
                class="link"
                type="button"
                @click="runRowAction(action, row)"
              >
                {{ action }}
              </button>
              <span v-if="!allowedActions(row).length" class="muted-text">—</span>
            </template>
            <span v-else class="muted-text">{{ lockedReason(row) }}</span>
          </td>
          <td>
            <button class="link" type="button" @click="openDetail(row)">查看详情</button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 4" class="empty-state">暂无机坪安全数据，可先登记机坪安全</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条机坪安全记录</span>
      <span v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</span>
    </footer>

    <!-- 详情页入口：展示完整记录，动作按钮仍调用同一份规则。 -->
    <div v-if="detail" class="modal-mask" @click.self="closeDetail">
      <div class="modal">
        <div class="modal-head">
          <h3>整改详情 · {{ String(detail['巡查编号']) }}</h3>
          <button class="link" type="button" @click="closeDetail">关闭</button>
        </div>
        <dl class="detail-grid">
          <template v-for="column in columns" :key="column">
            <dt>{{ column }}</dt>
            <dd>{{ detail[column] || '—' }}</dd>
          </template>
          <dt>当前状态</dt>
          <dd>{{ detail.status }}</dd>
          <dt>所属区域</dt>
          <dd>{{ detailRegion }}</dd>
        </dl>

        <div v-if="canRectify(detail, store.region)" class="detail-actions">
          <label v-if="detailCanClose" class="filter-item">
            <span>闭环复查结果（确认闭环时写入）</span>
            <input v-model="detailConclusion" placeholder="复查合格，确认闭环" />
          </label>
          <button
            v-for="action in allowedActions(detail)"
            :key="action"
            class="btn"
            :class="{ primary: action === '确认闭环' }"
            type="button"
            @click="runDetailAction(action)"
          >
            {{ action }}
          </button>
          <span v-if="!allowedActions(detail).length" class="muted-text">当前状态暂无可执行动作</span>
        </div>
        <p v-else class="muted-text">{{ lockedReason(detail) }}，详情仅可查看。</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  batchSubmitRectification,
  canRectify,
  downloadEntries,
  getRectification,
  listRectifications,
  moduleMeta,
  rectificationActions,
  rectificationRevision,
  submitRectification,
} from '@/api/local-service'
import { useSessionStore } from '@/stores/session'
import {
  CLOSED_STATUS,
  FIELD_REGION,
  LEGACY_REGION,
} from '@/data/rectification'
import type { EntryRow, RectificationAction } from '@/data/types'

const store = useSessionStore()
const meta = moduleMeta('apron_safety')
const columns = meta.fields
const stats = computed(() => [
  { label: '待整改问题', value: rows.value.filter((r) => r.status === '待整改').length },
  { label: '已闭环问题', value: rows.value.filter((r) => r.status === CLOSED_STATUS).length },
  { label: '跨区域不可改', value: rows.value.filter((r) => !canRectify(r, store.region) && r.status !== CLOSED_STATUS).length },
])
const statuses = meta.statuses

const rows = ref<EntryRow[]>([])
const total = ref(0)
const message = ref('')
const messageOk = ref(false)
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const selectedRows = ref<EntryRow[]>([])

// 详情页状态：进入详情时拉取最新记录与版本号，避免用旧数据提交。
const detail = ref<EntryRow | null>(null)
const detailConclusion = ref('')

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

const selectedIds = computed(() => selectedRows.value.map((row) => Number(row.id)))
const detailRegion = computed(() =>
  detail.value ? String(detail.value[FIELD_REGION] || LEGACY_REGION) : '',
)
const detailCanClose = computed(() =>
  detail.value ? rectificationActions(detail.value, store.region).includes('确认闭环') : false,
)

function allowedActions(row: EntryRow): RectificationAction[] {
  return rectificationActions(row, store.region)
}

function lockedReason(row: EntryRow): string {
  if (String(row.status) === CLOSED_STATUS) {
    return '已闭环，结论冻结'
  }
  return `属于${String(row[FIELD_REGION] || LEGACY_REGION)}，跨区域不可改`
}

function isSelected(row: EntryRow): boolean {
  return selectedIds.value.includes(Number(row.id))
}

function toggleSelect(row: EntryRow) {
  if (!canRectify(row, store.region)) {
    return
  }
  const id = Number(row.id)
  selectedRows.value = isSelected(row)
    ? selectedRows.value.filter((item) => Number(item.id) !== id)
    : [...selectedRows.value, row]
}

function clearSelection() {
  selectedRows.value = []
}

function notify(ok: boolean, text: string) {
  messageOk.value = ok
  message.value = text
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  notify(false, '机坪安全登记入口尚未接入审批流')
}

// 列表按钮入口
function runRowAction(action: RectificationAction, row: EntryRow) {
  const result = submitRectification({
    id: Number(row.id),
    action,
    operatorRegion: store.region,
    expectedRevision: rectificationRevision(row),
  })
  notify(result.ok, result.message)
  if (result.ok) {
    reload()
  }
}

// 详情页入口：提交前以详情内最新版本号做并发校验
function runDetailAction(action: RectificationAction) {
  if (!detail.value) {
    return
  }
  const result = submitRectification({
    id: Number(detail.value.id),
    action,
    operatorRegion: store.region,
    expectedRevision: rectificationRevision(detail.value),
    conclusion: action === '确认闭环' ? detailConclusion.value : undefined,
  })
  notify(result.ok, result.message)
  if (result.ok) {
    closeDetail()
    reload()
  }
}

// 批量入口：逐条走同一份规则，只有能成功的生效
function runBatch(action: RectificationAction) {
  const requests = selectedRows.value.map((row) => ({
    id: Number(row.id),
    action,
    operatorRegion: store.region,
    expectedRevision: rectificationRevision(row),
  }))
  const { results, rejected } = batchSubmitRectification(requests)
  const done = results.filter((item) => item.ok).length
  const summary = [`批量${action}完成，成功 ${done} 条`, ...rejected].join('；')
  notify(rejected.length === 0, summary)
  clearSelection()
  reload()
}

function openDetail(row: EntryRow) {
  // 进入详情拉一次最新数据，详情页结论与列表共用同一份记录。
  detail.value = getRectification(Number(row.id)) ?? row
  detailConclusion.value = String(detail.value['复查结果'] ?? '')
}

function closeDetail() {
  detail.value = null
  detailConclusion.value = ''
}

function reload() {
  message.value = ''
  try {
    const payload = listRectifications(filters.value)
    rows.value = payload.items
    total.value = payload.total
    // 只保留仍存在、且仍可改的勾选项，避免筛选后批量入口带着失效选择。
    const live = new Set(rows.value.map((row) => Number(row.id)))
    selectedRows.value = selectedRows.value.filter(
      (row) => live.has(Number(row.id)) && canRectify(row, store.region),
    )
    if (detail.value) {
      const refreshed = getRectification(Number(detail.value.id))
      if (refreshed) {
        detail.value = refreshed
      }
    }
  } catch (error) {
    notify(false, error instanceof Error ? error.message : '机坪安全列表读取失败')
  }
}

onMounted(reload)
</script>

<style scoped>
.region-tag { font-size: 12px; color: var(--muted); margin-right: 8px; }
.batch-bar {
  display: flex; align-items: center; gap: 10px;
  background: #eef4ff; border: 1px solid var(--border); border-radius: 8px;
  padding: 8px 12px; margin-bottom: 10px; font-size: 13px;
}
.col-check { width: 36px; text-align: center; }
.muted-text { color: var(--muted); font-size: 12px; }
.ok-text { color: #067647; }
.modal-mask {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45);
  display: flex; align-items: center; justify-content: center; z-index: 20;
}
.modal {
  width: 640px; max-width: 92vw; max-height: 86vh; overflow: auto;
  background: #fff; border-radius: 10px; padding: 16px 18px;
}
.modal-head { display: flex; justify-content: space-between; align-items: center; }
.modal-head h3 { margin: 0; font-size: 15px; }
.detail-grid { display: grid; grid-template-columns: 110px 1fr; gap: 6px 12px; margin: 12px 0; }
.detail-grid dt { color: var(--muted); font-size: 12px; }
.detail-grid dd { margin: 0; font-size: 13px; }
.detail-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; border-top: 1px solid var(--border); padding-top: 12px; }
</style>
