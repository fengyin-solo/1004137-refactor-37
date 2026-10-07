<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>机坪安全批量整改</h2>
        <p class="page-desc">
          批量入口不单独写规则，所有勾选项逐条调用同一份整改动作：已闭环自动跳过、跨区域不可勾选、
          同一问题并发闭环只生效一次。
        </p>
      </div>
      <div class="page-actions">
        <OperatorSwitch />
        <RouterLink class="btn" to="/apron_safety">返回列表</RouterLink>
      </div>
    </header>

    <div class="batch-tabs">
      <button
        v-for="action in actions"
        :key="action.key"
        class="btn"
        :class="{ primary: action.key === activeAction }"
        type="button"
        @click="switchAction(action.key)"
      >
        批量{{ action.label }}
      </button>
    </div>

    <RectificationDock
      :key="activeAction"
      mode="batch"
      :ids="selectedIds"
      :action-key="activeAction"
      :operator="operator"
      @close="deselectAll"
      @done="onDone"
    />

    <table class="data-table">
      <thead>
        <tr>
          <th class="col-check"><input type="checkbox" :checked="allChecked" @change="toggleAll" /></th>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>说明</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in eligibleRows" :key="String(row.id)">
          <td class="col-check">
            <input type="checkbox" :value="row.id" v-model="selected" :disabled="!canModify(row)" />
          </td>
          <td v-for="column in columns" :key="column">{{ row[column] || '—' }}</td>
          <td>{{ row.status }}</td>
          <td>{{ canModify(row) ? '可执行' : denyReason(row, operator, activeLabel) }}</td>
        </tr>
        <tr v-if="!eligibleRows.length">
          <td :colspan="columns.length + 3" class="empty-state">当前没有处于「{{ fromStatus }}」的问题</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>已选 {{ selectedIds.length }} 条可处理问题</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import OperatorSwitch from '@/components/OperatorSwitch.vue'
import RectificationDock from '@/components/RectificationDock.vue'
import { currentOperator, listApronRows } from '@/api/apron-service'
import {
  COLUMN_FIELDS,
  RECTIFY_ACTIONS,
  canModify,
  denyReason,
  type ApronField,
  type ApronRow,
  type Operator,
} from '@/data/apron'

const columns: ApronField[] = COLUMN_FIELDS
const actions = [
  { key: 'record', label: RECTIFY_ACTIONS.record.label },
  { key: 'rectify', label: RECTIFY_ACTIONS.rectify.label },
  { key: 'close', label: RECTIFY_ACTIONS.close.label },
] as const

const activeAction = ref<keyof typeof RECTIFY_ACTIONS>('rectify')
const rows = ref<ApronRow[]>([])
const selected = ref<number[]>([])
const operator = computed<Operator>(() => currentOperator())

const activeRule = computed(() => RECTIFY_ACTIONS[activeAction.value])
const activeLabel = computed(() => activeRule.value.label)
const fromStatus = computed(() => (activeRule.value.from as readonly string[])[0])

const eligibleRows = computed(() =>
  rows.value.filter((row) => String(row.status) === fromStatus.value),
)
const selectedIds = computed(() => selected.value)
const allChecked = computed(
  () =>
    eligibleRows.value.length > 0 &&
    eligibleRows.value.every((row) => !canModify(row) || selected.value.includes(Number(row.id))),
)
function switchAction(key: keyof typeof RECTIFY_ACTIONS) {
  activeAction.value = key
  selected.value = []
}

function deselectAll() {
  selected.value = []
}

function toggleAll(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  selected.value = checked
    ? eligibleRows.value.filter((row) => canModify(row)).map((row) => Number(row.id))
    : []
}

function onDone() {
  selected.value = []
  reload()
}

function reload() {
  rows.value = listApronRows()
}

onMounted(reload)
</script>

<style scoped>
.page-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.batch-tabs {
  display: flex;
  gap: 8px;
  margin: 10px 0;
}
.col-check {
  width: 36px;
  text-align: center;
}
</style>
