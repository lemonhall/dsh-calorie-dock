/**
 * Host half of dsh-calorie-dock —— 卡路里日记的宿主半。
 *
 * 纯本地。每条记录把**算好的 kcal 存下来**（不只存克数）—— 这样以后调整食物表，
 * 历史记录不会跟着变形（记账、记热量这种"数值型日记"都该这么存）。
 */

import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createStateStore } from './state.js'
import { kcalFor, lookupFood, searchFoods, FOODS } from './foods.js'

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const DEFAULTS = {
  dailyGoal: 1800,
  trendDays: 7,
  meals: ['早餐', '午餐', '晚餐', '加餐'],
}

const ROUTE_STATE = '/dsh-calorie/state'

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const stateStore = createStateStore(join(DSH_HOME, 'dsh-calorie-dock', 'state.json'), {
  entries: [], // [{ id, date, meal, food, grams, kcal }]
  goal: null, // 用户改过的每日目标（null = 用配置里的）
  selectedDate: null,
  pendingQuestion: null,
})

function sendJson(res, status, payload) {
  try {
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
    })
    res.end(body)
  } catch {
    /* 连接已经断了 */
  }
}

export function dateKey(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now())
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 某天合计（并按餐次分组）。 */
export function dayTotal(entries, date) {
  const list = (entries || []).filter((entry) => entry.date === date)
  const byMeal = new Map()
  let total = 0
  for (const entry of list) {
    const kcal = Number(entry.kcal) || 0
    total += kcal
    const meal = entry.meal || '加餐'
    byMeal.set(meal, (byMeal.get(meal) || 0) + kcal)
  }
  return { date, total, count: list.length, byMeal: [...byMeal.entries()].map(([meal, kcal]) => ({ meal, kcal })), entries: list }
}

/** 最近 days 天每天合计（含今天，按日期升序）。 */
export function dailyTotals(entries, endDate, days) {
  const [y, m, d] = String(endDate).split('-').map(Number)
  const out = []
  for (let i = Math.max(0, days) - 1; i >= 0; i -= 1) {
    const date = new Date(y, (m || 1) - 1, d || 1)
    date.setDate(date.getDate() - i)
    const key = dateKey(date)
    out.push({ date: key, total: dayTotal(entries, key).total })
  }
  return out
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function sortEntries(entries) {
  const order = { 早餐: 0, 午餐: 1, 晚餐: 2, 加餐: 3 }
  return [...(entries || [])].sort((a, b) => {
    const byDate = String(b.date || '').localeCompare(String(a.date || ''))
    if (byDate !== 0) return byDate
    return (order[a.meal] ?? 9) - (order[b.meal] ?? 9)
  })
}

/** Host plugin body. */
function apply(ctx, config) {
  const cfg = config && typeof config === 'object' ? config : {}
  const opts = { ...DEFAULTS, ...cfg }

  ctx.inject(['tools'], (toolScoped) => {
    toolScoped.tools.register({
      name: 'calorie_panel',
      description:
        '读写 DSH 右侧栏「卡路里日记」面板（本地存储，内置常见食物热量表）。' +
        'action=add 记一餐：需要 food（食物名，从 action=search 的结果里挑最准）+ grams（克数），可选 meal(早餐/午餐/晚餐/加餐)、date、kcal（直接给热量时可不给 grams）；' +
        'action=today 看今天；action=days 看最近几天（可给 days，默认 7）；action=search 查食物热量（可给 query）；' +
        'action=remove 删一条（需要 id）；action=goal 设每日目标（需要 kcal）；action=state 看总览。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'today', 'days', 'search', 'remove', 'goal', 'state'], description: '要做的动作。' },
          food: { type: 'string', description: 'add：食物名（如 米饭 / 鸡胸肉）。' },
          grams: { type: 'number', description: 'add：克数。' },
          kcal: { type: 'number', description: 'add：直接给热量（没给克数时用）。goal：每日目标。' },
          meal: { type: 'string', description: 'add：餐次，默认按当前时间猜。' },
          date: { type: 'string', description: 'add：YYYY-MM-DD，默认今天。' },
          days: { type: 'number', description: 'days：最近几天，默认 7。' },
          query: { type: 'string', description: 'search：搜索词。' },
          id: { type: 'string', description: 'remove：记录 id。' },
        },
        required: ['action'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
        render(_args, value) {
          return [{ type: 'text', text: String((value && value.text) || '') }]
        },
      },
      presentCall(args) {
        return { card: 'terminal', title: `calorie_panel ${String((args && args.action) || 'today')}`.trim() }
      },
      async execute(args) {
        const action = String((args && args.action) || 'today').toLowerCase()
        const today = dateKey(new Date())
        const state = () => stateStore.get()

        if (action === 'state') {
          const s = state()
          return {
            text: JSON.stringify(
              { 记录数: (s.entries || []).length, 目标: opts.dailyGoal, 今天: dayTotal(s.entries, today).total, revision: s.revision },
              null,
              2,
            ),
          }
        }

        if (action === 'search') {
          const rows = searchFoods(args.query, 15)
          return { text: rows.map((row) => `${row.name}  ${row.kcalPer100g} kcal/100g`).join('\n') || '没找到' }
        }

        if (action === 'today' || action === 'days') {
          const s = state()
          if (action === 'today') {
            const day = dayTotal(s.entries, today)
            if (!day.count) return { text: `今天（${today}）还没记，目标 ${opts.dailyGoal} kcal` }
            return {
              text:
                `${today}：${day.total} kcal / 目标 ${opts.dailyGoal}（${Math.round((day.total / opts.dailyGoal) * 100)}%，${day.count} 条）\n` +
                day.entries
                  .map((entry) => `- ${entry.meal}  ${entry.food}${entry.grams ? ` ${entry.grams}g` : ''}  ${entry.kcal} kcal\n  id=${entry.id}`)
                  .join('\n'),
            }
          }
          const days = Math.min(60, Math.max(1, Number(args.days) || opts.trendDays))
          const rows = dailyTotals(s.entries, today, days)
          return {
            text: rows.map((row) => `${row.date}  ${row.total} kcal${row.total ? '' : '（没记）'}`).join('\n'),
          }
        }

        if (action === 'add') {
          const food = String(args.food || '').trim()
          if (!food) return { text: 'add 需要 food' }
          const grams = Number(args.grams)
          const direct = Number(args.kcal)
          let kcal = null
          let note = ''
          if (Number.isFinite(direct) && direct > 0) {
            kcal = Math.round(direct)
          } else if (Number.isFinite(grams) && grams > 0) {
            kcal = kcalFor(food, grams)
            if (kcal === null) {
              const guess = lookupFood(food)
              return { text: `食物「${food}」不在热量表里${guess ? `（最接近的是「${guess.name}」）` : ''}；可以先用 action=search 查名字，或者直接给 kcal=...` }
            }
            const hit = lookupFood(food)
            if (hit && !hit.exact) note = `（按「${hit.name}」${hit.kcalPer100g} kcal/100g 算的）`
          } else {
            return { text: 'add 需要 grams（克数）或者直接给 kcal' }
          }
          const hour = new Date().getHours()
          const meal = String(args.meal || '').trim() || (hour < 10 ? '早餐' : hour < 15 ? '午餐' : hour < 21 ? '晚餐' : '加餐')
          const date = String(args.date || '').trim() || today
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { text: `date 要是 YYYY-MM-DD，收到「${date}」` }
          const entry = { id: newId(), date, meal, food, grams: Number.isFinite(grams) && grams > 0 ? Math.round(grams) : null, kcal }
          const next = stateStore.patch({ entries: sortEntries([...(state().entries || []), entry]) })
          const day = dayTotal(next.entries, date)
          return { text: `已记：${date} ${meal} ${food}${entry.grams ? ` ${entry.grams}g` : ''} = ${kcal} kcal${note}\n当天合计 ${day.total} kcal / 目标 ${opts.dailyGoal}` }
        }

        if (action === 'goal') {
          const kcal = Number(args.kcal)
          if (!Number.isFinite(kcal) || kcal <= 0) return { text: 'goal 需要正数 kcal' }
          stateStore.patch({ goal: Math.round(kcal) })
          return { text: `目标已设为 ${Math.round(kcal)} kcal（注：这是面板显示用的数字，插件不提供健康建议）` }
        }

        if (action === 'remove') {
          const id = String(args.id || '').trim()
          if (!id) return { text: 'remove 需要 id' }
          const s = state()
          const target = (s.entries || []).find((entry) => entry.id === id)
          if (!target) return { text: `找不到 id=${id}` }
          const next = stateStore.patch({ entries: (s.entries || []).filter((entry) => entry.id !== id) })
          return { text: `已删：${target.date} ${target.food} ${target.kcal} kcal（剩 ${next.entries.length} 条）` }
        }

        return { text: `不认识的动作：${action}` }
      },
    })
  })

  ctx.inject(['webServer'], (scoped) => {
    const disposers = []
    disposers.push(
      scoped.webServer.register({
        kind: 'exact',
        path: ROUTE_STATE,
        handler: (req, res) => {
          const method = String((req && req.method) || 'GET').toUpperCase()
          const headers = (req && req.headers) || {}
          if (String(headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') {
            res.statusCode = 403
            res.end()
            return
          }
          if (method === 'GET' || method === 'HEAD') {
            const s = stateStore.get()
            const today = dateKey(new Date())
            sendJson(res, 200, {
              ok: true,
              today,
              dailyGoal: Number(s.goal) > 0 ? Number(s.goal) : opts.dailyGoal,
              meals: opts.meals,
              trendDays: opts.trendDays,
              todayTotal: dayTotal(s.entries, today),
              trend: dailyTotals(s.entries, today, opts.trendDays),
              foods: Object.keys(FOODS).length,
              state: s,
            })
            return
          }
          if (method === 'POST') {
            let raw = ''
            req.on('data', (chunk) => {
              raw += chunk
              if (raw.length > 4 * 1024 * 1024) req.destroy()
            })
            req.on('end', () => {
              let body = {}
              try {
                body = raw.trim() ? JSON.parse(raw) : {}
              } catch {
                sendJson(res, 400, { ok: false, error: '请求体不是 JSON' })
                return
              }
              if (Array.isArray(body.entries)) body.entries = sortEntries(body.entries)
              sendJson(res, 200, { ok: true, state: stateStore.patch(body) })
            })
            return
          }
          res.statusCode = 405
          res.end()
        },
      }),
    )

    // 查询食物表（面板搜索用）
    disposers.push(
      scoped.webServer.register({
        kind: 'exact',
        path: '/dsh-calorie/foods',
        handler: (req, res) => {
          const query = new URL(req.url || '/', 'http://127.0.0.1').searchParams
          sendJson(res, 200, { ok: true, foods: searchFoods(query.get('q') || '', Math.min(50, Number(query.get('limit')) || 12)) })
        },
      }),
    )

    ctx.on('dispose', () => {
      for (const off of disposers) {
        try {
          off()
        } catch {
          /* already gone */
        }
      }
    })
  })
}

export { apply, ROUTE_STATE, DEFAULTS }
