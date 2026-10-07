<template>
  <section class="page" data-module="apron_safety">
    <header class="page-head">
      <div>
        <h2>机坪安全管理</h2>
        <p class="page-desc">
          巡查问题的整改、闭环统一走同一份动作规则；列表按钮、详情页、批量入口只是三个薄入口，
          已闭环问题不可重复整改，跨区域人员不能改动。
        </p>
      </div>
      <div class="page-actions">
        <OperatorSwitch />
        <RouterLink class="btn" to="/apron_safety/batch">打开批量整改入口</RouterLink>
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

    <div class="batch-bar">
      <span>已选 {{ selectedIds.length }} 条</span>
      <button
        v-for="action in batchActions"
        :key="action.key"
        class="btn"
        type="button"
        :disabled="!selectedIds.length"
        @click="openBatch(action.key)"
      >
        批量{{ action.label }}
      </button>
    </div>

    <RectificationDock
      v-if="dock"
      :mode="dock.mode"
      :row="dock.mode === 'single' ? dock.row : undefined"
      :ids="selectedIds"
      :action-key="dock.mode === 'batch' ? dock.actionKey : undefined"
      :operator="operator"
      @close="dock = null"
      @done="onDone"
    />

    <table class="data-table">
      <thead>
        <tr>
          <th class="col-check"><input type="checkbox" :checked="allChecked" @change="toggleAll" /></th>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td class="col-check">
            <input
              type="checkbox"
              :value="row.id"
              v-model="selected"
              :disabled="!canModify(row)"
            />
          </td>
          <td v-for="column in columns" :key="column">
            <template v-if="column === '巡查编号'">
              <RouterLink class="link" :to="`/apron_safety/${row.id}`">{{ row[column] }}</RouterLink>
            </template>
            <template v-else>
              {{ row[column] || '—' }}<em v-if="column === '区域归属' && row.存量未归属" class="legacy-tag">存量</em>
            </template>
          </td>
          <td>
            {{ row.status }}
            <em v-if="row.存量未归属" class="legacy-tag">原结论保留</em>
          </td>
          <td class="row-actions">
            <button
              v-if="rowAction(row)"
              class="link"
              type="button"
              :disabled="!canModify(row)"
              :title="canModify(row) ? '' : denyReason(row)"
              @click="openSingle(row)"
            >
              {{ rowAction(row)?.label }}
            </button>
            <RouterLink class="link" :to="`/apron_safety/${row.id}`">查看详情</RouterLink>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 3" class="empty-state">暂无机坪安全数据</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条机坪安全记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { downloadEntries } from '@/api/local-service'
import { APRON_KEY, currentOperator, listApronRows } from '@/api/apron-service'
import OperatorSwitch from '@/components/OperatorSwitch.vue'
import RectificationDock from '@/components/RectificationDock.vue'
import {
  COLUMN_FIELDS,
  RECTIFY_ACTIONS,
  RECTIFY_STATUSES,
  canModify,
  denyReason,
  type ApronField,
  type ApronRow,
  type Operator,
} from '@/data/apron'

const operator = computed<Operator>(() => currentOperator())

const columns: ApronField[] = COLUMN_FIELDS
const filterFields: ApronField[] = ['巡查编号', '区域归属', '巡查人员']
const batchActions = [
  { key: 'record', label: RECTIFY_ACTIONS.record.label },
  { key: 'rectify', label: RECTIFY_ACTIONS.rectify.label },
  { key: 'close', label: RECTIFY_ACTIONS.close.label },
] as const

const rows = ref<ApronRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = reactive<Record<string, string>>({})
const selected = ref<number[]>([])

type DockState =
  | { mode: 'single'; row: ApronRow; actionKey: keyof typeof RECTIFY_ACTIONS }
  | { mode: 'batch'; actionKey: keyof typeof RECTIFY_ACTIONS }
  | null
const dock = ref<DockState>(null)

const stats = computed(() => [
  { label: '待整改问题', value: rows.value.filter((row) => String(row.status) === '待整改').length },
  { label: '已闭环问题', value: rows.value.filter((row) => String(row.status) === '已闭环').length },
  {
    label: '存量未归属',
    value: rows.value.filter((row) => row.存量未归属).length,
  },
])

const statusSummary = computed(() =>
  [...RECTIFY_STATUSES].map((status) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

const selectedIds = computed(() => selected.value)
const allChecked = computed(
  () => rows.value.length > 0 && rows.value.every((row) => !canModify(row) || selected.value.includes(Number(row.id))),
)

function rowAction(row: ApronRow) {
  const keyByStatus: Record<string, keyof typeof RECTIFY_ACTIONS> = {
    待巡查: 'record',
    已巡查: 'rectify',
    待整改: 'close',
  }
  const key = keyByStatus[String(row.status)]
  return key ? RECTIFY_ACTIONS[key] : null
}

function openSingle(row: ApronRow) {
  const keyByStatus: Record<string, keyof typeof RECTIFY_ACTIONS> = {
    待巡查: 'record',
    已巡查: 'rectify',
    待整改: 'close',
  }
  const actionKey = keyByStatus[String(row.status)]
  if (!actionKey) {
    return
  }
  errorMessage.value = ''
  dock.value = { mode: 'single', row, actionKey }
}

function openBatch(actionKey: keyof typeof RECTIFY_ACTIONS) {
  errorMessage.value = ''
  dock.value = { mode: 'batch', actionKey }
}

function toggleAll(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  selected.value = checked ? rows.value.filter((row) => canModify(row)).map((row) => Number(row.id)) : []
}

function onDone() {
  dock.value = null
  selected.value = []
  reload()
}

function resetFilters() {
  for (const key of Object.keys(filters)) {
    filters[key] = ''
  }
  reload()
}

function exportRows() {
  downloadEntries(APRON_KEY)
}

function reload() {
  errorMessage.value = ''
  try {
    rows.value = listApronRows(filters)
    total.value = rows.value.length
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '机坪安全列表读取失败'
  }
}

onMounted(reload)
</script>

<style scoped>
.page-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.batch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0;
  font-size: 12px;
  color: var(--muted);
}
.col-check {
  width: 36px;
  text-align: center;
}
.legacy-tag {
  font-style: normal;
  margin-left: 6px;
  background: #fef3c7;
  color: #92400e;
  border-radius: 999px;
  padding: 0 8px;
  font-size: 11px;
}
.row-actions .link:disabled {
  color: #94a3b8;
  cursor: not-allowed;
}
</style>
