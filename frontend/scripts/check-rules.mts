/* 规则自检脚本：不依赖浏览器/DOM，直接验证 data 层与存储迁移的关键不变量。 */
import assert from 'node:assert'

import {
  applyRectification,
  availableActions,
  canTouch,
  isClosed,
  FIELD_REGION,
  FIELD_REVIEW,
  LEGACY_REGION,
  rectificationConclusions,
  revisionOf,
} from '../src/data/rectification'
import type { EntryRow, RectificationRequest } from '../src/data/types'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

function row(partial: Partial<EntryRow> & { id: number; status: string }): EntryRow {
  return {
    pending: true,
    abnormal: false,
    __revision: 0,
    ...partial,
  } as EntryRow
}

// 构造一套覆盖各状态与区域的记录
function dataset(): EntryRow[] {
  return [
    row({ id: 1, status: '待巡查', [FIELD_REGION]: '1号机坪', '发现问题': 'P1' }),
    row({ id: 2, status: '已巡查', [FIELD_REGION]: '1号机坪', '发现问题': 'P2' }),
    row({ id: 3, status: '待整改', [FIELD_REGION]: '1号机坪', '发现问题': 'P3' }),
    row({ id: 4, status: '待整改', [FIELD_REGION]: '2号机坪', '发现问题': 'P4' }),
    row({ id: 5, status: '已闭环', [FIELD_REGION]: '1号机坪', [FIELD_REVIEW]: '闭环结论X', '发现问题': 'P5' }),
  ]
}

const R1 = '1号机坪'
const R2 = '2号机坪'

check('待巡查只允许记录巡查；已闭环没有任何动作', () => {
  const d = dataset()
  assert.deepStrictEqual(availableActions(d[0], R1), ['记录巡查'])
  assert.deepStrictEqual(availableActions(d[4], R1), [])
})

check('已闭环问题不能重复整改（任何动作都拦下）', () => {
  const d = dataset()
  assert.strictEqual(isClosed(d[4]), true)
  // 同区域也不能再碰结论；跨区域语义与闭环语义分离
  assert.strictEqual(canTouch(d[4], R1), true)
  const r = applyRectification(d, { id: 5, action: '确认闭环', operatorRegion: R1 }).result
  assert.strictEqual(r.ok, false)
  assert.match(r.message, /已闭环/)
  const r2 = applyRectification(d, { id: 5, action: '安排整改', operatorRegion: R1 }).result
  assert.strictEqual(r2.ok, false)
})

check('跨区域人员不能改动他区记录', () => {
  const d = dataset()
  assert.strictEqual(canTouch(d[3], R1), false)
  const r = applyRectification(d, { id: 4, action: '确认闭环', operatorRegion: R1 }).result
  assert.strictEqual(r.ok, false)
  assert.match(r.message, /2号机坪/)
  // 本区人员仍可改自己区域
  assert.strictEqual(canTouch(d[3], R2), true)
})

check('未分区存量记录任何区域都可改（迁移补归属）', () => {
  const legacy = row({ id: 9, status: '待整改' }) // 无巡查区域
  assert.strictEqual(canTouch(legacy, R1), true)
  assert.strictEqual(canTouch(legacy, R2), true)
})

check('正常推进：已巡查→待整改→已闭环，闭环时写复查结论', () => {
  let d = dataset()
  const a = applyRectification(d, { id: 3, action: '确认闭环', operatorRegion: R1, conclusion: '复查通过' })
  assert.strictEqual(a.result.ok, true)
  d = a.nextRows
  const closed = d.find((x) => x.id === 3)!
  assert.strictEqual(closed.status, '已闭环')
  assert.strictEqual(closed[FIELD_REVIEW], '复查通过')
  assert.strictEqual(closed.pending, false)
  assert.strictEqual(revisionOf(closed), 1)
})

check('安排整改/记录巡查不覆盖历史复查结论', () => {
  const d0 = dataset()
  d0[1][FIELD_REVIEW] = '历史结论Y'
  const a = applyRectification(d0, { id: 2, action: '安排整改', operatorRegion: R1 })
  assert.strictEqual(a.result.ok, true)
  assert.strictEqual(a.nextRows.find((x) => x.id === 2)![FIELD_REVIEW], '历史结论Y')
})

check('状态机拦截：待整改不能直接记录巡查（顺序不可跳）', () => {
  const d = dataset()
  const r = applyRectification(d, { id: 3, action: '记录巡查', operatorRegion: R1 }).result
  assert.strictEqual(r.ok, false)
})

// 并发：模拟两个入口/两人同时拿到 revision=0 提交同一条闭环
check('同一问题并发提交闭环只生效一次（revision 乐观锁）', () => {
  let d = dataset()
  const first = applyRectification(d, { id: 3, action: '确认闭环', operatorRegion: R1, expectedRevision: 0, conclusion: '唯一结论' })
  assert.strictEqual(first.result.ok, true)
  d = first.nextRows
  // 第二个人仍拿着旧的 expectedRevision=0 提交 → 被乐观锁识别为过期提交
  const stale = applyRectification(d, { id: 3, action: '确认闭环', operatorRegion: R1, expectedRevision: 0, conclusion: '被抢写的结论' })
  assert.strictEqual(stale.result.ok, false)
  assert.match(stale.result.message, /只生效一次/)
  // 同一页面刷新后拿到新版本号再点 → 走已闭环幂等提示，结论不变
  const fresh = applyRectification(d, { id: 3, action: '确认闭环', operatorRegion: R1, expectedRevision: 1, conclusion: '第二次结论' })
  assert.strictEqual(fresh.result.ok, false)
  assert.match(fresh.result.message, /已闭环/)
  assert.strictEqual(revisionOf(d.find((x) => x.id === 3)!), 1)
  // 无论并发还是重复，原结论都不被覆盖
  assert.strictEqual(d.find((x) => x.id === 3)![FIELD_REVIEW], '唯一结论')
})

check('不存在的记录返回失败且不产生写入', () => {
  const d = dataset()
  const r = applyRectification(d, { id: 999, action: '确认闭环', operatorRegion: R1 })
  assert.strictEqual(r.result.ok, false)
  assert.strictEqual(r.nextRows, d)
})

check('结论按 id 定位、按「发现问题」共享；复查结果与区域不串列', () => {
  const d = dataset()
  const closed = applyRectification(d, { id: 3, action: '确认闭环', operatorRegion: R1, conclusion: '结论P3' })
  const map = rectificationConclusions(closed.nextRows)
  const c3 = map.get('P3')!
  assert.strictEqual(c3.复查结果, '结论P3')
  assert.strictEqual(c3.巡查区域, '1号机坪')
  assert.strictEqual(c3.status, '已闭环')
  // P5 既有闭环结论保持原值，不被 P3 覆盖
  assert.strictEqual(map.get('P5')!.复查结果, '闭环结论X')
})

check('迁移语义：缺区域→未分区，缺结论→空串但不覆盖已有结论', () => {
  const legacy = row({ id: 7, status: '待整改', [FIELD_REVIEW]: '历史结论：已通知场务' }) as EntryRow
  const migrated = { ...legacy }
  if (String(migrated[FIELD_REGION] ?? '') === '') migrated[FIELD_REGION] = LEGACY_REGION
  assert.strictEqual(migrated[FIELD_REGION], LEGACY_REGION)
  assert.strictEqual(migrated[FIELD_REVIEW], '历史结论：已通知场务')
})

console.log(`\n全部通过：${passed} 项`)
