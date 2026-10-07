<template>
  <div class="dock">
    <div class="dock-head">
      <strong>{{ title }}</strong>
      <button class="link" type="button" @click="emit('close')">收起</button>
    </div>

    <template v-if="resolvedAction">
      <p class="dock-hint">{{ hint }}</p>

      <fieldset :disabled="!editable" class="dock-form">
        <label v-if="resolvedAction === 'record'" class="dock-field">
          <span>发现问题（落定后成为历史记录）</span>
          <textarea v-model="form.发现问题" rows="2" placeholder="填写本次巡查发现的问题"></textarea>
        </label>
        <label v-if="resolvedAction === 'rectify'" class="dock-field">
          <span>整改措施</span>
          <textarea v-model="form.整改措施" rows="2" placeholder="填写整改措施"></textarea>
        </label>
        <template v-if="resolvedAction === 'close'">
          <label class="dock-field">
            <span>复查结果</span>
            <select v-model="form.复查结果">
              <option value="" disabled>请选择复查结果</option>
              <option value="合格">合格</option>
              <option value="不合格">不合格</option>
            </select>
          </label>
          <label class="dock-field">
            <span>安全状态</span>
            <select v-model="form.安全状态">
              <option value="" disabled>请选择闭环后的安全状态</option>
              <option value="正常">正常</option>
              <option value="管控中">管控中</option>
            </select>
          </label>
        </template>

        <p v-if="!editable" class="dock-block">{{ blockReason }}</p>

        <div class="dock-actions">
          <button class="btn primary" type="button" :disabled="!editable" @click="submit">
            {{ actionLabel }}
          </button>
          <button class="btn ghost" type="button" @click="emit('close')">取消</button>
        </div>
      </fieldset>

      <ul v-if="batchResults.length" class="dock-results">
        <li v-for="item in batchResults" :key="item.id" :class="item.ok ? 'ok' : 'fail'">
          {{ item.id }}：{{ item.message }}
        </li>
      </ul>
    </template>

    <p v-else class="dock-block">{{ blockedNote }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import { applyApronAction, batchApronAction } from '@/api/apron-service'
import {
  RECTIFY_ACTIONS,
  canModify,
  denyReason,
  type ApronField,
  type ApronRow,
  type Operator,
} from '@/data/apron'

type ActionKey = keyof typeof RECTIFY_ACTIONS

const STATUS_TO_ACTION: Record<string, ActionKey> = {
  待巡查: 'record',
  已巡查: 'rectify',
  待整改: 'close',
}

const props = defineProps<{
  mode: 'single' | 'batch'
  row?: ApronRow
  ids?: number[]
  rows?: ApronRow[]
  actionKey?: ActionKey
  operator?: Operator
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'done'): void
}>()

const form = reactive<Partial<Record<ApronField, string>>>({})
const batchResults = ref<{ id: number; ok: boolean; message: string }[]>([])

const resolvedAction = computed<ActionKey | null>(() => {
  if (props.mode === 'batch') {
    return props.actionKey ?? null
  }
  return props.row ? (STATUS_TO_ACTION[String(props.row.status)] ?? null) : null
})

const actionLabel = computed(() =>
  resolvedAction.value ? RECTIFY_ACTIONS[resolvedAction.value].label : '',
)

const title = computed(() =>
  props.mode === 'batch' ? `批量${actionLabel.value}` : `${actionLabel.value}（巡查 ${props.row?.['巡查编号'] ?? ''}）`,
)

const hint = computed(() => {
  if (!resolvedAction.value) {
    return ''
  }
  if (props.mode === 'batch') {
    return `将对勾选的 ${props.ids?.length ?? 0} 条问题逐条执行同一动作，规则逐条校验。`
  }
  return `归属区域：${props.row?.['区域归属'] || '—'}，当前状态：${props.row?.status ?? '—'}`
})

const editable = computed(() => {
  if (!resolvedAction.value) {
    return false
  }
  if (props.mode === 'batch') {
    return (props.ids?.length ?? 0) > 0
  }
  if (!props.row || !props.operator) {
    return false
  }
  return canModify(props.row, props.operator)
})

const blockReason = computed(() => {
  if (props.mode === 'batch') {
    return (props.ids?.length ?? 0) > 0 ? '' : '请先在清单中勾选要处理的问题'
  }
  if (!props.row || !props.operator || !resolvedAction.value) {
    return ''
  }
  return denyReason(props.row, props.operator, actionLabel.value)
})

const blockedNote = computed(() => {
  if (!props.row) {
    return '请选择一条问题'
  }
  return denyReason(props.row, props.operator ?? { name: '', region: '' }, '处理')
})

watch(
  resolvedAction,
  () => {
    form.发现问题 = ''
    form.整改措施 = ''
    form.复查结果 = ''
    form.安全状态 = ''
    batchResults.value = []
  },
  { immediate: true },
)

function fieldsFor(action: ActionKey | null): Partial<Record<ApronField, string>> {
  if (action === 'record') {
    return { 发现问题: form.发现问题 ?? '' }
  }
  if (action === 'rectify') {
    return { 整改措施: form.整改措施 ?? '' }
  }
  if (action === 'close') {
    return { 复查结果: form.复查结果 ?? '', 安全状态: form.安全状态 ?? '' }
  }
  return {}
}

function submit() {
  const action = resolvedAction.value
  if (!action) {
    return
  }
  const payload = fieldsFor(action)
  if (props.mode === 'batch' && props.ids) {
    batchResults.value = batchApronAction(props.ids, action, payload, props.operator)
    if (batchResults.value.some((item) => item.ok)) {
      emit('done')
    }
    return
  }
  if (!props.row) {
    return
  }
  const result = applyApronAction(Number(props.row.id), action, payload, props.operator)
  batchResults.value = [{ id: Number(props.row.id), ok: result.ok, message: result.message }]
  if (result.ok) {
    emit('done')
  }
}
</script>

<style scoped>
.dock {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  margin: 10px 0;
}
.dock-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.dock-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--muted);
}
.dock-form {
  border: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dock-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
}
.dock-field textarea,
.dock-field select {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 13px;
  color: #1f2937;
}
.dock-block {
  margin: 4px 0;
  font-size: 12px;
  color: #b42318;
}
.dock-actions {
  display: flex;
  gap: 8px;
}
.dock-results {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  font-size: 12px;
}
.dock-results .ok {
  color: #067647;
}
.dock-results .fail {
  color: #b42318;
}
</style>
