import { build } from 'esbuild'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const virtual = `
import { applyRectification, migrateApronRow, closureConclusion, RECTIFY_ACTIONS } from '@/data/apron'
import { SEED_ROWS } from '@/data/seed'

let pass = 0
let fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log('PASS', name) }
  else { fail++; console.log('FAIL', name) }
}

const east = { name: '张伟', region: '东区' }
const west = { name: '李娜', region: '西区' }

// 1. 正常链路：记录巡查 -> 安排整改 -> 确认闭环，结论按动作落定（规则是纯函数，结果行写回数组）
let rows = SEED_ROWS.apron_safety.map(migrateApronRow)
const find = (id) => rows.find((r) => Number(r.id) === id)
const commit = (id, out) => {
  if (out.ok && out.row) {
    rows = rows.map((row) => (Number(row.id) === id ? out.row : row))
  }
}
let r = applyRectification(find(1), 'record', east, { 发现问题: '锥桶倒伏' })
commit(1, r)
check('记录巡查成功', r.ok && find(1).status === '已巡查' && find(1)['发现问题'] === '锥桶倒伏')
r = applyRectification(find(1), 'rectify', east, { 整改措施: '扶起锥桶并加固' })
commit(1, r)
check('安排整改成功', r.ok && find(1).status === '待整改')
r = applyRectification(find(1), 'close', east, { 复查结果: '合格', 安全状态: '正常' })
commit(1, r)
check('确认闭环成功', r.ok && find(1).status === '已闭环')

// 2. 已闭环不能重复整改（任何动作）
r = applyRectification(find(1), 'close', east, { 复查结果: '合格', 安全状态: '正常' })
check('已闭环不能再确认闭环', !r.ok && /已闭环/.test(r.message))
r = applyRectification(find(1), 'rectify', east, { 整改措施: '再改一次' })
check('已闭环不能再安排整改', !r.ok && /已闭环/.test(r.message))
r = applyRectification(find(4), 'close', east, { 复查结果: '合格', 安全状态: '正常' })
check('种子里已闭环记录不可重复闭环', !r.ok)

// 3. 历史结论不被覆盖
const before = JSON.stringify(find(4)['复查结果'])
applyRectification(find(4), 'record', east, { 发现问题: 'x' })
check('历史复查结果未被覆盖', JSON.stringify(find(4)['复查结果']) === before)
check('处理记录逐条追加', (find(1)['整改记录'] || []).length === 3)

// 4. 状态顺序不可跳
r = applyRectification(find(2), 'close', west, { 复查结果: '合格', 安全状态: '正常' })
check('已巡查不能直接闭环', !r.ok && /不能确认闭环/.test(r.message))

// 5. 跨区域人员不能改动
r = applyRectification(find(2), 'rectify', east, { 整改措施: '越区整改' })
check('东区人员不能改西区问题', !r.ok && /跨区域/.test(r.message))
r = applyRectification(find(2), 'rectify', west, { 整改措施: '西区自行整改' })
commit(2, r)
check('西区人员可以改西区问题', r.ok)
r = applyRectification(find(3), 'close', west, { 复查结果: '合格', 安全状态: '正常' })
check('西区人员不能闭环东区问题', !r.ok && /跨区域/.test(r.message))
r = applyRectification(find(3), 'close', east, { 复查结果: '合格', 安全状态: '正常' })
commit(3, r)
check('东区人员闭环东区问题', r.ok && find(3).status === '已闭环')

// 6. 必填结论：空复查结果不能闭环
let rows2 = SEED_ROWS.apron_safety.map(migrateApronRow)
r = applyRectification(rows2.find((x) => Number(x.id) === 3), 'close', east, {})
check('缺复查结果不能闭环', !r.ok && /复查结果/.test(r.message))
r = applyRectification(rows2.find((x) => Number(x.id) === 3), 'close', east, { 复查结果: '合格' })
check('缺安全状态不能闭环', !r.ok && /安全状态/.test(r.message))

// 7. 存量迁移：缺区域归属保留原结论，且任何人不能改
const legacy = SEED_ROWS.apron_safety.find((x) => Number(x.id) === 6)
const migrated = migrateApronRow(legacy)
check('缺区域记录迁移为未归属', migrated['区域归属'] === '未归属区域' && migrated['存量未归属'] === true)
check('存量原复查结果保留', migrated['复查结果'] === '旧台账结论：复查通过')
check('存量原整改措施保留', migrated['整改措施'] === '旧台账结论：已更换反光标识')
check('存量处理记录固化原结论', (migrated['整改记录'] || []).some((l) => l.action === '存量迁移'))
r = applyRectification(migrated, 'close', east, { 复查结果: '合格', 安全状态: '正常' })
check('存量记录对东区只读', !r.ok && /存量/.test(r.message))
r = applyRectification(migrated, 'close', west, { 复查结果: '合格', 安全状态: '正常' })
check('存量记录对西区只读', !r.ok)
// 迁移幂等
const again = migrateApronRow(migrated)
check('迁移幂等', (again['整改记录'] || []).filter((l) => l.action === '存量迁移').length === 1)
// 旧字段「巡查区域」有值时对齐到「区域归属」
const withRegion = migrateApronRow({
  id: 99, status: '已巡查', pending: true, abnormal: false,
  巡查编号: 'X', 巡查区域: '南区', 巡查人员: '王强', 巡查日期: '2026-09-01',
  发现问题: 'a', 整改措施: '', 复查结果: '', 安全状态: '',
})
check('旧巡查区域对齐到区域归属', withRegion['区域归属'] === '南区' && !('巡查区域' in withRegion) && !withRegion['存量未归属'])

// 8. 事故上报清单共用结论：改的是同一份数据，访问器读到一致结论
let sharedRows = SEED_ROWS.apron_safety.map(migrateApronRow)
let c = closureConclusion(sharedRows, 'APRO-0004')
check('事故清单引用到已闭环结论', c.linked && c.review === '合格' && c.safety === '正常' && c.region === '南区')
// 闭环 id=3 后，事故清单应读到新结论
sharedRows = sharedRows.map((row) => {
  const out = applyRectification(row, 'close', east, { 复查结果: '合格', 安全状态: '正常' })
  return out.ok && out.row ? out.row : row
})
c = closureConclusion(sharedRows, 'APRO-0003')
check('闭环后事故清单读到同一复查结果', c.linked && c.status === '已闭环' && c.review === '合格')
c = closureConclusion(sharedRows, 'NOT-EXIST')
check('未关联编号返回未链接', !c.linked)

// 9. 并发闭环：同一条同时发起两次，只有一次能落
// 模拟：第一次提交占住期间，第二次直接被去重
const closing = new Set()
function concurrentCloseOnce(id, row) {
  if (closing.has(id)) return { ok: false, message: '并发重复提交被拒绝' }
  closing.add(id)
  const out = applyRectification(row, 'close', east, { 复查结果: '合格', 安全状态: '正常' })
  if (!out.ok) closing.delete(id)
  return out
}
let rows3 = SEED_ROWS.apron_safety.map(migrateApronRow)
const target = rows3.find((x) => Number(x.id) === 3)
const first = concurrentCloseOnce(3, target)
const second = concurrentCloseOnce(3, target)
check('并发闭环第一次生效', first.ok)
check('并发闭环第二次不生效', !second.ok)

console.log('\\n结果:', pass, 'passed,', fail, 'failed')
if (fail > 0) process.exit(1)
`

const result = await build({
  stdin: { contents: virtual, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true,
  write: false,
  format: 'esm',
  alias: { '@': join(process.cwd(), 'src') },
})

const dir = mkdtempSync(join(tmpdir(), 'apron-check-'))
const file = join(dir, 'check.mjs')
writeFileSync(file, result.outputFiles[0].text)
await import(pathToFileURL(file).href)
