import { defineStore } from 'pinia'

// 各责任区的在册人员：动作规则只认「人员归属区域」，不认页面传参，
// 这样列表按钮、详情页、批量入口三个入口的跨区域校验才不会各写各的。
export const REGIONAL_STAFF: { id: string; name: string; region: string }[] = [
  { id: 'INS-01', name: '张伟', region: '东区' },
  { id: 'INS-02', name: '李娜', region: '西区' },
  { id: 'INS-03', name: '王强', region: '南区' },
  { id: 'INS-04', name: '赵敏', region: '北区' },
]

export const ALL_REGIONS = ['东区', '西区', '南区', '北区']
export const UNOWNED_REGION = '未归属区域'

export function staffByName(name: string): { id: string; name: string; region: string } | undefined {
  return REGIONAL_STAFF.find((item) => item.name === name)
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '值班管理员',
    // 当前值班人：默认东区张伟。切换人员只用于演示责任区隔离，不改变任何业务能力。
    operatorName: '张伟',
    operatorRegion: '东区',
    shiftLabel: '白班 08:00-20:00',
    scope: '机场地面保障调度管理系统',
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    setOperator(staff: { name: string; region: string }) {
      this.operatorName = staff.name
      this.operatorRegion = staff.region
    },
  },
})
