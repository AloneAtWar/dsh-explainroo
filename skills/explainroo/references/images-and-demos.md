# 图片与产品演示

本文介绍如何插入现有或生成的图片，以及如何用 `s.ui` 重建应用界面来制作产品演示视频。

## 图片

### 准备图片

可以使用用户提供的图片、截图或已有素材。如果当前环境有生成图片的能力，也可以先生成与主题和视频风格一致的新图片，再保存或复制到视频项目的 `assets/` 目录，例如 `assets/diagram.png`。插入本地图片无需 OpenRouter 密钥。

### 插入场景

在 `script.md` 中标记图片出现的时刻：

```markdown
## principle
先看整体结构。[#diagram] 信息从左侧进入，经过处理后从右侧输出。
```

在 `scenes.js` 对应的场景函数中调用 `s.image`：

```js
export default {
  principle(s) {
    s.image('assets/diagram.png', {
      x: s.W / 2, y: s.H * 0.52,
      w: s.W * 0.78, h: s.H * 0.6,
      fit: 'contain', frame: 'card', at: '#diagram',
    });
  },
};
```

- 文件路径相对于视频项目目录，图片放在 `assets/` 内。
- `w`、`h` 控制显示区域，`fit: 'contain'` 保留整张图片，`cover` 用于填满区域。
- `at` / `out` 控制出现与离开的时机；中文优先绑定 `[#标记]`。
- `frame` 可选 `none`、`card`、`browser`、`window`、`phone`；`kenburns: true` 添加缓慢推近。
- 生成的图片和已有图片使用同一种插入方式；用 `still` 或 `sheet` 查看效果，检查比例、裁切和字幕遮挡。

### 可选：用 explainroo 生成图片

也可以通过 explainroo 的 `image` 命令调用 OpenRouter 生成插图，费用记在用户的 OpenRouter 账户上。选择这种方式时，使用 `OPENROUTER_API_KEY`，可放在以下任一位置：

- 环境变量 `OPENROUTER_API_KEY`；
- 视频项目目录里的 `.env` 文件；
- 技能 `app/` 文件夹里的 `.env` 文件。

Git 会忽略 `.env`。绝不要打印密钥，也绝不要把它写进脚本、提交或日志。

```bash
explainroo image videos/<name> cables "Two cars parked nose to nose with their hoods open, jumper cables between the batteries"
explainroo images videos/<name>
```

第一条命令生成 `assets/cables.png`；第二条列出已生成的图片和花费。生成后按前述方式插入场景：

```js
s.image('assets/cables.png', { w: 1100, frame: 'card', at: 'cables' })
```

### 选项

- `--model best`（默认）：使用 OpenAI GPT Image 2。它能按要求画，对大多数图片来说值这个价。
- `--model cheap`：使用 Google Gemini 3.1 Flash Image。价格约为一半，但经常忽略提示词里的部分内容。
- `--aspect`：设置图片比例，可选 `16:9`（横屏视频的默认值）、`9:16`、`1:1`、`4:3`、`3:2` 及它们的竖版形式。
- `--ref assets/a.png`：把之前生成的图一并发给模型，让人物或物体保持同样的外观。多个文件用逗号分隔。
- 每张图都会带一个默认风格（扁平、柔和配色、无文字）。可以在 `video.json` 里用 `"images": { "style": "...", "model": "best" }` 设定自己的风格，或用 `--no-style` 关闭风格。

### 检查与使用原则

**每张图都必须打开检查。** 图像模型常把细节画错：多出来的手指、电缆接错了电极、看起来像字其实不是字的文字。只要有问题，就改提示词重新生成。

- 图片里不要放文字，屏幕上的文字用 `s.text` 来写。
- 图片用来表现图标表达不了的东西。
- 整个视频保持同一种风格。

## 产品演示

产品演示就是软件公司用来展示自家应用的那类视频。做法是用 `s.ui` 重建应用的界面：`s.ui` 提供卡片、输入框、按钮、下拉框、开关和状态标签，都用应用自己的配色和字体。鼠标指针在界面间点击、在输入框里打字，镜头随着旁白讲到的内容推近。`examples/unspar-demo` 是一个完整示例。

### 先抓取线上网站

```bash
explainroo capture videos/<name> https://example.com --mobile
```

`capture` 会在一个全新的浏览器里打开页面（没有 cookie、没有登录状态），把演示需要的素材存到 `assets/capture/<hostname>/`：

- `page.png`（首屏）和 `full.png`（整页，最高 8000 像素），都是两倍像素密度，镜头推近时依然清晰。加 `--mobile` 会额外生成 `mobile.png` 和 `mobile-full.png`。
- `capture.json`：包含配色、字体、候选 logo，以及页面上的文案——标题、导航、按钮和表单标签。文案要一字不改地照搬。关于产品宣称和措辞，以线上网站为准。
- 最多三个 logo 文件，以及来自 Google Fonts 的字体文件（只包含页面实际用到的字重）。

命令会打印一段 `brand` 和 `fonts` 配置，可直接粘贴到 `video.json`，但要对照截图核实一遍。explainroo 内置的字体不需要文件；其他字体需要获取字体文件、确认授权许可，并把许可证文件复制到字体文件旁边。

截图里可能出现 cookie 提示条和聊天小部件，和普通访客看到的一样。使用时选一张没有这些东西的截图，或者只截取不含它们的部分。对同一网站再次抓取会覆盖它原来的文件夹。

也可以用 `s.clip` 在 `browser` 边框里播放一段真实的录屏，再用 `s.camera` 推近到旁白提到的细节。

### 保持真实

演示视频是广告，所以里面的一切都必须准确。

- 文案取自应用本身：它的模板和语言文件（例如 `lang/en/*.php`、`locales/` 或组件代码）。标签、按钮和状态名称要原样照抄。
- 只展示真实存在、客户能用的功能。管理后台、调试视图和尚未开发的套餐一律不放。
- 示例数据要一看就是示例：`example.com`、虚构的项目、虚构的文章标题。绝不编造客户、数字或成果。
- 旁白里的宣称来自产品的线上网站。只有网站上展示了价格，才可以展示价格。
- 如果网站和应用的说法不一致，要问用户。

### 设置品牌

在 `video.json` 中设置品牌，使用 `clean` 外观：

```json
{
  "theme": "clean",
  "brand": {
    "accent": "#245cff",
    "background": "#f8f6f1",
    "font": "Figtree",
    "headline": "Instrument Serif",
    "logo": "assets/logo.svg"
  },
  "fonts": [
    { "family": "Figtree", "src": "assets/fonts/Figtree-600.woff2", "weight": 600 }
  ]
}
```

- `accent`：主按钮的颜色，可以在应用的 Tailwind 配置或 CSS 里找到。`background` 是界面背后的底色，`ink` 是直接画在底色上的文字颜色。
- `font`：应用使用的字体。Inter 是内置的；其他字体放进 `assets/fonts/` 并登记到 `fonts` 里（支持 `.woff2`、`.woff`、`.ttf`、`.otf`；每个字重一条记录，可变字体写 `"weight": "100 900"`，斜体加 `"style": "italic"`）。把字体的许可证文件复制到字体旁边。
- `headline`：大标题使用的字体。Instrument Serif 是内置的。如果品牌没有衬线字体，就用品牌自己的字体，并给 `u.headline()` 传 `{ weight: 700, italic: false }`。
- `logo`：产品 logo，取自应用或网站，最好是 SVG。

### 搭建场景

按这个顺序绘制：背景、镜头、标题、界面，最后画鼠标指针，让它始终在最上层。

```js
hook(s) {
  const u = s.ui;
  u.backdrop();
  u.floaters();
  s.camera([{ at: '#site', x: 900, y: 600, zoom: 1.3 }]);
  u.headline('Tell it what to *write about*', s.W / 2, 178, { size: 84, at: 0.15 });
  u.panel(410, 270, 1100, 600, { at: 0.3 }, (x, y, w, h) => {
    u.input(x + 56, y + 296, 560, 62, { label: 'Website URL', value: u.typed('https://example.com', '#site', 24), focus: 1, caret: true });
    u.button('Get ideas', x + 760, y + 516, 280, 60, { press: u.press('#go') });
  });
  u.cursor([
    { at: 0.5, x: 1500, y: 900 },
    { at: s.time('#site') - 0.7, x: 740, y: 596 },
    { at: '#site', click: true },
  ]);
}
```

**标题与镜头。** 标题要在 `s.camera()` 之后绘制，否则推近的界面会滑到标题下面。镜头推近时，要么让标题完整留在画面内（缩放不超过约 1.1），要么推得足够近让标题完全移出画面（约 1.3 及以上）。介于两者之间，标题会被切掉一半。

**点击时机。** 每次点击都对齐到脚本里的一个 `[#mark]`，让点击发生在旁白说到它的那一刻。鼠标移动从它的 `at` 开始，`dur` 秒后到达（默认 0.7 秒），所以移动要比点击提前略多于 `dur` 的时间开始。场景的前 0.7 秒被上一个场景的转场遮住，不要在这段时间里安排点击。

**水印。** 水印在右下角。镜头推近时它可能盖住那里的内容，所以重要文字不要放在那个角落。

**首帧。** 在第一帧用纯文本写出产品名称。第一帧同时也是视频的封面。

### `s.ui` 参考

坐标以画面为准（16:9 时宽 1920）。时间参数和其他地方一样，可以是秒数、旁白中的词，或 `"#marks"`。

| 调用 | 绘制内容 |
|---|---|
| `u.backdrop(color?)`、`u.floaters({ alpha, tint })` | 品牌背景色；以及在边缘缓缓漂浮的淡色卡片（彩色背景上用 `tint: 'white'`） |
| `u.panel(x, y, w, h, { at, out, from, rise, sfx, fill, border, lift }, fn)` | 在 `at` 时弹出的卡片；`fn(x, y, w, h)` 在卡片内部绘制 |
| `u.card(x, y, w, h, o)` | 没有入场动画的卡片 |
| `u.browser(x, y, w, h, { url, at }, fn)` | 带浏览器地址栏的面板；`fn` 拿到的是页面区域 |
| `u.modal(x, y, w, h, { at, out }, fn)`、`u.over(fn)` | 在变暗画面之上的对话框；以及一个用于自定义菜单或弹出层的图层。`check` 不会把一个图层里的文字和另一个图层里的文字报告为重叠 |
| `u.toast(text, { at, out, icon, tone })` | 向上滑入的提示消息，带提示音 |
| `u.headline(text, x, y, { size, at, out, align, weight, italic, color, accent, tracking })` | 逐词从模糊中浮现的大字；用 `*星号*` 包住的词显示为 `accent` 颜色 |
| `u.text(text, x, y, { size, weight, color, align, base, font, italic, tracking, alpha, maxW, check })`、`u.para(text, x, y, maxW, o)`、`u.eyebrow(text, x, y)` | 文本、自动换行的文本（`\n` 另起一行）、小号大写标签。`font` 可以是 `'ui'`、`'headline'` 或字体族名；`check: false` 让这段文字不被 `check` 检查；`u.measure(text, size, weight)` 返回文字宽度 |
| `u.button(label, x, y, w, h, { variant, press, icon, loading, color, caps })` | 按钮，`variant` 为 `primary`、`secondary` 或 `ghost` |
| `u.input(x, y, w, h, { label, value, placeholder, focus, caret, icon })`、`u.textarea(x, y, w, h, o)` | 文本输入框；以及更高、文字会换行的多行输入框 |
| `u.select(x, y, w, h, { label, value, open, options, hover, selected })` | 下拉框；返回每个选项行的 y 坐标 |
| `u.toggle(x, y, on)`、`u.checkbox(x, y, on)`、`u.radio(x, y, on)` | `on` 取值 0 到 1，因此可以做动画 |
| `u.chip(label, x, y, { selected })`、`u.chipWidth(label, o, selected)` | 选项标签（chip）；选中时会因为多出对勾而变宽，要留出空间 |
| `u.pill(label, x, y, tone, { align, dot, pulse })` | 状态徽章：`gray`、`blue`、`yellow`、`green`、`red`、`purple` 或 `accent` |
| `u.spinner(x, y, r)`、`u.progress(x, y, w, p)`、`u.avatar(x, y, r, initials, { image })`、`u.icon(name, x, y, size, color)`、`u.lines(x, y, w, n)`、`u.logo(x, y, w)` | 小部件；`lines` 画灰色横条，用来代替正文 |
| `u.pop(at, cx, cy, fn, { sfx })` | 让任意内容围绕某个点弹出 |
| `u.wipe(at, { color })` | 强调色向外扩散直到铺满画面 |
| `u.cursor(keys, { out })` | 鼠标指针；关键帧 `{ at, x, y, dur, arc }` 移动指针（`arc` 让路径弯曲，0 为直线），`{ at, click: true }` 点击并发出声音 |
| `u.press(at)`、`u.typed(text, at, cps, { gain, sfx })`、`u.stream(text, at, wps)`、`u.count(to, at, dur)` | 按钮按下（0 到 1 再回落）；到当前为止已打出的文字（带打字声）；像 AI 回复那样逐词出现的文字；数字递增计数 |
| `u.colors` | `accent`、`accentDark`、`accentTint`、`background`、`ink`、`text`、`soft`、`muted`、`faint`、`line`、`field`、`surface`、`panel`。`video.json` 里的 `brand.colors` 可以替换这些灰色，例如暖色调品牌用 `{ "text": "#141413", "line": "#e8e6dc" }` |

### 检查与注意事项

- `check` 也能看到 `s.ui` 的文字。它会报告超出画面的文字（镜头推近期间不报）、太小的文字和重叠的文字。下拉框或对话框可以遮住下面的内容。
- 在镜头推近的时刻查看静帧，并确认鼠标指针没有挡住它指着的那个词。
- `s.ui` 的面板和标题默认不发声，除非传入 `sfx`。
- `check` 看不到裁剪：被裁剪隐藏的文字仍会被计入，所以不该显示的文字就不要画。
- 产品名先按原本的拼写写；只有语音检查听错时才改写拼法。
- 旁白下面的音效太多会让人听不清，`verify` 能识别的内容也会变少。长段打字要压低音量（`u.typed(text, at, cps, { gain: 0.25 })`），每个时刻只配一个声音，不要叠三个。
- 每一帧都做模糊滤镜会让渲染变慢。工具包只模糊一次然后复用；自己加模糊时也照此处理。
