// 规则与迁移自检：用项目自带 esbuild 的 JS API 即时编译 .mts 后在 Node 中运行。
// 不依赖浏览器/DOM，用于校验机坪安全整改的同一份动作规则与存量迁移不变量。
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

const dir = mkdtempSync(join(tmpdir(), 'apron-checks-'))
const targets = [
  ['scripts/check-rules.mts', 'rules.mjs'],
  ['scripts/check-migration.mts', 'migration.mjs'],
]

try {
  for (const [entry, outfile] of targets) {
    await build({
      entryPoints: [entry],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: join(dir, outfile),
      logLevel: 'warning',
    })
    execFileSync(process.execPath, [join(dir, outfile)], { stdio: 'inherit' })
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
