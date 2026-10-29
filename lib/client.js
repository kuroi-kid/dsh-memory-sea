window.__ModuleLoader__.load({
  id: '@dsh-external/dsh-memory-sea',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const API = '/@dsh-external/dsh-memory-sea/api'
    const KIND = 'memory-sea'
    const TAB_ID = '@dsh-external/dsh-memory-sea/panel'
    const TIERS = [
      ['identity', '人格 / 关系', 180],
      ['decision', '决策 / 约定', 90],
      ['preference', '偏好', 45],
      ['fact', '关于他的事实', 30],
      ['event', '一次性事件', 10],
    ]

    const C = {
      text: 'var(--dsw-alias-label-primary)',
      dim: 'var(--dsw-alias-label-secondary)',
      faint: 'var(--dsw-alias-label-tertiary)',
      border: 'var(--dsw-alias-border-l1)',
      border2: 'var(--dsw-alias-border-l2)',
      card: 'var(--dsw-alias-bg-layer-1)',
      layer2: 'var(--dsw-alias-bg-layer-2)',
      brand: 'var(--dsw-alias-brand-primary)',
      ok: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      err: 'var(--dsw-alias-state-error-primary)',
    }

    async function api(path, init) {
      const res = await fetch(API + path, init)
      return res.json()
    }

    // ── 右侧栏控制器（打开本 tab 用；服务晚于 apply 就绪时由轮询拿到）──────────
    let rightCtrl = null

    function openTab() {
      try {
        if (rightCtrl && typeof rightCtrl.openTab === 'function') {
          rightCtrl.openTab(KIND)
          return true
        }
      } catch { /* 落到下面的兜底 */ }
      return false
    }

    // ── 图标：两道海波（一片海的意思，小尺寸最干净）──────────────────────────
    const WAVE_PATHS = [
      'M2 8.5c3.3-3.3 6.6-3.3 9.9 0 3.3 3.3 6.6 3.3 9.9 0',
      'M2 15.5c3.3-3.3 6.6-3.3 9.9 0 3.3 3.3 6.6 3.3 9.9 0',
    ]

    function WhaleLogo(props) {
      const size = (props && props.size) || 18
      const sw = size >= 40 ? 1.35 : size >= 26 ? 1.6 : 1.8
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size,
        fill: 'none', stroke: 'currentColor',
        strokeWidth: sw, strokeLinecap: 'round',
        'aria-hidden': true,
        style: { display: 'block', flex: '0 0 auto' },
      }, WAVE_PATHS.map((d, i) => h('path', { key: i, d })))
    }

    // ── 基础件 ─────────────────────────────────────────────────────────────
    function Section(props) {
      return h('div', {
        style: {
          border: '1px solid ' + C.border, borderRadius: 10, background: C.card,
          padding: '10px 12px', marginBottom: 10,
        },
      },
      props.title
        ? h('div', { style: { fontSize: 11, letterSpacing: 1, color: C.faint, marginBottom: 8 } }, props.title)
        : null,
      props.children)
    }

    function Btn(props) {
      return h('button', {
        type: 'button',
        onClick: props.onClick,
        disabled: !!props.disabled,
        title: props.title || undefined,
        style: {
          background: props.primary ? C.brand : C.layer2,
          color: props.primary ? '#fff' : C.text,
          border: '1px solid ' + (props.primary ? C.brand : C.border2),
          borderRadius: 7, padding: '4px 10px', fontSize: 12,
          cursor: props.disabled ? 'default' : 'pointer',
          opacity: props.disabled ? 0.5 : 1, whiteSpace: 'nowrap',
        },
      }, props.children)
    }

    function NumField(props) {
      return h('input', {
        type: 'number', step: props.step || '1', value: props.value,
        onChange: (e) => props.onChange(e.target.value),
        style: {
          width: props.width || 74, background: C.layer2, color: C.text,
          border: '1px solid ' + C.border2, borderRadius: 6,
          padding: '3px 7px', fontSize: 12, fontFamily: 'inherit',
        },
      })
    }

    function Row(props) {
      return h('div', {
        style: { display: 'flex', alignItems: 'center', gap: 8, margin: '5px 0' },
      },
      h('span', { style: { flex: '1 1 auto', color: C.dim, fontSize: 12 } }, props.label),
      props.children)
    }

    // ── 主面板 ─────────────────────────────────────────────────────────────
    function Panel() {
      const [status, setStatus] = React.useState(null)
      const [form, setForm] = React.useState(null)
      const [err, setErr] = React.useState('')
      const [msg, setMsg] = React.useState('')
      const [recent, setRecent] = React.useState([])
      const [total, setTotal] = React.useState(null)
      const [q, setQ] = React.useState('')
      const [hits, setHits] = React.useState(null)
      const [busy, setBusy] = React.useState('')

      const load = React.useCallback(async () => {
        try {
          const d = await api('/status')
          setStatus(d)
          const c = d.config || {}
          setForm({
            halflife: { ...(c.halflife || {}) },
            hit_keep: c.hit_keep,
            soft_energy: c.soft_energy,
          })
          setErr('')
          const r = await api('/recent?n=12')
          setRecent(r.items || [])
          setTotal(typeof r.total === 'number' ? r.total : null)
          if (r.error) setErr('最近记忆读取失败：' + r.error)
        } catch (e) {
          setErr('读取失败：' + String((e && e.message) || e))
        }
      }, [])

      React.useEffect(() => { load() }, [])

      const setHalf = (tier, value) => {
        setForm((f) => (f ? { ...f, halflife: { ...f.halflife, [tier]: value } } : f))
      }

      const save = async () => {
        if (!form) return
        setBusy('save')
        try {
          const body = { halflife: {}, hit_keep: Number(form.hit_keep), soft_energy: Number(form.soft_energy) }
          for (const [tier] of TIERS) body.halflife[tier] = Number(form.halflife[tier])
          const d = await api('/config', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
          })
          setMsg(d.ok
            ? '已保存 · 版本 v' + ((d.config && d.config.version) || '?')
              + (d.notes && d.notes.length ? '\n夹紧：' + d.notes.join('；') : '\n下次运行生效')
            : '保存失败：' + (d.error || ''))
          await load()
        } catch (e) {
          setMsg('保存失败：' + String((e && e.message) || e))
        }
        setBusy('')
      }

      const runOnce = async () => {
        setBusy('run')
        try {
          const d = await api('/run', { method: 'POST' })
          setMsg(d.ok
            ? '已在后台跑 mem_nightly（情绪→衰减→星图→自调→体检），约 1 分钟后点「刷新」'
            : '启动失败：' + (d.error || ''))
        } catch (e) {
          setMsg('启动失败：' + String((e && e.message) || e))
        }
        setBusy('')
      }

      const search = async () => {
        const query = q.trim()
        if (!query) return
        setBusy('search')
        setHits(null)
        try {
          const d = await api('/recall?q=' + encodeURIComponent(query) + '&items=5')
          setHits(d.error ? { error: d.error } : { items: d.items || [], chars: d.chars })
        } catch (e) {
          setHits({ error: String((e && e.message) || e) })
        }
        setBusy('')
      }

      const starUrl = (status && status.starUrl) || 'http://127.0.0.1:4173'
      const cfg = (status && status.config) || {}

      const head = h('div', {
        style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, color: C.brand },
      },
      h(WhaleLogo, { size: 44 }),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.2 } },
        h('div', { style: { fontSize: 16, fontWeight: 600, color: C.text, letterSpacing: 0.3 } }, '记忆海'),
        h('div', { style: { fontSize: 11, color: C.faint } }, '长期记忆 · 参数与检索')),
      h('div', { style: { fontSize: 11, color: C.faint, marginLeft: 'auto' } }, '大肥鱼中枢'))

      const statLine = h('div', { style: { fontSize: 12, color: C.dim, lineHeight: 1.7 } },
        h('div', {}, '长期记忆 ',
          h('b', { style: { color: C.text } }, String((status && status.longTerm) != null ? status.longTerm : (total != null ? total : '?'))),
          ' 条 · ', (status && status.index) || '索引状态未知'),
        h('div', { style: { color: C.faint, fontSize: 11 } },
          '参数 v' + (cfg.version || 1) + ' · hit_keep ' + (cfg.hit_keep != null ? cfg.hit_keep : '?')
            + ' · soft_energy ' + (cfg.soft_energy != null ? cfg.soft_energy : '?')))

      const searchBox = h('div', { style: { display: 'flex', gap: 6 } },
        h('input', {
          value: q, placeholder: '问一句，从海里捞记忆…',
          onChange: (e) => setQ(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter') search() },
          style: {
            flex: '1 1 auto', minWidth: 0, background: C.layer2, color: C.text,
            border: '1px solid ' + C.border2, borderRadius: 7,
            padding: '5px 8px', fontSize: 12, fontFamily: 'inherit',
          },
        }),
        h(Btn, { onClick: search, disabled: busy === 'search' || !q.trim() }, busy === 'search' ? '检索中' : '捞'))

      const hitList = hits
        ? (hits.error
            ? h('div', { style: { color: C.err, fontSize: 12, marginTop: 8, whiteSpace: 'pre-wrap' } }, hits.error)
            : h('div', { style: { marginTop: 8 } },
                (hits.items || []).length === 0
                  ? h('div', { style: { color: C.faint, fontSize: 12 } }, '没捞到（海里没有相关的）')
                  : (hits.items || []).map((it, i) => h('div', {
                      key: i,
                      style: {
                        borderTop: i ? '1px solid ' + C.border : 'none',
                        padding: '7px 0 6px',
                      },
                    },
                    h('div', { style: { fontSize: 11, color: C.faint, marginBottom: 3 } },
                      '[' + (it.tier || 'event') + '] ',
                      'score ' + (it.score != null ? it.score : '?'),
                      it.energy != null ? ' · 能量 ' + it.energy : '',
                      it.date ? ' · ' + it.date : ''),
                    h('div', { style: { fontSize: 12, color: C.text, lineHeight: 1.6 } }, it.text)))))
        : null

      const paramRows = form
        ? TIERS.map(([tier, label]) => h(Row, { key: tier, label },
            h(NumField, {
              value: form.halflife[tier] != null ? form.halflife[tier] : '',
              onChange: (v) => setHalf(tier, v),
            }),
            h('span', { style: { fontSize: 11, color: C.faint } }, '天')))
        : h('div', { style: { fontSize: 12, color: C.faint } }, '读取中…')

      const thrRows = form
        ? [
            h(Row, { key: 'hit', label: '唤醒门槛' },
              h(NumField, { value: form.hit_keep != null ? form.hit_keep : '', step: '0.05', width: 66, onChange: (v) => setForm({ ...form, hit_keep: v }) })),
            h(Row, { key: 'soft', label: '轻提门槛' },
              h(NumField, { value: form.soft_energy != null ? form.soft_energy : '', step: '0.05', width: 66, onChange: (v) => setForm({ ...form, soft_energy: v }) })),
          ]
        : null

      const actions = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
        h(Btn, { onClick: save, disabled: busy === 'save' || !form, primary: true }, busy === 'save' ? '保存中' : '保存参数'),
        h(Btn, { onClick: runOnce, disabled: busy === 'run' }, busy === 'run' ? '启动中' : '跑一次'),
        h(Btn, { onClick: () => { try { window.open(starUrl, '_blank') } catch { /* ignore */ } } }, '打开星图'),
        h(Btn, { onClick: load }, '刷新'))

      const recentList = recent.length
        ? recent.map((it, i) => h('div', {
            key: i,
            style: { borderTop: i ? '1px solid ' + C.border : 'none', padding: '7px 0 6px' },
          },
          h('div', { style: { fontSize: 11, color: C.faint, marginBottom: 3 } },
            (it.when || it.date || '—') + ' · ' + (it.scope || 'mem') + (it.tier ? ' · ' + it.tier : '')),
          h('div', { style: { fontSize: 12, color: C.text, lineHeight: 1.6 } }, it.text)))
        : h('div', { style: { fontSize: 12, color: C.faint } }, '暂无')

      return h('div', {
        style: {
          height: '100%', overflow: 'auto', padding: '18px 20px 32px',
          color: C.text, fontSize: 13, lineHeight: 1.6,
          fontFamily: 'inherit', boxSizing: 'border-box',
          maxWidth: 880, margin: '0 auto',
        },
      },
      head,
      err ? h('div', { style: { color: C.err, fontSize: 12, marginBottom: 8, whiteSpace: 'pre-wrap' } }, err) : null,
      h(Section, null, statLine),
      h(Section, { title: '检索' }, searchBox, hitList),
      h(Section, { title: '半衰期（天）' }, paramRows, thrRows),
      h(Section, { title: '操作' }, actions,
        msg ? h('div', { style: { color: C.ok, fontSize: 11, marginTop: 8, whiteSpace: 'pre-wrap' } }, msg) : null),
      h(Section, { title: '最近记忆' },
        h('div', { style: { maxHeight: 320, overflow: 'auto' } }, recentList)))
    }

    // ── 左栏「全局面板」图标（宿主自己画按钮，点击切到主区域本面板）──────────
    // ownerProps: { size, active } —— 只负责画那颗方图标。
    class PanelIcon extends React.Component {
      render() {
        const size = (this.props && this.props.size) || 20
        const active = !!(this.props && this.props.active)
        return h('span', {
          style: {
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: size, height: size,
            color: active ? C.brand : 'currentColor',
          },
        }, h(WhaleLogo, { size }))
      }
    }

    // ── 左栏脚下的一颗入口（点开右侧栏的本 tab）────────────────────────────
    // 用 class 组件而不是 hooks：跨 bundle 的 React 实例挂不上 hooks 时，class 照样渲染。
    class Launcher extends React.Component {
      constructor(props) {
        super(props)
        this.state = { hover: false, ok: false }
        this.onClick = () => { this.setState({ ok: openTab() }) }
      }
      render() {
        const wide = !!(this.props && this.props.wide)
        const on = this.state.hover
        const label = this.state.ok ? '记忆海（已打开）' : '记忆海'
        return h('button', {
          type: 'button',
          title: '记忆海：状态 · 检索 · 半衰期 · 星图',
          onClick: this.onClick,
          onMouseEnter: () => this.setState({ hover: true }),
          onMouseLeave: () => this.setState({ hover: false }),
          style: {
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            gap: 6, width: wide ? 'auto' : 28, height: 28, padding: wide ? '0 8px' : 0,
            background: on ? C.layer2 : 'transparent',
            color: on ? C.text : C.dim,
            border: '1px solid ' + (on ? C.border2 : 'transparent'),
            borderRadius: 8, cursor: 'pointer', fontSize: 12,
            fontFamily: 'inherit', flex: '0 0 auto',
          },
        }, h(WhaleLogo, { size: 15 }), wide ? h('span', null, label) : null)
      }
    }

    // ── 会话标题栏右侧的工具入口（footer 被宿主裁掉时的第二落点）────────────
    class HeaderButton extends React.Component {
      constructor(props) {
        super(props)
        this.state = { ok: false }
        this.onClick = () => { this.setState({ ok: openTab() }) }
      }
      render() {
        return h('button', {
          type: 'button',
          title: '打开右侧栏「记忆海」',
          onClick: this.onClick,
          style: {
            display: 'inline-flex', alignItems: 'center', gap: 5,
            height: 26, padding: '0 8px', background: 'transparent',
            color: this.state.ok ? C.brand : C.dim,
            border: '1px solid ' + C.border, borderRadius: 7,
            cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', whiteSpace: 'nowrap',
          },
        }, h(WhaleLogo, { size: 14 }), h('span', null, '记忆海'))
      }
    }

    // ── apply ──────────────────────────────────────────────────────────────
    function apply(ctx) {
      // ① 右侧栏 tab：座位存在性即能力门（老宿主的座位不声明 → 只有 conversation.view 可用）
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => {
        let disposed = false
        let timer = 0
        let disposeTabs = null
        let disposeBody = null

        const cleanup = () => {
          disposed = true
          if (timer) { try { clearTimeout(timer) } catch { /* ignore */ } timer = 0 }
          try { if (disposeBody) disposeBody() } catch { /* ignore */ }
          try { if (disposeTabs) disposeTabs() } catch { /* ignore */ }
          disposeBody = null
          disposeTabs = null
          rightCtrl = null
        }

        const attempt = () => {
          if (disposed) return
          const tabs = typeof ctx.get === 'function' ? ctx.get('sidebarRightTabs') : null
          const ctrl = typeof ctx.get === 'function' ? ctx.get('sidebarRight') : null
          if (!tabs || typeof tabs.register !== 'function' || !ctrl || typeof ctrl.openTab !== 'function') {
            timer = setTimeout(attempt, 300)
            return
          }
          try {
            disposeTabs = tabs.register({
              id: TAB_ID,
              kind: KIND,
              keepMounted: true,
              title: () => '记忆海',
              guide: [{
                id: 'memory-sea',
                order: 120,
                title: () => '记忆海',
                description: () => '长期记忆：状态、语义检索、半衰期参数与星图入口',
                icon: WhaleLogo,
              }],
            })
            disposeBody = ctx.slots.register(
              { name: 'sidebar.right.pane.tab', key: TAB_ID },
              Panel,
            )
          } catch {
            try { if (disposeTabs) disposeTabs() } catch { /* ignore */ }
            try { if (disposeBody) disposeBody() } catch { /* ignore */ }
            disposeTabs = null
            disposeBody = null
            return
          }
          rightCtrl = ctrl
        }

        attempt()
        return cleanup
      }), '@dsh-external/dsh-memory-sea: right sidebar tab')

      // ② 左栏「全局面板」：图标进 sidebar.panellist，点它主区域切到 memory-sea（宿主自己画按钮）
      ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: 'memory-sea',
        order: 30,
        label: () => '记忆海',
      }, PanelIcon)), '@dsh-external/dsh-memory-sea: panellist icon')

      ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register(
        { name: 'main', key: 'memory-sea' },
        Panel,
      )), '@dsh-external/dsh-memory-sea: main panel')

      // ②b 左栏脚下的入口（宿主裁掉时也不影响上一处）
      ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'memory-sea-open',
        order: 5,
        label: () => '记忆海',
      }, Launcher)), '@dsh-external/dsh-memory-sea: footer launcher')

      // ②b 会话标题栏右侧的工具入口（footer 被宿主裁掉时还有这一颗）
      ctx.effect(() => ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
        name: 'conversation.session.header.utilities',
        id: 'memory-sea-header',
        order: 40,
        label: () => '记忆海',
      }, HeaderButton)), '@dsh-external/dsh-memory-sea: header launcher')

      // ③ 会话视图里的同名 tab（不依赖右侧栏服务，任何宿主都有）
      ctx.effect(() => ctx.slots.inject('conversation.view', () => ctx.slots.register({
        name: 'conversation.view',
        id: 'memory-sea-view',
        order: 20,
        label: () => '记忆海',
      }, Panel)), '@dsh-external/dsh-memory-sea: conversation view')
    }

    const inject = ['slots']

    return { inject, apply }
  },
});
