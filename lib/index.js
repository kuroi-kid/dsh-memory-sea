// @dsh-external/dsh-memory-sea — host side (hand-authored ESM, no build step)
import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'

const PAGE_HTML = `<!doctype html><html lang="zh"><meta charset="utf-8">
<title>记忆海 · 大肥鱼中枢</title>
<style>
body{background:#141416;color:#d6d6d6;font:14px/1.7 ui-monospace,Consolas,monospace;margin:0;padding:24px}
h1{font-size:18px;color:#8ecbff;margin:0 0 4px}
.sub{color:#888;margin-bottom:18px}
.row{display:flex;align-items:center;gap:8px;margin:6px 0}
.row span.k{width:120px;color:#bbb}
input{width:100px;background:#1b1b1f;color:#eee;border:1px solid #333;border-radius:5px;padding:3px 8px}
button{background:#23252b;color:#cfe3ff;border:1px solid #3a3f4a;border-radius:6px;padding:5px 12px;cursor:pointer;margin-right:8px}
button:hover{background:#2b2e36}
#msg{color:#8fbf8f;white-space:pre-wrap;margin:10px 0}
pre{white-space:pre-wrap;color:#999;background:#17171a;border:1px solid #26262b;border-radius:8px;padding:12px;max-height:52vh;overflow:auto}
</style>
<h1>🌊 记忆海 · 大肥鱼中枢</h1>
<div class="sub" id="stat">读取中…</div>
<div id="form"></div>
<div style="margin:14px 0">
  <button onclick="save()">保存参数</button>
  <button onclick="run()">跑一次</button>
  <button onclick="window.open('http://127.0.0.1:4173','_blank')">打开星图</button>
  <button onclick="load()">刷新</button>
</div>
<div id="msg"></div>
<pre id="log"></pre>
<script>
const API='/@dsh-external/dsh-memory-sea/api';
const TIERS=[['identity','人格/关系'],['decision','决策/约定'],['preference','偏好'],['fact','关于他的事实'],['event','一次性事件']];
const inputs={};
const form=document.getElementById('form');
for(const [k,label] of TIERS){
  const row=document.createElement('div'); row.className='row';
  const s=document.createElement('span'); s.className='k'; s.textContent=label;
  const i=document.createElement('input'); i.type='number'; i.step='1'; inputs[k]=i;
  row.append(s,i,document.createTextNode('天')); form.appendChild(row);
}
for(const [k,label] of [['hit_keep','唤醒门槛'],['soft_energy','轻提门槛']]){
  const row=document.createElement('div'); row.className='row';
  const s=document.createElement('span'); s.className='k'; s.textContent=label;
  const i=document.createElement('input'); i.type='number'; i.step='0.05'; inputs[k]=i;
  row.append(s,i); form.appendChild(row);
}
async function load(){
  try{
    const d=await (await fetch(API+'/status')).json(); const c=d.config||{};
    for(const [k] of TIERS) inputs[k].value=(c.halflife&&c.halflife[k])??'';
    inputs.hit_keep.value=c.hit_keep??''; inputs.soft_energy.value=c.soft_energy??'';
    document.getElementById('stat').textContent='长期记忆 '+(d.longTerm??'?')+' 条 · '+(d.index||'')+' · 参数 v'+(c.version??1);
    document.getElementById('log').textContent=d.status||'';
  }catch(e){ document.getElementById('msg').textContent='读取失败：'+e; }
}
async function save(){
  const body={halflife:{}}; for(const [k] of TIERS) body.halflife[k]=Number(inputs[k].value);
  body.hit_keep=Number(inputs.hit_keep.value); body.soft_energy=Number(inputs.soft_energy.value);
  const d=await (await fetch(API+'/config',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})).json();
  document.getElementById('msg').textContent=d.ok?('已保存'+((d.notes&&d.notes.length)?'\n夹紧：'+d.notes.join('；'):'\n下次运行生效')):('失败：'+(d.error||''));
  load();
}
async function run(){
  await fetch(API+'/run',{method:'POST'});
  document.getElementById('msg').textContent='已在后台跑 mem_nightly，约 1 分钟后点刷新';
}
load();
</script>
</html>`

export const name = '@dsh-external/dsh-memory-sea'
export const inject = ['tools', 'webServer']

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
const MEM_DIR = process.env.DSH_MEMORY_SEA_DIR || 'D:\\QQBot\\mem'
const PYTHON = process.env.DSH_MEMORY_SEA_PYTHON || 'D:\\QQBot\\SeedVC\\.venv\\Scripts\\python.exe'
const STAR_URL = process.env.DSH_MEMORY_SEA_STAR || 'http://127.0.0.1:4173'
const CFG_PATH = `${MEM_DIR}\\memory_config.json`
const STATUS_PATH = `${MEM_DIR}\\memory_status.md`

function sanitize(input) {
  const notes = []
  const cfg = { ...DEFAULTS, ...(input || {}) }
  const half = { ...DEFAULTS.halflife, ...((input && input.halflife) || {}) }
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
  for (const k of ['hit_keep', 'soft_energy', 'sim_merge']) {
    const base = DEFAULTS[k]
    let v = Number(cfg[k] ?? base)
    if (!Number.isFinite(v)) v = base
    const lo = base * (1 - CLAMP[k])
    const hi = base * (1 + CLAMP[k])
    if (v < lo || v > hi) {
      v = Math.min(Math.max(v, lo), hi)
      notes.push(`${k} 夹到 ${v.toFixed(2)}`)
    }
    cfg[k] = Number(v.toFixed(3))
  }
  return { cfg, notes }
}

async function readJson() {
  try {
    return JSON.parse((await readFile(CFG_PATH, 'utf8')).replace(/^\uFEFF/, ''))
  } catch {
    return { ...DEFAULTS }
  }
}

async function summary() {
  const cfg = await readJson()
  let status = ''
  try {
    status = await readFile(STATUS_PATH, 'utf8')
  } catch {
    status = '（还没跑过 mem_status，点「跑一次」生成）'
  }
  const m = status.match(/长期记忆 \*\*(\d+)\*\* 条/)
  const idx = /语义索引：(新鲜|已[^\n]*)/.exec(status)
  return { config: cfg, longTerm: m ? Number(m[1]) : null, index: idx ? idx[0] : '', status, starUrl: STAR_URL }
}

const LONG_PATH = `${MEM_DIR}\\longterm.jsonl`

/** 最近 N 条长期记忆（按 ts 倒序；文件本身是追加序，取尾部再排序）。 */
async function recent(n = 12) {
  const rows = []
  try {
    const text = await readFile(LONG_PATH, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim()
      if (!t) continue
      try { rows.push(JSON.parse(t)) } catch { /* 坏行跳过 */ }
    }
  } catch (err) {
    return { items: [], total: 0, error: String((err && err.message) || err) }
  }
  const items = rows
    .map((r) => ({
      ts: Number(r.ts || 0),
      scope: r.scope || '',
      tier: r.tier || '',
      importance: r.importance,
      text: String(r.text || r.summary || ''),
      date: r.date || '',
    }))
    .filter((r) => r.text)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, n)
    .map((r) => ({ ...r, when: r.ts ? new Date(r.ts * 1000).toISOString().slice(0, 10) : r.date }))
  return { items, total: rows.length }
}

/** 语义检索（走 mem_recall.py --json：相似度 × 能量，带预算装箱）。 */
function recall(query, items = 5) {
  return new Promise((resolve) => {
    const script = `${MEM_DIR}\\..\\tools\\mem_recall.py`
    let settled = false
    const done = (v) => { if (!settled) { settled = true; resolve(v) } }
    let child
    try {
      child = spawn(PYTHON, [script, query, '--json', '--items', String(items)], {
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      })
    } catch (e) {
      done({ query, items: [], error: String((e && e.message) || e) })
      return
    }
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* ignore */ }
      done({ query, items: [], error: '检索超时（30s）' })
    }, 30000)
    child.stdout.on('data', (c) => { out += c.toString('utf8') })
    child.stderr.on('data', (c) => { err += c.toString('utf8') })
    child.on('error', (e) => { clearTimeout(timer); done({ query, items: [], error: String((e && e.message) || e) }) })
    child.on('close', () => {
      clearTimeout(timer)
      try {
        const parsed = JSON.parse(out.slice(Math.max(out.indexOf('{'), 0)))
        done({
          query,
          chars: parsed.chars,
          items: (parsed.items || []).map((x) => ({
            text: x.text, tier: x.tier, score: x.score, energy: x.energy, date: x.date, source: x.source,
          })),
        })
      } catch (e) {
        done({ query, items: [], error: String(err || out || (e && e.message) || e).slice(0, 800) })
      }
    })
  })
}

export function apply(ctx, config = {}) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/@dsh-external/dsh-memory-sea/api',
    handler: async (req, res) => {
      const url = String(req.url || '')
      const send = (code, body) => {
        res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(body))
      }
      try {
        if (req.method === 'GET' && (url.endsWith('/page') || url.endsWith('/'))) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          res.end(PAGE_HTML)
          return
        }
        if (req.method === 'GET' && url.includes('/status')) {
          send(200, await summary())
          return
        }
        if (req.method === 'POST' && url.includes('/config')) {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
          const { cfg, notes } = sanitize(body)
          const current = await readJson()
          const next = { ...current, ...cfg, version: Number(current.version || 1) + 1, tuned_at: null }
          await writeFile(CFG_PATH, JSON.stringify(next, null, 2), 'utf8')
          send(200, { ok: true, notes, config: next })
          return
        }
        if (req.method === 'POST' && url.includes('/run')) {
          const script = `${MEM_DIR}\\..\\tools\\mem_nightly.py`
          const child = spawn(PYTHON, [script], { detached: true, stdio: 'ignore', windowsHide: true })
          child.unref()
          send(200, { ok: true, started: true })
          return
        }
        if (req.method === 'GET' && url.includes('/recent')) {
          const n = Number((/[?&]n=(\d+)/.exec(url) || [])[1] || 12)
          send(200, await recent(Math.min(Math.max(n || 12, 1), 50)))
          return
        }
        if (req.method === 'GET' && url.includes('/recall')) {
          const raw = ((/[?&]q=([^&]*)/.exec(url) || [])[1] || '').replace(/\+/g, ' ')
          const q = decodeURIComponent(raw)
          const items = Number((/[?&]items=(\d+)/.exec(url) || [])[1] || 5)
          if (!q.trim()) {
            send(400, { error: 'empty query' })
            return
          }
          send(200, await recall(q, Math.min(Math.max(items || 5, 1), 12)))
          return
        }
        send(404, { error: 'not found', url })
      } catch (err) {
        send(500, { error: String((err && err.message) || err) })
      }
    },
  }), '@dsh-external/dsh-memory-sea: api')

  ctx.effect(() => ctx.tools.register(defineStatusTool()), '@dsh-external/dsh-memory-sea: status tool')
  ctx.effect(() => ctx.tools.register(defineRecallTool()), '@dsh-external/dsh-memory-sea: recall tool')
}

function defineRecallTool() {
  return {
    name: 'memory_sea_recall',
    description: '记忆海 · 语义检索：按「相似度 × 能量」从长期记忆里捞 1–12 条（带 tier / score / 日期），久未提起的重要事不会沉底',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '自然语言问题，如「上次那个修插件的事」' },
        items: { type: 'number', description: '取几条，默认 5，最多 12' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    async execute(args) {
      const q = String((args && args.query) || '').trim()
      if (!q) return '查询为空'
      const n = Math.min(Math.max(Number((args && args.items) || 5) || 5, 1), 12)
      const r = await recall(q, n)
      if (r.error) return `检索失败：${r.error}`
      if (!r.items.length) return '没捞到（记忆海里没有相关的）'
      return r.items
        .map((x, i) => `${i + 1}. [${x.tier || 'event'} · ${x.score} · 能量${x.energy ?? '?'}] ${x.text}`)
        .join('\n')
    },
  }
}

function defineStatusTool() {
  return {
    name: 'memory_sea_status',
    description: '记忆海 · 大肥鱼中枢：看当前参数、长期记忆条数、索引新鲜度与体检摘要',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    async execute() {
      const s = await summary()
      const half = (s.config && s.config.halflife) || {}
      return [
        `长期记忆 ${s.longTerm ?? '?'} 条 · ${s.index || '索引状态未知'}`,
        '半衰期：' + Object.entries(half).map(([k, v]) => `${k} ${v}天`).join(' / '),
        `阈值：hit_keep ${s.config?.hit_keep ?? '?'} · soft_energy ${s.config?.soft_energy ?? '?'}`,
        `星图：${s.starUrl}`,
      ].join('\n')
    },
  }
}
