<template>
  <section class="page" v-if="row">
    <header class="page-head">
      <div>
        <h2>机坪安全详情 · {{ row['巡查编号'] }}</h2>
        <p class="page-desc">
          详情页与列表按钮、批量入口共用同一份整改规则；历史处理记录只追加不改写，复查结果与区域归属以规则落定的值为准。
        </p>
      </div>
      <div class="page-actions">
        <OperatorSwitch />
        <RouterLink class="btn" to="/apron_safety">返回列表</RouterLink>
      </div>
    </header>

    <div class="detail-status">
      <span class="legend-item">当前状态：{{ row.status }}</span>
      <span class="legend-item">区域归属：{{ row['区域归属'] || '—' }}</span>
      <em v-if="row.存量未归属" class="legacy-tag">存量未归属 · 原结论保留 · 只读</em>
    </div>

    <RectificationDock
      v-if="dockOpen"
      mode="single"
      :row="row"
      :operator="operator"
      @close="dockOpen = false"
      @done="onDone"
    />

    <table class="data-table detail-table">
      <tbody>
        <tr v-for="field in COLUMN_FIELDS" :key="field">
          <th>{{ field }}</th>
          <td>{{ row[field] || '—' }}</td>
        </tr>
      </tbody>
    </table>

    <h3 class="history-title">处理记录（历史结论不可覆盖）</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th>动作</th>
          <th>处理人</th>
          <th>时间</th>
          <th>当次落定结论</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(log, index) in history" :key="index">
          <td>{{ log.action }}</td>
          <td>{{ log.by }}</td>
          <td>{{ formatTime(log.at) }}</td>
          <td>{{ describeSnapshot(log.snapshot) }}</td>
        </tr>
        <tr v-if="!history.length">
          <td colspan="4" class="empty-state">暂无处理记录</td>
        </tr>
      </tbody>
    </table>
  </section>

  <section v-else class="page">
    <p class="error-text">{{ errorMessage || '没有找到这条机坪安全记录' }}</p>
    <RouterLink class="btn" to="/apron_safety">返回列表</RouterLink>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import OperatorSwitch from '@/components/OperatorSwitch.vue'
import RectificationDock from '@/components/RectificationDock.vue'
import { currentOperator, listApronRows } from '@/api/apron-service'
import {
  COLUMN_FIELDS,
  RECTIFY_ACTIONS,
  canModify,
  type ApronField,
  type ApronRow,
  type Operator,
  type RectificationLog,
} from '@/data/apron'

const route = useRoute()
const row = ref<ApronRow | null>(null)
const errorMessage = ref('')
const dockOpen = ref(false)
const operator = computed<Operator>(() => currentOperator())

const history = computed<RectificationLog[]>(() =>
  row.value && Array.isArray(row.value.整改记录) ? (row.value.整改记录 as RectificationLog[]) : [],
)

const actionable = computed(() => {
  if (!row.value) {
    return null
  }
  const map: Record<string, keyof typeof RECTIFY_ACTIONS> = {
    待巡查: 'record',
    已巡查: 'rectify',
    待整改: 'close',
  }
  return map[String(row.value.status)] ?? null
})

function describeSnapshot(snapshot: Partial<Record<ApronField, string>>): string {
  const parts = Object.entries(snapshot)
    .filter(([, value]) => String(value ?? '').trim() !== '')
    .map(([field, value]) => `${field}=${value}`)
  return parts.length ? parts.join('；') : '—'
}

function formatTime(at: string): string {
  if (!at || at.startsWith('1970-01-01')) {
    return '存量迁移（历史时间）'
  }
  const date = new Date(at)
  return Number.isNaN(date.getTime()) ? at : date.toLocaleString()
}

function onDone() {
  dockOpen.value = false
  reload()
}

function reload() {
  const id = Number(route.params.id)
  const found = listApronRows().find((item) => Number(item.id) === id) ?? null
  row.value = found
  // 进入详情时若该状态还能处理，给出同一个动作面板；跨区域/已闭环时面板自带只读原因。
  dockOpen.value = Boolean(found && actionable.value && canModify(found, operator.value))
  if (!found) {
    errorMessage.value = `没有找到编号为 ${id} 的机坪安全记录`
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
.detail-status {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.detail-table th {
  width: 160px;
  color: var(--muted);
}
.history-title {
  margin: 18px 0 8px;
  font-size: 15px;
}
.legacy-tag {
  font-style: normal;
  background: #fef3c7;
  color: #92400e;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
}
</style>
