/**
 * ⚠️ 真源是 lib/index.js（手写 ESM，无构建步骤）。本文件仅作参考，别用 build 覆盖 lib/index.js。
 * lib/index.js 现行端点：/status · /config(POST) · /run(POST) · /recent?n= · /recall?q=&items=
 * 现行工具：memory_sea_status · memory_sea_recall
 *
 * @dsh-external/dsh-memory-sea — 记忆海 · 大肥鱼中枢（host 侧）
 *
 * 职责：
 *  · 读写 D:\QQBot\mem\memory_config.json（唯一参数入口）
 *  · 读 memory_status.md / decay_report.md 给面板展示
 *  · 触发一次 mem_nightly.py（后台无窗口）
 *  · 提供一个工具 memory_sea_status，让 agent 直接问"记忆海现在怎么样"
 */
import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'

export const name = '@dsh-external/dsh-memory-sea'
export const inject = ['tools', 'webServer']

export interface Config {
  memDir: string
  python: string
  starUrl: string
}

export const Config = z.object({
  memDir: z.string().default('D:\\QQBot\\mem'),
  python: z.string().default('D:\\QQBot\\SeedVC\\.venv\\Scripts\\python.exe'),
  starUrl: z.string().default('http://127.0.0.1:4173'),
})

const DEFAULTS = {
  halflife: { identity: 180, decision: 90, preference: 45, fact: 30, event: 10 },
  hit_keep: 0.45,
  soft_energy: 0.55,
  sim_merge: 0.9,
  emotion_boost: 0.15,
  review_bump: 0.35,
  budget_items: 3,
  budget_chars: 600,
}

const CLAMP = { halflife: 0.4, hit_keep: 0.3, soft_energy: 0.3, sim_merge: 0.1 }

function sanitize(input: any): { cfg: Record<string, any>; notes: string[] } {
  const notes: string[] = []
  const cfg: Record<string, any> = { ...DEFAULTS, ...(input || {}) }
  const half = { ...DEFAULTS.halflife, ...(input?.halflife || {}) }
  for (const [tier, base] of Object.entries(DEFAULTS.halflife)) {
    let v = Number(half[tier] ?? base)
    if (!Number.isFinite(v)) v = base
    const lo = base * (1 - CLAMP.halflife)
    const hi = base * (1 + CLAMP.halflife)
    if (v < lo || v > hi) {
      v = Math.min(Math.max(v, lo), hi)
      notes.push(`halflife.${tier} 夹到 ${v.toFixed(0)} 天（允许 ${lo.toFixed(0)}–${hi.toFixed(0)}）`)
    }
    half[tier] = Number(v.toFixed(1))
  }
  cfg.halflife = half
  for (const k of ['hit_keep', 'soft_energy', 'sim_merge'] as const) {
    const base = (DEFAULTS as any)[k]
    let v = Number(cfg[k] ?? base)
    if (!Number.isFinite(v)) v = base
    const lo = base * (1 - (CLAMP as any)[k])
    const hi = base * (1 + (CLAMP as any)[k])
    if (v < lo || v > hi) {
      v = Math.min(Math.max(v, lo), hi)
      notes.push(`${k} 夹到 ${v.toFixed(2)}`)
    }
    cfg[k] = Number(v.toFixed(3))
  }
  return { cfg, notes }
}

export function apply(ctx: Context, config: Config): void {
  const cfgPath = `${config.memDir}\\memory_config.json`
  const statusPath = `${config.memDir}\\memory_status.md`

  const readJson = async () => {
    try {
      return JSON.parse((await readFile(cfgPath, 'utf8')).replace(/^\uFEFF/, ''))
    } catch {
      return { ...DEFAULTS }
    }
  }

  const summary = async () => {
    const cfg = await readJson()
    let status = ''
    try {
      status = await readFile(statusPath, 'utf8')
    } catch {
      status = '（还没跑过 mem_status，点「跑一次」生成）'
    }
    const m = status.match(/长期记忆 \*\*(\d+)\*\* 条/)
    const idxFresh = /语义索引：(新鲜|已)/.exec(status)?.[0] ?? ''
    return {
      config: cfg,
      longTerm: m ? Number(m[1]) : null,
      index: idxFresh,
      status,
      starUrl: config.starUrl,
    }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/@dsh-external/dsh-memory-sea/api',
    handler: async (req: any, res: any) => {
      const url = String(req.url || '')
      const json = (code: number, body: unknown) => {
        res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(body))
      }
      try {
        if (req.method === 'GET' && url.includes('/status')) {
          json(200, await summary())
          return
        }
        if (req.method === 'POST' && url.includes('/config')) {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
          const { cfg, notes } = sanitize(body)
          const current = await readJson()
          const next = { ...current, ...cfg, version: Number(current.version || 1) + 1, tuned_at: null }
          await writeFile(cfgPath, JSON.stringify(next, null, 2), 'utf8')
          json(200, { ok: true, notes, config: next })
          return
        }
        if (req.method === 'POST' && url.includes('/run')) {
          const child = spawn(config.python, [`${config.memDir}\\..\\tools\\mem_nightly.py`], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
          })
          child.unref()
          json(200, { ok: true, started: true })
          return
        }
        json(404, { error: 'not found', url })
      } catch (err) {
        json(500, { error: String((err as Error)?.message || err) })
      }
    },
  }), '@dsh-external/dsh-memory-sea: api')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'memory_sea_status',
    description: '记忆海 · 大肥鱼中枢：看当前参数、记忆条数、索引新鲜度与体检摘要',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }],
    },
    async execute() {
      const s = await summary()
      const half = s.config?.halflife ?? {}
      const lines = [
        `长期记忆 ${s.longTerm ?? '?'} 条 · ${s.index || '索引状态未知'}`,
        `半衰期：` + Object.entries(half).map(([k, v]) => `${k} ${v}天`).join(' / '),
        `阈值：hit_keep ${s.config?.hit_keep ?? '?'} · soft_energy ${s.config?.soft_energy ?? '?'}`,
        `星图：${s.starUrl}`,
      ]
      return lines.join('\n')
    },
  })), '@dsh-external/dsh-memory-sea: status tool')
}
