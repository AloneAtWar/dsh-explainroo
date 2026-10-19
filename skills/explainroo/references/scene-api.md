# Scene API 参考（scenes.js）

写 `scenes.js` 时查阅的场景 API 速查：时间、布局、各类元素及其选项，以及常见的坑。

## 基本模型

每个场景函数只负责画一帧。explainroo 渲染每一帧时都会传入一个全新的 `s` 调用它，所以场景里的一切都只应取决于时间。不要在两次调用之间保存任何值，也不要用定时器。给元素一个 `at` 时间，当前风格（look，即 `theme` 选的外观）就会把它动画入场；给它一个 `out` 时间，风格就会把它动画退场。

```js
export default {
  intro(s) {
    s.title('DNS 是怎么工作的', { at: 0 });
    s.icon('globe', { y: 700, at: 'browser' });
  },
};
```

### 画布尺寸与坐标

| 画幅 | 画布尺寸 |
|---|---|
| 16:9 | 1920 x 1080 |
| 竖屏类尺寸 | 1080 x 1920 |
| 方形 | 1080 x 1080 |
| `instagram`、`linkedin`、4:5 | 1080 x 1350 |

坐标单位是像素，原点在左上角。除非某个方法另有说明，`x`、`y` 指的是元素的**中心点**。

## 时间

| 成员 | 含义 |
|---|---|
| `s.t` | 从本场景开始算起的秒数 |
| `s.T` | 从整个视频开始算起的秒数 |
| `s.dur` | 本场景时长（秒） |
| `s.voice` | 本场景旁白的 `{ start, end }` |
| `s.words` | 念出的词：`{ text, start, end }`，时间以场景内秒数计 |
| `s.cue(word, n = 1)` | 某个词或短语第 n 次被念出时的开始时间 |
| `s.cueEnd(word, n = 1)` | 该次念完的时间 |
| `s.mark(name)` | `[#name]` 标记所在的时间 |
| `s.time(v)` | 把数字、词或 `"#marker"` 转换成秒数 |
| `s.pace` | 整个视频的节奏 `pace`（1 为正常） |
| `s.p(at, dur = 0.6, ease = 'inOut')` | 返回 0 到 1 的进度，供你自己做动画 |
| `s.since(at)`、`s.between(a, b)` | 距某个时间已过去多少秒；当前是否处于两个时间之间 |
| `s.video` | 整个视频的 `{ duration, frames, fps, width, height, scenes }` |

### at / out 的取值

所有 `at` 和 `out` 都接受三种写法：

- 秒数：`2.4`
- 念出的词：`'resolver'`
- 标记：`'#ask'`

词线索（cue）忽略大小写和标点，也可以写短语。写错的词或标记会直接报错停止，错误信息里会列出最接近的候选词。

> **中文旁白提示**：中文旁白里的线索词优先用 `[#标记]`（在脚本中埋标记，场景里写 `at: '#标记名'`）。如果用 `at: '词'`，这个词必须与分词后的**整词**完全匹配，词的一部分或跨词片段都匹配不上。

### 缓动（easing）

缓动决定运动如何加速和减速。可用名称：

`linear`、`in`、`out`、`inOut`、`outBack`、`outElastic`、`outQuart`、`inOutSine`

自己做数学计算时可用：`s.ease.out(p)`、`s.lerp(a, b, p)`、`s.clamp(v, lo, hi)`。

## 布局

| 成员 | 含义 |
|---|---|
| `s.W`、`s.H`、`s.cx`、`s.cy` | 画布宽高及其中心点（在 Shorts、TikTok、Reels 上是 `s.safe` 的中心） |
| `s.portrait` | 画面高大于宽时为 true |
| `s.safe` | `{ x, y, w, h, left, top, right, bottom }`：内容安全区（四周留 7% 边距，或平台界面留出的空闲区域） |
| `s.row(n, { width, x })` | 在给定宽度内均匀分布的 n 个 x 坐标 |
| `s.col(n, { height, y })` | 在给定高度内均匀分布的 n 个 y 坐标，在 `s.safe` 中居中 |
| `s.grid(cols, rows, { x, y, w, h, gap })` | 逐行排列的格子 `{ x, y, w, h }`，默认铺满 `s.safe` |
| `s.get(id)` | 取之前用该 `id` 画过的元素的尺寸和位置 |

大多数元素会返回 `{ x, y, w, h, left, right, top, bottom }`，方便把下一个元素放在它的下方或旁边。

## 大多数元素通用的选项

| 选项 | 含义 |
|---|---|
| `at`、`out` | 出现时间和离场时间 |
| `enter` | 入场方式：`draw`、`write`、`type`、`words`、`sync`、`pop`、`rise`、`fade`、`zoom`、`drop`、`slide-left`、`slide-right`、`slide-up`、`slide-down`、`none` |
| `exit` | 退场方式：`fade`、`pop`、`rise`、`drop`、`slide-left`、`slide-right`、`none` |
| `dur` | 入场动画时长（秒，会按 pace 缩短） |
| `outDur` | 退场动画时长（秒，默认 0.45） |
| `id` | 元素名称，供箭头、`annotate` 和 `s.get` 引用 |
| `color` | 颜色名（`blue`、`accent`、`ink`、`muted` 等）或任意 CSS 颜色 |
| `opacity`、`scale`、`rotate` | 额外变换，`rotate` 单位为度 |
| `float` | 缓慢漂移的像素幅度，让静止元素保持“活着”的感觉 |
| `sfx` | 入场音效，或设为 `false` 静音 |

### out 的时机与原地替换

`out` 是退场动画**开始**的时间，所以上一个元素还在淡出时下一个就已经进来了。要在同一位置把一个标签换成另一个：给旧标签 `exit: 'none'`，新标签的 `at` 设为与旧标签 `out` 相同的时间。

### 各风格的默认入场

- `paper`、`chalk`、`blueprint`：形状一笔一笔画出来，文字被“写”出来。
- `clean`、`midnight`：形状弹出（pop），文字上浮（rise）。
- `editorial`：形状淡入，文字上浮。

### at: -1

对上一场景里已经在屏幕上的东西用 `at: -1`：它们从场景一开始就在，并且不发出声音。

## 文本

```js
s.title('DNS 是怎么工作的', { at: 0 });                    // display 字体，104 px，位于 44% 高度
s.subtitle('互联网的电话簿', { at: 1 });                    // 46 px，muted 颜色，位于 60% 高度
s.text('每个网站都有一个 *地址*', { y: 300, size: 64, at: 'address' });
s.note('大约 20 ms', { x: 1400, y: 820, at: 3 });           // 32 px，muted 颜色
```

`s.text(str, options)` 的选项：

| 选项 | 说明 |
|---|---|
| `x`、`y` | 位置 |
| `size` | 字号，默认 48 |
| `font` | 字体角色：`display`、`body`、`hand`、`mono` |
| `weight` 或 `bold: true` | 字重 |
| `align` | 对齐；`left` 表示 x 是左边缘 |
| `valign` | 垂直对齐；`top` 表示 y 是顶边 |
| `maxWidth` | 最大宽度 |
| `lineHeight` | 行高 |
| `color` | 文字颜色 |
| `mark` | `*星号包裹*` 的词的颜色 |
| `bg` | 文字背后的卡片 |
| `padding`、`radius`、`border` | 卡片内边距、圆角、边框 |

- 文本还可以用这些入场方式：`write`、`type`（配合 `cps` 控制每秒字符数）、`words`、`sync`。`sync` 会在旁白念到每个词时显示该词。
- `*星号*` 包裹的词使用强调色（accent）。
- `\n` 换行。

## 数学公式

```js
s.math('E = mc^2', { y: 420, size: 96, at: 'energy' });
s.math(String.raw`\int_0^1 x^2\,dx = \tfrac{1}{3}`, { x: 960, y: 700, size: 72, color: 'accent', at: '#integral', id: 'area' });
```

`s.math(tex, options)` 绘制一个 TeX 公式。选项：

| 选项 | 说明 |
|---|---|
| `x`、`y` | 中心点 |
| `size` | 默认 72 |
| `color` | 默认 ink |
| `align` | `center` 或 `left`（`left` 时 x 为左边缘） |
| `display` | 设为 true 使用 display 样式 |

另外支持通用元素选项。返回值与文本一样是一个盒子；它的 `id` 可用于箭头和 `s.annotate`。

- 入场：在 `paper`、`chalk`、`blueprint` 中先描轮廓再填充；其他风格使用该风格的文本入场方式。也可以指定 `fade`、`pop` 或 `rise`。
- 反斜杠：普通 JS 字符串里每个反斜杠要写两次，例如 `'\\frac{1}{2}'`；`String.raw` 会原样保留反斜杠，如上面第二个例子。
- 只能用固定的 TeX 字符串。始终调用 `s.math`，用 `at` 和 `out` 控制时机。`explainroo check` 会报告随 `s.t` 变化的公式，或者只在后面某一时刻才调用的公式。
- 公式在本机排版，缓存在 `build/math/`。

## 形状与箭头

```js
s.box('Resolver', { id: 'res', x: 960, y: 540, icon: 'server', color: 'blue', at: 'resolver' });
s.circle({ id: 'you', x: 400, y: 540, r: 90, label: '你', at: 0.5 });
s.arrow('you', 'res', { label: '询问', at: 'asks' });
s.arrow([300, 900], [1600, 900], { bend: 0.3, dashed: true, at: 5 });
s.line([[200, 800], [900, 700]], { color: 'accent', at: 2 });
s.path('M0 0 C 200 -150 400 150 600 0', { x: 660, y: 540, at: 3 });
```

### s.box / s.circle

`s.box(label, options)` 是一张自动适配标签大小的卡片。选项：

| 选项 | 说明 |
|---|---|
| `w`、`h`、`minW`、`minH` | 宽高及最小宽高 |
| `size`、`font` | 标签字号、字体角色 |
| `icon`、`iconSize`、`iconColor` | 卡片内图标及其大小、颜色 |
| `color` | 描边色，并附带同色浅色填充 |
| `fill`、`stroke` | 单独指定填充色、描边色 |
| `width` | 描边宽度 |
| `dashed` | 虚线 |
| `border: false` | 不要边框 |
| `radius` | 圆角 |
| `shape: 'ellipse'` | 椭圆形 |
| `textColor` | 文字颜色 |
| `fillStyle` | 手绘风格的填充方式：`solid`、`hachure`、`cross-hatch`、`zigzag`、`dots` |

`s.circle({ r, label })` 接受同样的选项。

### s.line / s.path

`s.line(points, options)` 和 `s.path(d, options)` 接受 `color`、`width`、`dashed`、`fill`、`glow`。`s.path` 还接受 `fillStyle`，以及 `single: true`（手绘路径只画一笔，而不是默认的两笔）。

### s.arrow / s.connect

`s.arrow(from, to, options)` 画箭头。`from` 和 `to` 可以是 `[x, y]`、`{ x, y }`，或之前画过的元素的 `id`。用 `id` 时，箭头停在该元素的边缘。选项：

| 选项 | 说明 |
|---|---|
| `bend` | 弯曲程度，大约 -1 到 1 |
| `head` | 箭头位置：`end`、`start`、`both`、`none` |
| `label`、`labelSize`、`labelColor` | 箭头标签及其字号、颜色 |
| `labelFont` | 标签字体，默认手写体；`clean` 风格适合用 `'body'` |
| `labelOffset` | 标签偏移 |
| `gap` | 与端点的间隙 |
| `dashed` | 虚线 |
| `width` | 线宽 |
| `headSize` | 箭头大小 |

`s.connect` 功能相同。

## 图标、图片与视频片段

```js
s.icon('database', { x: 1500, y: 540, size: 140, color: 'purple', at: 'database' });
s.icon('lock', { bg: 'circle', color: 'green', label: '已加密', at: 4 });
s.image('assets/app.png', { w: 1100, frame: 'browser', url: 'app.example.com', at: 0.5 });
s.image('assets/cables.png', { w: 1000, frame: 'card', at: 'cables', kenburns: true });
```

### s.icon

共 1,854 个图标，来自 Lucide。用 `explainroo icons <词>` 搜索；Lucide 的旧图标名也能用。选项：

| 选项 | 说明 |
|---|---|
| `size` | 默认 120 |
| `color` | 颜色 |
| `weight` | 线宽，默认 2 |
| `bg` | 背景：`true`、`'circle'`、`'square'` 或一个颜色 |
| `bgScale` | 背景缩放 |
| `label`、`labelSize`、`labelColor`、`labelFont` | 标签及其字号、颜色、字体 |

### s.image

`s.image(src, options)` 绘制 `assets/` 中的文件。选项：

| 选项 | 说明 |
|---|---|
| `w` 和/或 `h` | 尺寸（图片保持原始比例） |
| `fit` | `cover` 或 `contain` |
| `radius` | 圆角 |
| `frame` | 外框：`none`、`card`、`browser`、`window`、`phone` |
| `url` | 浏览器外框里显示的网址 |
| `border` | 边框 |
| `shadow: false` | 去掉阴影 |
| `kenburns: true` | 缓慢推近（Ken Burns 效果） |

### s.clip

`s.clip(src, options)` 绘制 `assets/` 中的视频。它接受与 `s.image` 相同的布局、外框和时间选项，返回同样的盒子。支持 `.mp4`、`.mov`、`.webm`、`.m4v`。

```js
s.clip('assets/signup.mp4', { w: 1200, frame: 'browser', url: 'app.example.com', at: 'signup' });
s.clip('assets/demo.mov', { x: 1400, y: 540, h: 600, from: 12.5, speed: 1.5, at: '#demo', out: 9 });
```

专属选项：

- `from`（默认 0）：从片段的第几秒开始播放。
- `speed`（默认 1）：范围 0.25 到 4。播放从 `at` 开始。
- `loop`（默认 false）：循环整个片段；否则播完后停在最后一帧。定格超过一秒时 `explainroo check` 会给出提示。
- `volume`（默认 0）：范围 0 到 1。只有 `speed: 1` 时才播放声音。声音在 `out`、片段结束或场景结束时停止。循环时声音也会循环。片段有声音时背景音乐会自动压低（ducking），和旁白时一样。

注意事项：

- 视频帧按项目 fps 提取一次，保存在 `build/clips/`，宽度最多 1920 像素。渲染、静帧（still）和联系表（sheet）都使用这些帧。预览时在正确的帧加载出来之前，可能先显示相邻的帧。
- `s.video` 依然是整个视频的时长、帧数、fps 和尺寸（不是片段的）。
- 播放从 `at` 开始，所以 `at: -1` 会让片段从其第 1 秒开始播。想在场景开始时从片段第一帧播放，用 `at: 0, enter: 'none'`。
- `explainroo check` 读不到片段画面里的文字，这些时刻要看静帧。

## 标注重点

```js
s.text('这 *不是* 魔法', { id: 'claim', y: 400, at: 0 });
s.annotate('claim', { type: 'underline', at: 'magic' });
s.annotate({ x: 960, y: 700, w: 400, h: 90 }, { type: 'circle', color: 'red', at: 3 });
```

`s.annotate(target, options)` 标注一个元素（`id`）或一个盒子区域。`type` 可选：`underline`、`circle`、`box`、`highlight`、`strike`、`cross`、`bracket`。其他选项：`color`、`padding`、`width`、`dur`。

## 列表、数字与图表

```js
s.list(['浏览器缓存', '解析器', '根服务器'], { x: 360, y: 280, at: 'first', stagger: 1.1 });
s.number(1500000, { suffix: ' 次请求', at: 'million', y: 480 });
s.bars([{ label: '2023', value: 19 }, { label: '2024', value: 31 }], { at: 1, suffix: 'k' });
s.lineChart([3, 5, 4, 8, 13, 21], { labels: ['一', '二', '三', '四', '五', '六'], at: 1 });
s.pie([{ label: '图片', value: 55 }, { label: '其他', value: 45 }], { donut: 0.55, at: 1 });
```

### s.list(items, options)

- 每项是文本，或 `{ text, at, icon, color, out }`。
- `x` 是左边缘，`y` 是顶边。
- 选项：`size`（默认 50）、`width`、`gap`、`bullet`（`dot`、`dash`、`number`、`check`、`arrow` 或一个图标名）、`bulletColor`、`at`（一个起始时间，或一组时间）、`stagger`（默认 0.7）、`enter`。

### s.number(value, options)

数字滚动递增，并伴有滴答音效。选项：`from`、`dur`（默认 1.4）、`prefix`、`suffix`、`decimals`、`separator`、`group: false`（不分组千位），以及文本的所有选项。

### s.bars(data, options)

- 每项是 `{ label, value, color, at }`。带自己 `at` 的柱子会在念到那个词时长出来。
- 选项：`x`、`y`、`w`、`h`、`max`、`stagger`、`growDur`、`values: false`（不显示数值）、`prefix`、`suffix`、`format(v)`、`labelSize`、`valueSize`、`fillStyle`。

### s.lineChart(values, options)

选项：`x`、`y`、`w`、`h`、`min`、`max`、`labels`、`dots: false`、`area: false`、`color`、`dur`。

### s.pie(data, options)

选项：`x`、`y`、`r`、`donut`（0 到 0.8）、`labels: false`、`labelOffset`、`dur`。

## 代码与终端

```js
s.code("const res = await fetch(url);", { lang: 'js', title: 'app.js', at: 0.5 });
s.terminal(['$ npm install', 'added 42 packages in 3s'], { at: 1 });
```

### s.code(source, options)

显示代码。选项：

| 选项 | 说明 |
|---|---|
| `x`、`y` | 代码窗口的中心 |
| `lang` | `js`、`ts`、`py`、`go`、`rust`、`php`、`sh`、`sql`、`json`、`md` |
| `size` | 默认 32 |
| `w` | 宽度 |
| `title` | 窗口标题，或 `false` 不显示 |
| `lineNumbers: false` | 不显示行号 |
| `reveal` | 展示方式：`type`、`lines`、`none` |
| `cps` | 打字速度（每秒字符数） |
| `lineDelay` | 逐行展示的间隔 |
| `highlight` | 要高亮的行号 |
| `highlightAt` | 高亮的时间 |

`explainroo check` 会报告比窗口还宽的代码行。

### 分步代码（展示修改、重构、修复）

```js
s.code([
  { code: 'const total = items.length;', at: 0.5 },
  { code: 'const total = items\n  .filter((i) => i.active)\n  .length;', at: 'filter', highlight: [2] },
  { code: 'const activeCount = items\n  .filter((i) => i.active)\n  .length;', at: '#rename' },
], { lang: 'js', title: 'stats.js' });
```

- 保持不变的部分滑动到新位置，删除的部分淡出，新增的部分淡入。
- 后续每一步在自己的 `at` 开始，变换耗时 `morphDur` 秒（默认 0.8，会按 `pace` 缩短）。
- 元素本身的 `at` 默认取第一步的 `at`。
- `reveal` 只作用于第一步。
- 某一步的 `highlight` 会替换之前的高亮。
- 窗口宽度取最宽那一步，最多为画面的 86%，除非你设置了 `w`；高度随行数变化。
- `explainroo check` 会检查每一步的所有行。

### s.terminal(lines, options)

显示终端。以 `$ ` 开头的行会作为命令被打出来，其他行是输出。某一行也可以写成 `{ cmd, at }` 或 `{ out, at, color }`。选项：`w`、`size`、`rows`、`title`、`prompt`、`cps`（默认 22）、`outputDelay`、`lineGap`。

## 镜头、分组与自定义绘制

- `s.camera([{ at, x, y, zoom, dur, rotate }])`：手动移动视角，取代自动镜头（见 `writing-and-visuals.md` 的镜头一节）。必须在场景函数中**第一个**调用。`s.camera([])` 让本场景镜头保持不动。
- `s.focus(target, { at, out })`：在某个线索时间点让自动镜头对准一个元素或区域，比如表格的某一行。`target` 可以是之前画过的 `id`、`{ x, y, w, h }`（中心和尺寸）或 `[x, y, w, h]`。它本身不画任何东西。高亮的代码行和终端命令在画面中较小时，会自动得到特写。
- `s.group({ x, y, scale, rotate, at, out, enter }, () => { ... })`：让一组元素一起移动。组内的位置以组的 `x`、`y` 为原点。
- `s.draw({ x, y, at, out }, (ctx, life) => { ... })`：给你 canvas 2D 上下文，画其他方法画不了的东西。`life.p` 是入场进度（0 到 1），`life.local` 是从 `at` 起经过的秒数，用于持续进行的运动。也可以直接用 `s.ctx`。
- `s.burst({ x, y, at, count, colors })`：放彩纸。
- `s.bg(color)`：在背景上涂一层颜色。
- `s.rand(i)`、`s.noise(x)`、`s.wiggle(amount, speed)`：给出随机值，且每次渲染结果都相同。

## 音效

元素入场时会发出声音，由风格选择音效：手绘线条是涂写声，卡片是“啵”的弹出声，箭头是嗖的一声，列表项是逐级升高的音符，数字是滴答声，打字是键盘咔哒声，场景切换是一声划过（swipe）。

- `sfx: false` 让单个元素静音。
- 在 `video.json` 中设置 `"sfx": "minimal"`，只保留转场音效和你自己添加的音效。

`s.sfx(name, at, { gain, dur, pitch })` 添加一个音效。可用名称：

`pop`、`click`、`whoosh`、`swipe`、`tick`、`type`、`ding`、`chime`、`thud`、`scribble`、`chalk`、`rise`、`sparkle`、`blip`、`error`

`dur` 设定 `type`、`scribble`、`chalk`、`rise` 的长度（`rise` 在 `at + dur` 时结束）。背景音乐会自动生成以适配视频，旁白说话时自动变小。

## 颜色与字体

品牌配色和字体的产品演示，见 `images-and-demos.md`。

颜色名：`accent`、`ink`、`muted`、`bg`、`surface`、`red`、`orange`、`yellow`、`green`、`teal`、`blue`、`purple`、`pink`、`gray`。每种风格都有各自版本的这些颜色，所以切换风格后场景照样能用。

- `s.color(name)` 返回对应的 CSS 颜色。
- `s.tint(name)` 返回对应的浅色填充。

字体角色：`display`、`body`、`hand`、`mono`。

## 常见的坑（Things that break）

- **只在某些时候才调用元素**，例如 `if (s.t > 3) s.box(...)`。应当始终调用，用 `at` 和 `out` 控制时机。音效和检查都依赖这一点。
- **让 `s.math` 的 TeX 随时间变化**。每个公式用固定字符串，各自给 `at` 和 `out`。
- **箭头或标注指向的 `id` 在函数里更靠后才画**。被引用的元素必须先画。
- **`s.camera()` 放在其他元素之后**。它必须第一个调用。
- **`at` 晚于场景结束**。在脚本里用 `{hold=2}` 或 `{min=6}` 把场景拉长。
- **随机值来自 `s.rand()`、`s.noise()` 或场景函数内 `Math.random()` 以外的来源**。只有这三者在每次渲染时结果一致。
- **AI 生成图片里的文字**。屏幕上的文字用 `s.text` 来放。
- **线索词被念了两次**。`at: 'writes'` 指第一次。后面那次用 `s.cue('writes', 2)` 或 `[#marker]`。`explainroo check` 会把这类词列为提示。
- **线索词里的撇号**。线索忽略标点，所以 "visitor's" 会被听成 "visitors"，`at: 'visitor'` 就会等下一个单独的 "visitor"。这种地方用 `[#marker]`。
- **`s.group` 里的元素**。每个元素都在自己的 `at` 发声，哪怕整个组还没出现。给它们与组相同的 `at`，或设 `sfx: false`。
- **发音相近的词**。语音检查会把 "won" 听成 "one"，把 "plain" 听成 "plane"，`{shown|spoken}` 也修不了，只能改写句子。逐字母念的缩写写成 `{API|A, P, I}`；不要写 `A.P.I.`，因为语音会像念网址一样把点念出来。
- **在手绘风格里通过随时间改变 `w` 或 `h` 让形状变大**。轮廓每帧重新绘制，会抖动。改为对 `scale` 做动画。
- **在同一张图的中途切换场景**。`clean` 的默认转场会把整个画面滑走。共用同一张图的场景要加 `{transition=fade}` 或 `{transition=cut}`。
- **从带标签的图标引出箭头**。图标的 `id` 只覆盖图标本身，不含标签，所以向下引出的箭头会穿过标签。
- **`paper` 和 `clean` 里的彩色文字**。绿、橙、红用于形状够用，但作为文字常常太浅。`explainroo check` 会警告低对比度，并建议一个可读的颜色、给出其对比度。
- **长视频片段会让 `build/clips/` 塞满帧**。素材加入前先裁到要展示的部分。删除 `build/clips/` 是安全的。
- **录屏常是可变帧率**。explainroo 会把它转换成项目 fps，因此可能出现重复帧或丢帧。在乎运动效果时，用固定帧率录制。
- **在 `paper`、`chalk`、`blueprint` 里要求精确几何**。这些风格的轮廓是手绘的，圆的边缘会偏离半径一点。当一条线必须与轮廓严丝合缝（比如半径线正好落在圆周上）时，两者都用 `s.draw` 画。
- **在繁忙的电脑上渲染因浏览器关闭或 `EPIPE` 中止**。减少页面数重跑，例如 `explainroo render --workers 2`。
- **短场景末帧镜头停在特写（实测）**。约 5 秒以内的短场景结束时，自动镜头可能还停在特写上，导致最后一帧把标题或元素裁到画外、圈注压住标签。`explainroo check` 查不出来，只能用 `explainroo still <dir>` 逐场查看每场的末帧。修法：在该场景函数第一行写 `s.camera([])` 固定镜头，或在脚本里用 `{hold=…}` 拉长场景。

### explainroo check 能查什么、查不了什么

`explainroo check` 检查文本和数学公式：能发现超出画面的文字、离边缘太近（3.5%）、字太小、对比度低（相对页面背景，或相对文字自身的 `bg`）、与其他文字重叠、被字幕遮挡。

它**看不到**形状、箭头、图标以及 `s.draw` 画的东西。这些要看静帧（`explainroo still`）。
