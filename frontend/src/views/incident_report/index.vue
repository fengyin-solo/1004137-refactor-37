<template>
  <section class="page" data-module="incident_report">
    <header class="page-head">
      <div>
        <h2>事故上报清单</h2>
        <p class="page-desc">
          本清单不保存整改结论：复查结果、安全状态、区域归属都通过统一访问器引用机坪安全记录，
          机坪页面与事故清单看到的永远是同一份历史结论。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="exportRows">导出事故上报清单</button>
      </div>
    </header>

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>巡查编号</span>
        <input v-model="patrolFilter" placeholder="按巡查编号检索" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="patrolFilter = ''; reload()">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>上报状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">
            <template v-if="column === '闭环结论'">
              <p v-for="line in conclusionLines(row)" :key="line.label" class="conclusion-line">
                <em>{{ line.label }}</em>：
                <span :class="{ muted: !line.value }">{{ line.value || '—' }}</span>
              </p>
            </template>
            <template v-else>{{ row[column] || '—' }}</template>
          </td>
          <td>
            {{ row.status }}
            <em v-if="!sharedConclusion(String(row['巡查编号'])).linked" class="warn-tag">未关联巡查</em>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无事故上报数据</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ rows.length }} 条事故上报记录，结论随机坪安全记录实时同步</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { downloadEntries, listEntries } from '@/api/local-service'
import { INCIDENT_KEY, sharedConclusion } from '@/api/apron-service'
import type { EntryRow } from '@/data/types'

const columns = ['上报编号', '巡查编号', '事件类型', '事发区域', '上报时间', '上报人', '事故概述', '闭环结论']
const rows = ref<EntryRow[]>([])
const patrolFilter = ref('')

function conclusionLines(row: EntryRow): { label: string; value: string }[] {
  const conclusion = sharedConclusion(String(row['巡查编号']))
  return [
    { label: '区域归属', value: conclusion.region },
    { label: '巡查状态', value: conclusion.status },
    { label: '发现问题', value: conclusion.problem },
    { label: '整改措施', value: conclusion.measure },
    { label: '复查结果', value: conclusion.review },
    { label: '安全状态', value: conclusion.safety },
  ]
}

function exportRows() {
  downloadEntries(INCIDENT_KEY)
}

function reload() {
  const payload = listEntries(INCIDENT_KEY, {})
  rows.value = patrolFilter.value.trim()
    ? payload.items.filter((row) => String(row['巡查编号'] ?? '').includes(patrolFilter.value.trim()))
    : payload.items
}

onMounted(reload)
</script>

<style scoped>
.conclusion-line {
  margin: 0;
  font-size: 12px;
}
.conclusion-line em {
  font-style: normal;
  color: var(--muted);
}
.conclusion-line .muted {
  color: #94a3b8;
}
.warn-tag {
  font-style: normal;
  margin-left: 6px;
  background: #fee4e2;
  color: #b42318;
  border-radius: 999px;
  padding: 0 8px;
  font-size: 11px;
}
</style>
