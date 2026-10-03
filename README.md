# dsh-calorie-dock 🔥

DSH 右侧栏的**卡路里日记**：内置常见食物热量表，选食物 + 克数自动算 kcal，看当日进度与近 7 天。

> 这是给 [DSH（DeepSeek Harness）](https://github.com/deepseek-ai/deepseek-harness) 右侧栏做的一排日常插件之一。
> 右侧栏本来就是 DSH 的「apps 入口」—— 官方的文件/终端/浏览器和第三方插件走的是**完全同一套机制**。

## 效果

![面板](https://cdn.jsdelivr.net/gh/lemonhall/dsh-calorie-dock@main/docs/screenshot-panel.png)

（截图只裁了右侧栏面板。想换订阅源/分类/时长这些，改配置就行，不用碰代码。）

## 它能干什么

- **内置约 90 条常见食物热量表**（主食/蛋白/蔬果/零食/调料）
- 食物名**模糊匹配**：输「鸡胸」能找到「鸡胸肉」，输「拿铁咖啡」会落到「咖啡」
- 每条记录**把算好的 kcal 一起存下来**（不只存克数）—— 以后调食物表，历史记录不会跟着变形
- 按餐次记（早餐/午餐/晚餐/加餐）+ 当日目标进度条 + 近 7 天趋势
- `calorie_panel` 工具：`add` / `today` / `days` / `search` / `goal`

## 装

```
plugin_manager  install_bundle  target=link:E:\development\dsh-calorie-dock
```

或从 npm：

```
dsh plugin --profile <你的 profile> add dsh-calorie-dock
```

装好之后：右侧栏点「**+**」→ 选「**卡路里日记**」。

⚠️ **客户端半边改动要重启一次应用**；宿主半边热生效 —— 但**新增宿主路由要重启**（实测，别指望热重载）。

## 它是怎么work的

```
lib/index.js    宿主半：路由 + calorie_panel 工具（Agent 侧读写同一份状态）
lib/state.js    本地状态（原子写：临时文件 + rename，读的人不会撞上写了一半的文件）
lib/client.js   右侧栏 tab（整个模块包在 IIFE 里 —— DSH 把所有客户端插件拼成一个脚本，
                顶层 const 会跨插件撞名，实测撞过一次直接把应用挡在启动之外）
```

**双向通道**：状态存在宿主，客户端 2 秒轮询。所以**你在面板里点一下，Agent 调工具就能读到**；
**Agent 写一次，面板自己会跟着变**。这不是"一个只读的看板"。

## 已知限制

- 热量是**常见参考值**，量级对，**不必当营养学依据**
- 不做营养素（蛋白/脂肪/碳水）拆分，不做运动消耗
- 目标只是面板上的一条线，插件**不提供任何健康建议**

## License

MIT
