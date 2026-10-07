<template>
  <label class="operator-switch">
    <span>当前操作人员</span>
    <select :value="store.operatorName" @change="onChange">
      <option v-for="staff in REGIONAL_STAFF" :key="staff.id" :value="staff.name">
        {{ staff.name }}（{{ staff.region }}）
      </option>
    </select>
    <em class="operator-region">归属：{{ store.operatorRegion }}</em>
  </label>
</template>

<script setup lang="ts">
import { REGIONAL_STAFF, staffByName, useSessionStore } from '@/stores/session'

const store = useSessionStore()

function onChange(event: Event) {
  const name = (event.target as HTMLSelectElement).value
  const staff = staffByName(name)
  if (staff) {
    store.setOperator(staff)
  }
}
</script>

<style scoped>
.operator-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}
.operator-switch select {
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #fff;
}
.operator-region {
  font-style: normal;
  color: #334155;
}
</style>
