# 尺寸、设置与命令参考

本文汇总 explainroo 的输出尺寸、字幕与水印位置、多尺寸工作流、节奏（pace）、项目文件与 `video.json` 设置、自定义外观、全部命令、透明视频导出和网页播放器。

## 各平台尺寸

把 `size` 设成视频要发布的平台。`explainroo formats` 会列出所有尺寸。

| Size | 像素 | 用途 | 国内对应（参考） |
|---|---|---|---|
| `youtube`（或 `16:9`） | 1920 x 1080 | YouTube 及其他横屏播放器 | B站等横屏播放器 |
| `shorts` | 1080 x 1920 | YouTube Shorts | — |
| `tiktok` | 1080 x 1920 | TikTok | 抖音等竖屏短视频 |
| `reels` | 1080 x 1920 | Instagram 和 Facebook Reels | — |
| `vertical` | 1080 x 1920 | 一个文件同时适配 Shorts、TikTok 和 Reels | 通用竖屏 |
| `instagram` | 1080 x 1350 | Instagram 和 Facebook 信息流帖子 | 小红书信息流（常用 4:5） |
| `linkedin` | 1080 x 1350 | LinkedIn 信息流 | — |
| `square`（或 `1:1`） | 1080 x 1080 | X、LinkedIn、Facebook 上的方形帖子 | — |

此外也可以写 `9:16`、`4:5` 或 `WIDTHxHEIGHT`。

上传到 YouTube 和 LinkedIn 时，可以把 `.srt` 文件作为字幕一起上传。

Shorts、TikTok 和 Reels 会在画面上叠加自己的按钮、账号名和帖子文案。使用 `shorts`、`tiktok`、`reels`、`vertical` 时，explainroo 会让内容避开这些区域：`s.safe` 是 App 留空的区域，`s.cx`、`s.cy` 是它的中心点。字幕紧贴在 App 底部条带的上方，水印移到右上角。`check` 会对超出该区域的文字发出警告。纯 `9:16` 没有这些边距，只在视频不发到这些 App 时使用。

竖屏空间很小：元素要上下堆叠而不是左右并排，屏幕上的字要少，所有元素都基于 `s.safe` 定位。`explainroo formats` 会以像素为单位输出每种尺寸的内容区，例如 TikTok 为 745 x 746。

### 字幕位置

竖屏、4:5 和方形视频默认开启字幕。

- Shorts、TikTok、Reels：紧贴在 App 底部条带上方。
- 4:5、方形、横屏：在画面底部、水印上方。
- 纯 `9:16`：大约在从下往上四分之一的高度。

无论哪种情况，`s.safe` 都在字幕上方结束，所以放在 `s.safe` 内的东西不会被字幕挡住；`check` 也会对落在字幕带里的文字发出警告。字幕已经显示的句子，不要再作为文字重复放在画面上。

社交 App 常把第一帧当作封面。如果开头的元素是"画出来"的动画，第一帧就是空的。可以给标题设 `enter: 'none'`，让它从第一帧就在；或者在 App 里另选封面帧。

## 一个项目，多种尺寸

在 `preview`、`still`、`sheet`、`check`、`render` 上加 `--size <size>`，可以只在这一次运行中换用其他尺寸，不会改动 `video.json`。各尺寸共享旁白和词时间戳。设为 `"auto"` 的字幕会跟随所选尺寸。

定位时用 `s.safe`、`s.cx`、`s.cy`、`s.row`、`s.col`、`s.grid`，不要写死像素坐标。用 `s.portrait` 在高画幅中改为堆叠布局。文字大小要相对画面，例如 `s.W * 0.05`。`examples/merge-vs-rebase` 同时适用于 `9:16` 和 `youtube`，它的 scenes.js 展示了一种做法：

```js
intro(s) {
  const cells = s.grid(s.portrait ? 1 : 2, s.portrait ? 2 : 1);
  ['Question', 'Answer'].forEach((label, i) => {
    const { x, y, w, h } = cells[i];
    s.box(label, { x, y, w: w * 0.8, h: h * 0.6,
      size: s.W * 0.05, at: i ? '#answer' : 0 });
  });
}
```

对每种尺寸都运行 `explainroo check --size <size>`，并查看 `explainroo sheet --size <size>`，修好被截断的文字和重叠。然后对每种尺寸运行 `explainroo render --size <size>`。

输出文件命名：

- `render --size tiktok` 写出 `out/video-tiktok.mp4` 以及对应的字幕、封面和章节文件；加 `--draft` 时写出 `draft-tiktok.mp4`。
- 静帧放在 `out/stills-tiktok/`。
- 联系表（sheet）为 `out/sheet-tiktok.jpg`；加 `--scene intro` 时为 `out/sheet-intro-tiktok.jpg`。
- 比例在文件名中用连字符，例如 `video-9-16.mp4`。
- 不加 `--size` 时文件名不变。
- `render --out` 仍然使用你指定的文件名。

## 节奏（pace）

本技能新建项目时默认显式设置 `"pace": 1.3`，整体节奏偏快。`pace` 让整个视频整体变快或变慢：设为 1.3 时，语音大约快 30%，停顿、每场前后的留白、转场和动画时长按 1/1.3 缩短。实际时长以 `voice` 报告为准。

词和标记（marker）的 cue 会跟随语音，所以只要画面绑定在词上，任何 pace 下节奏都对得上。以秒为单位的时间是场景内的真实秒数，`s.t` 和 `s.cue()` 也一样，所以 `at: s.cue('word') + 0.3` 在任何 pace 下都表示该词之后 0.3 秒。而 `at: 4` 这样的固定时间不会随 pace 变化——这也是应该用 cue 的又一个理由。

取值建议：1 是正常节奏；1.15 到 1.3 适合社交媒体和熟悉该主题的观众；超过 1.4 视频会难以跟上。

`speed` 只改变语音速度，默认值 Kokoro 为 0.9，其他语音源为 1。

## 水印

每个视频默认在右下角带一个小小的 "explainroo.com"。在 Shorts、TikTok、Reels 上它放在右上角，因为 App 会盖住右下角。用户可以在 `video.json` 里设 `"watermark": false` 关掉，或改成自己的文字。如果用户问起水印，告诉他们这完全由他们决定，同时说明保留水印能帮助更多人发现这个免费项目。

## 项目文件与设置

```
videos/<name>/
  video.json    look, size, language, voice, music, captions, watermark
  script.md     the narration, one "## scene-id" per scene
  scenes.js     one drawing function per scene
  assets/       images: screenshots, logos, generated illustrations
  build/        voice, timing and audio made by explainroo (safe to delete)
  out/          video.mp4, draft.mp4, stills/, sheets, report.json
```

- `video.json`：外观、尺寸、语言、语音、音乐、字幕、水印
- `script.md`：旁白，每个场景一个 `## scene-id`
- `scenes.js`：每个场景一个绘制函数
- `assets/`：图片——截图、logo、生成的插图
- `build/`：explainroo 生成的语音、时间轴和音频（可安全删除）
- `out/`：`video.mp4`、`draft.mp4`、`stills/`、联系表、`report.json`

### `video.json` 设置

下表列出程序未配置各字段时的回退值；本技能新建项目时会设置 MiMo 配音和 `"pace": 1.3`。

| 设置 | 默认值 | 作用 |
|---|---|---|
| `title` | 取自脚本 | 显示在预览中 |
| `theme` | `paper` | 内置外观，或指向 `.json` 外观文件的相对路径（见"自定义外观"） |
| `size` | `16:9` | 平台名（`youtube`、`shorts`、`tiktok`、`reels`、`vertical`、`instagram`、`linkedin`、`square`），或 `16:9`、`9:16`、`1:1`、`4:5`、`WIDTHxHEIGHT` |
| `fps` | 30 | 24、25、30、50 或 60 |
| `language` | `en` | 旁白语言：`en`、`es`、`fr`、`it`、`pt-br`、`hi`、`ja` 或 `zh`；见 `voices-and-languages.md` |
| `voice` | 该语言的默认语音 | Kokoro 语音 id，或一个 provider 对象（Kokoro、ElevenLabs、MiMo 或录音）；英语默认 `af_heart`；见 `voices-and-languages.md` |
| `speed` | Kokoro 为 0.9，其他为 1 | 仅语音速度，0.6 到 1.6；ElevenLabs 要求 speed × pace 在 0.7 到 1.2 之间 |
| `pace` | 1 | 整个视频的速度（语音、停顿、动画），0.7 到 1.6 |
| `music` | `true` | `true`（使用外观自带风格）、`warm`、`upbeat`、`calm`、`tech`、`playful`、`{ "style", "volume" }` 或 `false` |
| `sfx` | `true` | 音效：`true`、`"minimal"` 或 `false` |
| `captions` | `"auto"` | 在底部显示旁白文字；auto 会在竖屏和方形视频上开启 |
| `cover` | `"auto"` | 全尺寸、不带字幕的 JPEG，默认取第一个场景末尾；也可写静帧规格：`12.5`、`"intro"`、`"intro@2.4"`、`"intro@end"` |
| `transition` | `"auto"` | 外观默认转场，或 `fade`、`slide`、`wipe`、`zoom`、`brush`、`cut` |
| `camera` | `"auto"` | `"auto"` 用跟随旁白的镜头拍摄每个场景；`"still"` 让每帧保持原样 |
| `motionBlur` | `true` | 最终渲染中给运动帧加动态模糊 |
| `lead`、`hold`、`end` | 0.35、0.7、1.4 | 语音前的秒数、语音后的秒数、视频最末尾额外的秒数 |
| `sentenceGap`、`paragraphGap` | 0.3、0.55 | 生成旁白中的句间、段间停顿；录音保留其自身停顿 |
| `loudness` | -14 | 目标响度（LUFS） |
| `boil` | 0 | 手绘线条每秒重绘次数；0 表示保持静止 |
| `watermark` | `"explainroo.com"` | 角落里的小字，或 `false` |
| `images` | 无 | `{ "model": "best" or "cheap", "style": "..." }` |
| `brand` | 无 | 供 `s.ui` 使用的颜色、字体和 logo，见 `images-and-demos.md` |
| `fonts` | 无 | 视频自带的字体文件，见 `images-and-demos.md` |

### 内置外观

| 外观 | 风格 | 转场 | 音乐 |
|---|---|---|---|
| `paper` | 暖色纸上的马克笔绘图 | brush | warm |
| `clean` | 带柔和阴影的扁平卡片 | slide | upbeat |
| `chalk` | 绿色黑板上的粉笔画 | brush | calm |
| `blueprint` | 蓝图底上的白色线稿 | wipe | tech |
| `midnight` | 深色背景配发光色彩 | zoom | tech |
| `editorial` | 暖色纸上的衬线标题和细线，杂志风 | fade | calm |

## 自定义外观

外观文件可以让项目拥有自己的颜色、字体和纹理，而不必修改 explainroo。在 `video.json` 中设 `"theme": "../brand/acme-look.json"`。路径相对于视频文件夹，因此可以把文件放在外面，让多个视频共用同一外观。

```json
{
  "extends": "clean",
  "name": "acme",
  "bg": "#fbfaf7",
  "ink": "#1d1b16",
  "accent": "orange",
  "colors": { "orange": "#e8590c" },
  "background": "dots",
  "transition": "fade",
  "music": "calm"
}
```

- `extends`：作为起点的内置外观。
- 其余键都可选，只覆盖所列出的部分：`name`、`dark`、`bg`、`ink`、`muted`、`surface`、`accent`、`colors`、`fonts`、`background`、`stroke`、`radius`、`transition`、`music`、`code`、`terminal`、`caption`。嵌套项（如 `colors`、`caption`）只需写出要改的值。
- `name` 默认取文件名，不能与内置外观重名。
- 给浅色外观设置深色 `bg` 时，要加 `"dark": true`，让填充和阴影与之匹配。

颜色：写成 `"#e8590c"` 形式。`caption.bg` 和 `code.highlight` 也接受 `rgba(...)`。`accent` 取十种颜色名之一：red、orange、yellow、green、teal、blue、purple、pink、gray、ink。

字体：`fonts` 设置 `display`、`body`、`hand`、`mono` 四个角色，每个角色包含 `family` 和数字 `weight`，例如 `"body": { "family": "Inter", "weight": 500 }`。字体族必须是内置的，或已在 `video.json` 的 `fonts` 下列出——外观文件本身不加载字体。

背景纹理：`background` 可选 `paper`（纸张颗粒）、`dots`（点阵）、`chalk`（黑板擦痕）、`grid`（绘图网格线）、`glow`（两团光晕）或 `plain`（单一纯色），都使用你的 `bg` 颜色。不写则保留基础外观的纹理。

`transition` 和 `music` 设置该外观的默认值，`video.json` 中的设置仍然优先。`preview` 会实时反映外观文件的修改；`check` 会在 `ink` 或 `muted` 与 `bg` 对比度不足时发出警告。

## 命令

所有命令写作 `explainroo <命令>`。

| 命令 | 作用 |
|---|---|
| `explainroo init <dir>` | 创建项目（`--theme`、`--size`、`--pace`、`--language`、`--voice`、`--title`） |
| `explainroo voice [project]` | 生成旁白和词时间戳，按场景保存，只重新生成有改动的场景 |
| `explainroo preview [project]` | 浏览器实时预览，保存即刷新（`--size`） |
| `explainroo still [project] [times]` | 在 `12.5`、`scene`、`scene@2.4` 或 `scene@end` 处输出 PNG（`--size`；`--transparent` 保留 alpha） |
| `explainroo sheet [project]` | 把整个视频或某个场景的多帧拼成一张图（`--scene`、`--every`、`--size`） |
| `explainroo check [project]` | 查找布局、时间和发音问题（`--size`） |
| `explainroo render [project]` | 渲染视频及字幕文件、章节和封面（`--format mp4`、`gif`、`webm` 或 `mov`，`--transparent`、`--size`、`--draft`、`--from`、`--to`、`--workers`、`--out`） |
| `explainroo verify [project]` | 检查成品 MP4、WebM 或 MOV：响度、黑帧、静音、人声清晰度（`--file` 指定其他文件） |
| `explainroo export [project]` | 输出网页播放器文件夹，默认 `out/player/`（`--out dir`、`--json`） |
| `explainroo capture [project] <url>` | 从线上网站保存截图、文案、颜色、字体和 logo（`--mobile`、`--json`） |
| `explainroo image [project] <name> "<prompt>"` | 用 OpenRouter 生成插图 |
| `explainroo images [project]` | 列出图片及其花费 |
| `explainroo voices`、`explainroo say "text"` | 列出 Kokoro 语音及其语言（`--language es`、`ja` 或 `zh` 按语言筛选）；或用所选语音的语言生成一段试听（`--mimo` 使用小米 MiMo） |
| `explainroo voices [project] --elevenlabs` | 列出该 key 可用的语音名称、id 和标签（也支持 `--json`） |
| `explainroo voices --mimo` | 列出内置的小米 MiMo 语音（也支持 `--json`） |
| `explainroo themes`、`explainroo formats`、`explainroo icons <word>` | 列出外观、列出尺寸、在 1,854 个图标中搜索 |
| `explainroo doctor` | 检查 Node、ffmpeg、Chrome、模型，以及其他语言所需的 espeak-ng 和带 misaki 的 Python（`--fetch` 只下载英语模型） |

`render` 的附加文件与视频同名（用 `--out` 时也一样）：`video.srt`、`video.vtt`、`video.cover.jpg`、`video.chapters.txt`。其他规则：

- GIF 没有声音，帧率 15 fps，长边最多 960 像素。
- 使用 `--out` 时，文件扩展名必须与格式一致。
- 只渲染部分视频（`--from`、`--to`）时，不生成章节和封面。
- 没有旁白的视频不生成字幕文件。

## 透明视频（供剪辑软件使用）

要把图解或下三分之一字幕条叠加在实拍素材上，就渲染带 alpha 通道的视频：给剪辑软件用 `explainroo render --transparent --format mov`（ProRes 4444），给网页用 `--format webm`（VP9）。

- 外观的背景纹理会被去掉；场景自己画的内容全部保留，包括 `s.bg()` 和 `s.ui.backdrop()`；卡片、字幕和水印保留各自的背景。
- 要保证元素在实拍画面上依然可读：使用卡片，或文字的 `bg` 选项。
- 输出文件为 `out/video.mov` 或 `out/video.webm`（加 `--draft` 时为 `draft.*`），封面仍是不透明的 JPEG。
- 透明视频中，`slide`、`wipe`、`brush` 转场会变成 `fade`。
- 用 `explainroo still --transparent` 检查帧（保留 alpha）；用 `explainroo verify --file out/video.mov` 检查文件，透明视频会跳过黑帧检查。
- 不加 `--transparent` 时，WebM 和 MOV 就是普通的不透明视频。

## 网页播放器

要把视频放在文档站点或 iframe 中，用 `export`。画布按屏幕分辨率绘制，所以播放器放大时文字依然清晰。导出的文件夹自带引擎、字体、素材、配乐、封面和字幕，不需要 explainroo 服务器。如果还没有语音，会先生成语音。

```bash
explainroo export videos/my-video
```

用任意静态 Web 服务器托管 `out/player/`。直接以本地文件方式打开 `index.html` 是不行的。把整个文件夹复制到你的站点，保持文件在一起；放在子目录里也能用。

1920 x 1080 的视频可以这样嵌入，宽高比按你的视频宽高修改：

```html
<div style="aspect-ratio: 1920 / 1080; width: 100%">
  <iframe src="/videos/my-video/index.html" title="My video"
    style="width: 100%; height: 100%; border: 0"
    allow="autoplay; fullscreen" allowfullscreen></iframe>
</div>
```

URL 参数与操作：

- `index.html?autoplay=1&muted=1`：静音自动播放（受浏览器自动播放规则限制）。
- `index.html?t=12.5`：从 12.5 秒开始。
- 点击画面播放/暂停，空格或 K 键同样；方向键前后跳 5 秒；F 进入全屏；M 静音。
- CC 在控制栏上方显示文字字幕，默认关闭，并在浏览器中记住你的选择。画布中绘制的字幕保持不变。

注意事项：

- 视频片段（clips）使用浏览器的视频解码器，要用浏览器能播放的格式；其时间可能与 MP4 略有差异。
- 数学公式会以排版后的路径形式包含在内。
- 项目模块必须使用相对路径的本地 import。
- 项目中的点文件（dotfiles）、JSON 和文本文件不会被导出。

上传到视频平台时，仍然使用 MP4 文件。
