/**
 * Client half of dsh-calorie-dock —— 右侧栏的「卡路里日记」tab。
 *
 * 纯 DOM。记录真相在宿主，2 秒轮询。
 * 输入食物名时向 /dsh-calorie/foods 要建议，选中的那条会带出 kcal/100g。
 * ⚠️ 整个模块包在 IIFE 里（DSH 把客户端插件拼成一个脚本，顶层 const 会撞名）。
 */

;(() => {
const TAB_KIND = 'calorie'
const TAB_ID = 'dsh-calorie-dock:calorie'
const ROUTE_STATE = '/dsh-calorie/state'
const ROUTE_FOODS = '/dsh-calorie/foods'

window.__ModuleLoader__.load({
  id: 'dsh-calorie-dock',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const C = {
      bg: 'var(--dsw-alias-bg-base)',
      border: 'var(--dsw-alias-border-l1)',
      text: 'var(--dsw-alias-label-primary)',
      dim: 'var(--dsw-alias-label-secondary)',
      accent: 'var(--dsw-alias-brand-primary, #5a7cff)',
      warn: '#ffb020',
      over: '#ff5a4d',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    }

    function pad(n) {
      return String(n).padStart(2, '0')
    }

    function todayKey() {
      const d = new Date()
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    }

    function guessMeal() {
      const hour = new Date().getHours()
      return hour < 10 ? '早餐' : hour < 15 ? '午餐' : hour < 21 ? '晚餐' : '加餐'
    }

    function CaloriePanel() {
      const [entries, setEntries] = React.useState([])
      const [goal, setGoal] = React.useState(1800)
      const [meals, setMeals] = React.useState(['早餐', '午餐', '晚餐', '加餐'])
      const [trend, setTrend] = React.useState([])
      const [meal, setMeal] = React.useState(guessMeal)
      const [food, setFood] = React.useState('')
      const [grams, setGrams] = React.useState('100')
      const [suggest, setSuggest] = React.useState([])
      const [busy, setBusy] = React.useState(false)
      const revisionRef = React.useRef(-1)

      const pushState = React.useCallback((patch) => {
        fetch(ROUTE_STATE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        }).catch(() => {})
      }, [])

      const pull = React.useCallback(() => {
        setBusy(true)
        return fetch(ROUTE_STATE)
          .then((response) => response.json())
          .then((payload) => {
            if (!payload || !payload.ok) return
            const state = payload.state || {}
            revisionRef.current = state.revision || 0
            setEntries(state.entries || [])
            setTrend(payload.trend || [])
            if (Number(state.goal) > 0) setGoal(Number(state.goal))
            else if (payload.dailyGoal) setGoal(payload.dailyGoal)
            if (Array.isArray(payload.meals)) setMeals(payload.meals)
          })
          .catch(() => {})
          .finally(() => setBusy(false))
      }, [])

      React.useEffect(() => {
        pull()
        const timer = setInterval(() => {
          fetch(ROUTE_STATE)
            .then((response) => response.json())
            .then((payload) => {
              if (!payload || !payload.ok) return
              const state = payload.state || {}
              if ((state.revision || 0) !== revisionRef.current) {
                revisionRef.current = state.revision || 0
                setEntries(state.entries || [])
                setTrend(payload.trend || [])
              }
            })
            .catch(() => {})
        }, 2000)
        return () => clearInterval(timer)
      }, [pull])

      // 食物名输入 → 拉建议
      React.useEffect(() => {
        if (!food.trim()) {
          setSuggest([])
          return undefined
        }
        let cancelled = false
        const timer = setTimeout(() => {
          fetch(`${ROUTE_FOODS}?q=${encodeURIComponent(food.trim())}&limit=6`)
            .then((response) => response.json())
            .then((payload) => {
              if (!cancelled && payload && payload.ok) setSuggest(payload.foods || [])
            })
            .catch(() => {})
        }, 200)
        return () => {
          cancelled = true
          clearTimeout(timer)
        }
      }, [food])

      const today = todayKey()
      const dayEntries = React.useMemo(
        () => entries.filter((entry) => entry.date === today),
        [entries, today],
      )
      const total = dayEntries.reduce((sum, entry) => sum + (Number(entry.kcal) || 0), 0)
      const percent = goal ? Math.min(150, Math.round((total / goal) * 100)) : 0

      const add = () => {
        const name = food.trim()
        const g = Number(grams)
        if (!name || !Number.isFinite(g) || g <= 0) return
        const hit = suggest.find((row) => row.name === name)
        const per100 = hit ? hit.kcalPer100g : null
        if (per100 == null) return
        const entry = {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          date: today,
          meal,
          food: name,
          grams: Math.round(g),
          kcal: Math.round((per100 * g) / 100),
        }
        const next = [entry, ...entries]
        setEntries(next)
        setFood('')
        setSuggest([])
        pushState({ entries: next })
      }

      const remove = (entry) => {
        const next = entries.filter((item) => item.id !== entry.id)
        setEntries(next)
        pushState({ entries: next })
      }

      const maxTrend = Math.max(goal, ...trend.map((row) => row.total), 1)
      const picked = suggest.find((row) => row.name === food.trim())
      const previewKcal = picked && Number(grams) > 0 ? Math.round((picked.kcalPer100g * Number(grams)) / 100) : null

      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, color: C.text } },
        // 顶栏 + 今日进度
        h(
          'div',
          { style: { padding: '9px 12px', borderBottom: `1px solid ${C.border}` } },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'baseline', gap: 7, fontSize: 12 } },
            h('span', { style: { fontWeight: 600 } }, '🔥 卡路里'),
            h('span', { style: { fontFamily: C.mono, fontSize: 13, color: total > goal ? C.over : C.text } }, `${total}`),
            h('span', { style: { fontFamily: C.mono, fontSize: 10.5, color: C.dim } }, `/ ${goal} kcal`),
            h(
              'span',
              { style: { marginLeft: 'auto', fontFamily: C.mono, fontSize: 10.5, color: total > goal ? C.over : C.dim } },
              `${percent}%`,
            ),
            h('button', { type: 'button', onClick: pull, title: '刷新', style: btn() }, busy ? '…' : '⟳'),
          ),
          h(
            'div',
            { style: { marginTop: 6, height: 5, borderRadius: 5, background: `color-mix(in srgb, ${C.accent} 16%, transparent)`, overflow: 'hidden' } },
            h('div', {
              style: {
                height: '100%',
                width: `${Math.min(100, percent)}%`,
                borderRadius: 5,
                background: total > goal ? C.over : percent > 85 ? C.warn : C.accent,
              },
            }),
          ),
        ),
        // 记一餐
        h(
          'div',
          { style: { padding: '8px 10px', borderBottom: `1px solid ${C.border}`, position: 'relative' } },
          h(
            'div',
            { style: { display: 'flex', gap: 4, marginBottom: 6 } },
            meals.map((name) =>
              h(
                'span',
                {
                  key: name,
                  onClick: () => setMeal(name),
                  style: {
                    fontSize: 10.5,
                    padding: '2px 7px',
                    borderRadius: 5,
                    cursor: 'pointer',
                    border: `1px solid ${C.border}`,
                    color: meal === name ? C.text : C.dim,
                    background: meal === name ? `color-mix(in srgb, ${C.accent} 22%, transparent)` : 'transparent',
                  },
                },
                name,
              ),
            ),
          ),
          h(
            'div',
            { style: { display: 'flex', gap: 6 } },
            h('input', {
              value: food,
              onChange: (event) => setFood(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') add()
              },
              placeholder: '食物（如 米饭）',
              style: { flex: '1 1 auto', minWidth: 0, ...input() },
            }),
            h('input', {
              value: grams,
              onChange: (event) => setGrams(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') add()
              },
              placeholder: '克',
              style: { width: 48, flex: 'none', ...input(), fontFamily: C.mono },
            }),
            h('button', { type: 'button', onClick: add, style: { ...btn(), padding: '2px 9px', flex: 'none' } }, '记'),
          ),
          picked
            ? h(
                'div',
                { style: { marginTop: 4, fontSize: 10.5, color: C.dim, fontFamily: C.mono } },
                `${picked.name} · ${picked.kcalPer100g} kcal/100g${previewKcal != null ? ` → ${previewKcal} kcal` : ''}`,
              )
            : suggest.length
              ? h(
                  'div',
                  { style: { marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 } },
                  suggest.map((row) =>
                    h(
                      'span',
                      {
                        key: row.name,
                        onClick: () => setFood(row.name),
                        style: { fontSize: 10.5, padding: '1px 6px', borderRadius: 5, cursor: 'pointer', color: C.dim, border: `1px solid ${C.border}` },
                      },
                      `${row.name} ${row.kcalPer100g}`,
                    ),
                  ),
                )
              : null,
        ),
        // 今日明细 + 7 天趋势
        h(
          'div',
          { style: { flex: '1 1 auto', minHeight: 0, display: 'flex' } },
          h(
            'div',
            { style: { flex: '1 1 auto', minWidth: 0, overflow: 'auto', padding: '4px 6px 12px' } },
            meals.map((name) => {
              const rows = dayEntries.filter((entry) => entry.meal === name)
              if (!rows.length) return null
              return h(
                'div',
                { key: name, style: { marginBottom: 4 } },
                h(
                  'div',
                  { style: { padding: '2px 6px', fontSize: 10, color: C.dim, fontFamily: C.mono } },
                  `${name}  ${rows.reduce((sum, entry) => sum + (Number(entry.kcal) || 0), 0)} kcal`,
                ),
                rows.map((entry) =>
                  h(
                    'div',
                    { key: entry.id, style: { display: 'flex', alignItems: 'baseline', gap: 6, padding: '3px 6px', borderRadius: 6, fontSize: 12 } },
                    h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, entry.food),
                    h('span', { style: { fontFamily: C.mono, fontSize: 10, color: C.dim, flex: 'none' } }, entry.grams ? `${entry.grams}g` : ''),
                    h('span', { style: { marginLeft: 'auto', fontFamily: C.mono, flex: 'none' } }, `${entry.kcal}`),
                    h('span', { onClick: () => remove(entry), title: '删除', style: { cursor: 'pointer', color: C.dim, flex: 'none' } }, '✕'),
                  ),
                ),
              )
            }),
            dayEntries.length ? null : h('div', { style: { padding: 12, fontSize: 11.5, color: C.dim } }, '今天还没记'),
          ),
          h(
            'div',
            { style: { width: 148, flex: 'none', borderLeft: `1px solid ${C.border}`, padding: '6px 8px', overflow: 'auto' } },
            h('div', { style: { fontSize: 10.5, color: C.dim, marginBottom: 5 } }, '近 7 天'),
            trend.map((row) =>
              h(
                'div',
                { key: row.date, style: { marginBottom: 4 } },
                h(
                  'div',
                  { style: { display: 'flex', fontSize: 10, fontFamily: C.mono, color: row.date === today ? C.text : C.dim } },
                  h('span', null, row.date.slice(5)),
                  h('span', { style: { marginLeft: 'auto' } }, row.total || ''),
                ),
                h(
                  'div',
                  { style: { height: 3, borderRadius: 3, marginTop: 2, background: `color-mix(in srgb, ${C.accent} 14%, transparent)` } },
                  h('div', {
                    style: {
                      height: '100%',
                      width: `${Math.max(2, Math.round((row.total / maxTrend) * 100))}%`,
                      borderRadius: 3,
                      background: row.total > goal ? C.over : C.accent,
                    },
                  }),
                ),
              ),
            ),
          ),
        ),
      )
    }

    function btn() {
      return {
        border: `1px solid ${C.border}`,
        background: 'transparent',
        color: C.text,
        borderRadius: 6,
        fontSize: 12,
        padding: '1px 6px',
        cursor: 'pointer',
      }
    }

    function input() {
      return {
        background: 'transparent',
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        color: C.text,
        fontSize: 11.5,
        padding: '3px 6px',
        outline: 'none',
      }
    }

    function CalorieBody() {
      return h(CaloriePanel)
    }

    function CalorieTitle() {
      return h(
        'span',
        { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
        h('span', { 'aria-hidden': 'true' }, '🔥'),
        h('span', null, '卡路里'),
      )
    }

    const inject = ['slots', 'sidebarRightTabs']

    function apply(ctx) {
      ctx.inject(['sidebarRightTabs'], (scoped) => {
        scoped.sidebarRightTabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          priority: 'extension',
          title: () => '卡路里',
          guide: [
            {
              id: TAB_KIND,
              kind: TAB_KIND,
              order: 100,
              title: () => '卡路里日记',
              description: () => '记一餐 · 今日合计 · 近 7 天',
              icon: () => h('span', { style: { fontSize: 16 } }, '🔥'),
            },
          ],
        })
      })
      ctx.inject(['slots'], (scoped) => {
        scoped.slots.inject('sidebar.right.pane.tab', () =>
          scoped.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, CalorieBody),
        )
        scoped.slots.inject('sidebar.right.pane.tab.title', () =>
          scoped.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID }, CalorieTitle),
        )
      })
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
})()
