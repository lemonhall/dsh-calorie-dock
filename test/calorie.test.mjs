/**
 * 热量表与合计的单元测试（纯函数）：
 *   node test/calorie.test.mjs
 */
import { lookupFood, kcalFor, searchFoods } from '../lib/foods.js'
import { dayTotal, dailyTotals, dateKey } from '../lib/index.js'

let failed = 0
function check(name, actual, expected) {
  const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v))
  const ok = show(actual) === show(expected)
  if (!ok) failed += 1
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    期望 ${show(expected)}\n    实际 ${show(actual)}`}`)
}

// --- 热量表 ---
check('精确命中', lookupFood('米饭').kcalPer100g, 116)
check('精确命中标记', lookupFood('米饭').exact, true)
check('包含匹配（输一半）', lookupFood('鸡胸')?.name, '鸡胸肉')
check('包含匹配（名字更长）', lookupFood('拿铁咖啡')?.name, '咖啡')
check('找不到给 null', lookupFood('螺蛳粉'), null)
check('空输入给 null', lookupFood(''), null)

// --- 按克数算 ---
check('200g 米饭', kcalFor('米饭', 200), 232)
check('50g 鸡胸肉', kcalFor('鸡胸肉', 50), 67)
check('0 克不算', kcalFor('米饭', 0), null)
check('负克数不算', kcalFor('米饭', -5), null)
check('不认识的食物不算', kcalFor('螺蛳粉', 100), null)

// --- 搜索 ---
check('搜索有结果', searchFoods('蛋', 5).some((row) => row.name.includes('蛋')), true)
check('空搜索给列表', searchFoods('', 3).length, 3)

// --- 合计 ---
const entries = [
  { id: '1', date: '2026-10-03', meal: '早餐', food: '鸡蛋', grams: 50, kcal: 72 },
  { id: '2', date: '2026-10-03', meal: '早餐', food: '牛奶', grams: 250, kcal: 135 },
  { id: '3', date: '2026-10-03', meal: '午餐', food: '米饭', grams: 200, kcal: 232 },
  { id: '4', date: '2026-10-02', meal: '晚餐', food: '面条(煮)', grams: 300, kcal: 330 },
]
const day = dayTotal(entries, '2026-10-03')
check('当天合计', day.total, 439)
check('当天条数', day.count, 3)
check('当天按餐次', day.byMeal.map((row) => row.meal).sort(), ['午餐', '早餐'])
check('早餐小计', day.byMeal.find((row) => row.meal === '早餐').kcal, 207)
check('别的日期不进当天', dayTotal(entries, '2026-10-04').total, 0)

const trend = dailyTotals(entries, '2026-10-03', 3)
check('趋势天数', trend.length, 3)
check('趋势按日期升序', trend.map((row) => row.date), ['2026-10-01', '2026-10-02', '2026-10-03'])
check('趋势末位是当天', trend[2].total, 439)
check('趋势含前一天', trend[1].total, 330)

check('dateKey 本地日期', dateKey(new Date(2026, 9, 3, 22, 0)), '2026-10-03')

console.log(failed ? `\n${failed} 项失败` : '\n全部通过')
process.exit(failed ? 1 : 0)
