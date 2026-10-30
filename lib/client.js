window.__ModuleLoader__.load({
  id: 'dsh-murasame-pet',
  factory(require) {
    const React = require('react')
    const { useEffect, useState } = React
    const BASE = '/dsh-murasame-pet'

    const CSS = `
      .dsh-pet-panel{display:flex;flex-direction:column;gap:10px;padding:4px 0;color:var(--fg,#dff8f6);font-size:13px}
      .dsh-pet-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .dsh-pet-panel button{cursor:pointer;border:1px solid rgba(110,225,235,.3);background:rgba(8,28,40,.9);color:inherit;border-radius:8px;padding:6px 10px;font:600 12px system-ui,"Microsoft YaHei",sans-serif}
      .dsh-pet-panel button:hover{background:rgba(20,78,92,.95);border-color:rgba(110,225,235,.7)}
      .dsh-pet-panel button.on{background:rgba(32,120,135,.9);border-color:rgba(150,240,245,.8)}
      .dsh-pet-muted{opacity:.65;font-size:11px;line-height:1.5}
      .dsh-pet-badge{font:11px ui-monospace,Consolas,monospace;opacity:.8}
    `

    function Panel({ subject }) {
      const pkg = subject?.pkg?.name || subject?.name
      const mine = pkg === 'dsh-murasame-pet'
      const [s, setS] = useState(null)
      const [busy, setBusy] = useState('')
      const [err, setErr] = useState('')

      const refresh = async () => {
        try {
          const r = await fetch(`${BASE}/state`, { cache: 'no-store' })
          setS(await r.json())
          setErr('')
        } catch (e) { setErr(String(e?.message || e)) }
      }

      useEffect(() => { if (mine) void refresh() }, [mine])
      if (!mine) return null

      const call = async (body, label) => {
        setBusy(label)
        try {
          const r = await fetch(`${BASE}/control`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
          const out = await r.json()
          if (out.state) setS(out.state)
          if (!out.ok) setErr(out.text || '操作失败')
          else setErr('')
        } catch (e) { setErr(String(e?.message || e)) }
        setBusy('')
      }

      const mode = s?.visibility || 'both'
      const scale = Number(s?.scale || 1)
      return React.createElement('section', { className: 'dsh-pet-panel' },
        React.createElement('div', { className: 'dsh-pet-row' },
          React.createElement('strong', null, '肥鱼 Live2D'),
          React.createElement('span', { className: 'dsh-pet-badge' }, s?.running ? 'RUNNING' : 'STOPPED'),
          React.createElement('button', { type: 'button', onClick: () => call({ action: s?.running ? 'stop' : 'start' }, 'run') },
            busy === 'run' ? '…' : (s?.running ? '停止肥鱼' : '启动肥鱼')),
          React.createElement('button', { type: 'button', onClick: refresh }, '刷新'),
        ),
        React.createElement('div', { className: 'dsh-pet-row' },
          ['both', 'text', 'character', 'none'].map((m) => React.createElement('button', {
            key: m, type: 'button', className: mode === m ? 'on' : '',
            onClick: () => call({ visibility: m }, m),
          }, m === 'both' ? '人物+文字' : m === 'text' ? '仅文字' : m === 'character' ? '仅人物' : '全部隐藏')),
        ),
        React.createElement('div', { className: 'dsh-pet-row' },
          React.createElement('span', null, `文字比例 ${scale.toFixed(2)}×`),
          React.createElement('button', { type: 'button', onClick: () => call({ scale: Math.max(0.7, scale - 0.1) }, 's-') }, '−'),
          React.createElement('button', { type: 'button', onClick: () => call({ scale: Math.min(1.6, scale + 0.1) }, 's+') }, '+'),
          React.createElement('button', { type: 'button', onClick: () => call({ scale: 1 }, 's1') }, '重置'),
        ),
        React.createElement('p', { className: 'dsh-pet-muted' },
          s?.appRoot ? `应用：${s.appRoot}` : '未找到 MurasamePetLite.exe：设置 MURASAMEPET_HOME，或把 release/MurasamePetLite 复制到 ~/.dsh/murasame-pet。'),
        err ? React.createElement('p', { className: 'dsh-pet-muted' }, err) : null,
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style')
          style.dataset.plugin = 'dsh-murasame-pet'
          style.textContent = CSS
          document.head.append(style)
          return () => style.remove()
        }, 'dsh-murasame-pet: styles')
        ctx.slots.inject('plugins.detail.section', () => ctx.slots.register({
          name: 'plugins.detail.section',
          id: 'dsh-murasame-pet',
        }, (props) => React.createElement(Panel, props)))
      },
    }
  },
})
