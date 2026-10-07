/* 存储迁移自检：模拟浏览器 localStorage 里的旧版数据，验证缺区域存量记录迁移后结论不丢。 */
import assert from 'node:assert'

// 最小 localStorage mock（在导入数据层之前挂到 globalThis）
class MemoryStorage {
  private map = new Map<string, string>()
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null }
  setItem(key: string, value: string) { this.map.set(key, value) }
  removeItem(key: string) { this.map.delete(key) }
  clear() { this.map.clear() }
}
;(globalThis as unknown as { window: unknown }).window = { localStorage: new MemoryStorage() }
;(globalThis as unknown as { localStorage: unknown }).localStorage = (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window.localStorage

const store = await import('../src/data/local-store.ts')

// 1) 旧版裸结构：没有 version/entries 包装，且机坪安全记录缺巡查区域、带历史复查结论
const legacyRows = [
  {
    id: 101, status: '待整改', pending: true, abnormal: false,
    巡查编号: 'APRO-0101',
    巡查人员: '旧系统人员',
    巡查日期: '2026-08-01',
    发现问题: '旧问题A',
    整改措施: '旧措施A',
    复查结果: '旧系统历史结论，不能丢',
    安全状态: '待整改',
  },
]
const localStorage = (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window.localStorage
localStorage.setItem('airport-ground-handling:entries', JSON.stringify({ apron_safety: legacyRows }))

// 2) 首次读取触发迁移
const apron = store.listRows('apron_safety')
const migrated = apron.find((r) => r.id === 101)!
assert.ok(migrated, '存量记录应被迁移保留')
assert.strictEqual(migrated['巡查区域'], '未分区', '缺区域归属应补为未分区')
assert.strictEqual(migrated['复查结果'], '旧系统历史结论，不能丢', '历史复查结论必须原样保留')
assert.strictEqual(migrated['__revision'], 0, '迁移补初始版本号')
assert.strictEqual(migrated['发现问题'], '旧问题A')

// 3) 迁移后写回的结构带版本号
const raw = JSON.parse(localStorage.getItem('airport-ground-handling:entries')!)
assert.strictEqual(raw.version, 2, '存储结构升级到带版本号')
assert.ok(raw.entries && Array.isArray(raw.entries.apron_safety), '迁移后为 {version, entries} 结构')

// 4) 其他模块在迁移合并后仍可用种子数据
assert.ok(store.listRows('stand').length > 0, '其他模块回落到种子数据')

console.log('  ✓ 旧版裸结构可读取并升级为带版本结构')
console.log('  ✓ 缺区域存量记录补「未分区」')
console.log('  ✓ 历史复查结论原样保留不被覆盖')
console.log('  ✓ 迁移补 __revision=0，其他模块回落种子')
console.log('\n存储迁移全部通过')
