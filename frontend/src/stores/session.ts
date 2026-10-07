import { defineStore } from 'pinia'

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '值班管理员',
    shiftLabel: '白班 08:00-20:00',
    scope: '机场地面保障调度管理系统',
    // 当前登录人员所属机坪区域；整改规则据此做跨区域校验。
    region: '1号机坪',
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    setRegion(region: string) {
      this.region = region
    },
  },
})
