/**
 * 常见食物热量表（每 100 克 kcal）。
 *
 * 数据是常见参考值，**量级对、不必当营养学依据** —— 目的是省掉"吃之前还要去查"的那一步。
 * 名字用日常叫法；`lookupFood` 支持包含匹配（搜"鸡蛋"能找到"鸡蛋(煮)"）。
 */

export const FOODS = {
  // --- 主食 ---
  米饭: 116,
  白粥: 46,
  馒头: 223,
  花卷: 217,
  面条_煮: 110,
  '面条(煮)': 110,
  挂面_干: 346,
  米粉_煮: 109,
  全麦面包: 246,
  白面包: 312,
  包子_肉: 227,
  饺子_猪肉: 253,
  油条: 388,
  煎饼: 354,
  红薯: 106,
  土豆: 81,
  玉米_鲜: 112,
  燕麦片: 377,
  糙米饭: 112,
  // --- 蛋白质 ---
  '鸡蛋(煮)': 144,
  鸡蛋: 144,
  煎蛋: 200,
  牛奶: 54,
  酸奶: 72,
  豆浆: 16,
  '豆腐(北)': 116,
  豆腐: 82,
  鸡胸肉: 133,
  鸡腿: 181,
  炸鸡: 279,
  牛肉_瘦: 106,
  '牛肉(瘦)': 106,
  牛排: 250,
  猪肉_瘦: 143,
  '猪肉(瘦)': 143,
  五花肉: 508,
  排骨: 278,
  羊肉: 203,
  火腿肠: 212,
  培根: 181,
  草鱼: 113,
  三文鱼: 208,
  带鱼: 127,
  虾: 93,
  螃蟹: 95,
  金枪鱼罐头: 116,
  // --- 蔬果 ---
  西兰花: 36,
  白菜: 20,
  菠菜: 28,
  生菜: 16,
  黄瓜: 16,
  番茄: 20,
  茄子: 23,
  青椒: 22,
  胡萝卜: 39,
  蘑菇: 24,
  木耳_干: 265,
  苹果: 53,
  香蕉: 93,
  橙子: 48,
  葡萄: 45,
  西瓜: 26,
  草莓: 32,
  梨: 51,
  桃: 51,
  蓝莓: 57,
  牛油果: 171,
  // --- 零食饮料 ---
  花生米: 574,
  核桃: 646,
  瓜子: 606,
  薯片: 555,
  巧克力: 589,
  蛋糕: 347,
  饼干: 435,
  冰淇淋: 127,
  '可乐(罐)': 43,
  可乐: 43,
  雪碧: 43,
  啤酒: 32,
  '奶茶(全糖)': 90,
  奶茶: 65,
  '咖啡(黑)': 2,
  咖啡: 2,
  橙汁: 45,
  // --- 做菜用 ---
  食用油: 899,
  橄榄油: 899,
  白砂糖: 400,
  蜂蜜: 321,
  花生酱: 600,
  沙拉酱: 680,
  酱油: 63,
}

/** 精确 → 包含匹配；找不到给 null（调用方决定要不要按 0 处理）。 */
export function lookupFood(name) {
  const key = String(name || '').trim()
  if (!key) return null
  if (Object.prototype.hasOwnProperty.call(FOODS, key)) return { name: key, kcalPer100g: FOODS[key], exact: true }
  const lower = key.toLowerCase()
  const hit = Object.keys(FOODS).find((food) => food.toLowerCase().includes(lower) || lower.includes(food.toLowerCase()))
  return hit ? { name: hit, kcalPer100g: FOODS[hit], exact: false } : null
}

/** 按克数算 kcal，四舍五入到整数。 */
export function kcalFor(foodName, grams) {
  const hit = lookupFood(foodName)
  const g = Number(grams)
  if (!hit || !Number.isFinite(g) || g <= 0) return null
  return Math.round((hit.kcalPer100g * g) / 100)
}

/** 模糊搜索（给面板的下拉/搜索用）。 */
export function searchFoods(query, limit = 12) {
  const key = String(query || '').trim().toLowerCase()
  const names = Object.keys(FOODS)
  if (!key) return names.slice(0, limit).map((name) => ({ name, kcalPer100g: FOODS[name] }))
  return names
    .filter((name) => name.toLowerCase().includes(key))
    .slice(0, limit)
    .map((name) => ({ name, kcalPer100g: FOODS[name] }))
}
