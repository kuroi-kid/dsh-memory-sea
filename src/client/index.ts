/**
 * ⚠️ 真源是 lib/client.js（手写 `window.__ModuleLoader__` bundle，无构建步骤）。
 * 本文件是旧草稿，只作类型/思路参考：不要以它为准，也不要 build:client 覆盖 lib/client.js。
 *
 * 现行形态（见 lib/client.js）：
 *   · 右侧栏 tab   sidebarRightTabs.register({ id, kind:'memory-sea', title, guide }) + slots.register({ name:'sidebar.right.pane.tab', key })
 *   · 左栏入口     slots.register({ name:'sidebar.footer.action', id:'memory-sea-open' }) → ctx.get('sidebarRight').openTab('memory-sea')
 *   · 会话视图 tab slots.register({ name:'conversation.view', id:'memory-sea-view' })
 *   · 数据面       /@dsh-external/dsh-memory-sea/api/{status,recent,recall,config,run}
 */
import type { SlotsService } from '@deepseek-ai/dsh-client-ui-slots'

type ClientContext = { slots: SlotsService }

export const inject = ['slots']

const API = '/@dsh-external/dsh-memory-sea/api'

const TIERS: [string, string][] = [
  ['identity', '人格/关系'],
  ['decision', '决策/约定'],
  ['preference', '偏好'],
  ['fact', '关于他的事实'],
  ['event', '一次性事件'],
]

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.slots.inject('conversation.view', () =>
    ctx.slots.register({
      name: 'conversation.view',
      id: '@dsh-external/dsh-memory-sea-panel',
      label: () => '记忆海',
      component: () => ({
        render() {
          const root = document.createElement('div')
          root.style.cssText = 'padding:12px 14px;font:13px/1.6 ui-monospace,Consolas,monospace;color:#d6d6d6;height:100%;overflow:auto'

          const title = document.createElement('div')
          title.textContent = '🌊 记忆海 · 大肥鱼中枢'
          title.style.cssText = 'font-size:15px;margin-bottom:8px;color:#8ecbff'
          root.appendChild(title)

          const stat = document.createElement('div')
          stat.style.cssText = 'margin-bottom:10px;color:#9ad'
          root.appendChild(stat)

          const form = document.createElement('div')
          root.appendChild(form)

          const inputs: Record<string, HTMLInputElement> = {}
          for (const [tier, label] of TIERS) {
            const row = document.createElement('label')
            row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:4px 0'
            const span = document.createElement('span')
            span.textContent = label
            span.style.cssText = 'width:110px;color:#bbb'
            const input = document.createElement('input')
            input.type = 'number'
            input.step = '1'
            input.style.cssText = 'width:90px;background:#1b1b1f;color:#eee;border:1px solid #333;border-radius:4px;padding:2px 6px'
            inputs[tier] = input
            row.appendChild(span)
            row.appendChild(input)
            row.appendChild(document.createTextNode('天'))
            form.appendChild(row)
          }

          const row2 = document.createElement('div')
          row2.style.cssText = 'display:flex;gap:14px;margin:10px 0'
          for (const [key, label] of [['hit_keep', '唤醒门槛'], ['soft_energy', '轻提门槛']] as const) {
            const l = document.createElement('label')
            l.style.cssText = 'display:flex;align-items:center;gap:6px;color:#bbb'
            l.textContent = label
            const i = document.createElement('input')
            i.type = 'number'
            i.step = '0.05'
            i.style.cssText = 'width:70px;background:#1b1b1f;color:#eee;border:1px solid #333;border-radius:4px;padding:2px 6px'
            inputs[key] = i
            l.appendChild(i)
            row2.appendChild(l)
          }
          form.appendChild(row2)

          const btns = document.createElement('div')
          btns.style.cssText = 'display:flex;gap:8px;margin:10px 0'
          const mkBtn = (text: string, fn: () => void) => {
            const b = document.createElement('button')
            b.textContent = text
            b.style.cssText = 'background:#23252b;color:#cfe3ff;border:1px solid #3a3f4a;border-radius:5px;padding:4px 10px;cursor:pointer'
            b.onclick = fn
            btns.appendChild(b)
            return b
          }
          root.appendChild(btns)

          const msg = document.createElement('div')
          msg.style.cssText = 'color:#8fbf8f;margin-top:6px;white-space:pre-wrap'
          root.appendChild(msg)

          const log = document.createElement('pre')
          log.style.cssText = 'white-space:pre-wrap;color:#999;margin-top:10px;font-size:12px;max-height:50vh;overflow:auto'
          root.appendChild(log)

          let starUrl = 'http://127.0.0.1:4173'

          const load = async () => {
            try {
              const r = await fetch(`${API}/status`)
              const d = await r.json()
              const c = d.config || {}
              for (const [tier] of TIERS) inputs[tier].value = String(c.halflife?.[tier] ?? '')
              inputs.hit_keep.value = String(c.hit_keep ?? '')
              inputs.soft_energy.value = String(c.soft_energy ?? '')
              starUrl = d.starUrl || starUrl
              stat.textContent = `长期记忆 ${d.longTerm ?? '?'} 条 · ${d.index || ''} · 参数 v${c.version ?? 1}`
              log.textContent = d.status || ''
            } catch (e) {
              msg.textContent = '读取失败：' + String(e)
            }
          }

          mkBtn('保存参数', async () => {
            const body: any = { halflife: {} }
            for (const [tier] of TIERS) body.halflife[tier] = Number(inputs[tier].value)
            body.hit_keep = Number(inputs.hit_keep.value)
            body.soft_energy = Number(inputs.soft_energy.value)
            try {
              const r = await fetch(`${API}/config`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
              const d = await r.json()
              msg.textContent = d.ok
                ? '已保存' + (d.notes?.length ? '\n夹紧：' + d.notes.join('；') : '\n下次运行生效')
                : '失败：' + (d.error || '')
              await load()
            } catch (e) {
              msg.textContent = '保存失败：' + String(e)
            }
          })

          mkBtn('跑一次', async () => {
            try {
              await fetch(`${API}/run`, { method: 'POST' })
              msg.textContent = '已在后台跑 mem_nightly（情绪→衰减→星图→自调→体检），约 1 分钟后刷新'
            } catch (e) {
              msg.textContent = '启动失败：' + String(e)
            }
          })

          mkBtn('打开星图', () => { window.open(starUrl, '_blank') })
          mkBtn('刷新', () => load())

          void load()

          return root
        },
      }),
    }),
  ), '@dsh-external/dsh-memory-sea: panel')
}
