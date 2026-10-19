---
name: explainroo
description: 生成带旁白、动画、字幕和封面的讲解视频（MP4），支持 MiMo 配音与图片插入。Use when the user asks for an explainer / 讲解视频 / 科普动画 / 教程视频 / 产品演示 / 带配音的动画图解，或要做 YouTube、B站、Shorts、抖音、TikTok、Reels、小红书、LinkedIn 短片，或提到 explainroo、/explainroo。
version: 3.0.1
---

# explainroo：把一个主题做成讲解视频

explainroo 把两个文件变成成片：`script.md`（旁白）和 `scenes.js`（每一场画什么、在哪个词出现）。它负责配音、词级对时、Chrome 逐帧渲染、配乐音效、ffmpeg 合成，并输出 `.srt/.vtt` 字幕、封面和章节。

## 1. 调用方式

所有命令都这样调用（`<skill>` 换成技能目录的绝对路径，用正斜杠）：

```bash
node "<skill>/app/bin/explainroo.js" <命令> <项目目录> [选项]
```

下文简写为 `explainroo`。每个命令都支持 `--json`。

- **不要修改 `app/`、`references/`、`examples/` 里的文件**，也不要在技能目录里建视频项目。
- 视频项目放在用户指定的位置；没指定就放用户当前工作区的 `videos/<英文短名>`。

## 2. 开工前

### 2.1 首次使用：安装依赖

`<skill>/app/node_modules` 不存在时，先安装（需要 Node.js 20.11+ 和网络，约下载 500 MB，只装一次）：

```bash
node -v                                   # 必须 ≥ 20.11，没有就请用户装 Node.js LTS
cd "<skill>/app" && npm ci --omit=dev
```

`npm ci` 失败多半是网络问题；可以重试，或让用户配置 npm 镜像（如 `npm config set registry https://registry.npmmirror.com`）后再装。`app/node_modules` 已被 `.gitignore` 忽略，不会进仓库。

### 2.2 环境体检

```bash
explainroo doctor
```

| doctor 行 | 不通过时怎么办 |
|---|---|
| `node` | 需要 20.11+ |
| `ffmpeg` | 必须另装：Windows `winget install Gyan.FFmpeg`（装完开新终端），macOS `brew install ffmpeg`；或设 `EXPLAINROO_FFMPEG` 指向它 |
| `chrome` | 依次找 Playwright 的 Chromium、Chrome、Edge；Windows 自带 Edge 一般能通过。不行就 `npx playwright install chromium-headless-shell` 或设 `EXPLAINROO_CHROME` |
| `speech check model` 显示 FAIL | 首次用到时自动下载；中文等非英语视频使用 Whisper small |

语音校对模型和中日文字体会按需下载到 `~/.cache/explainroo`，首次运行 `voice` 可能较慢。使用 MiMo 时，未使用的本地语音模型或发音库提示可忽略。

### 2.3 配音配置

默认使用小米 MiMo，音色 `冰糖`。在 `video.json` 中设置：

```json
"voice": { "provider": "mimo", "id": "冰糖" }
```

MiMo 使用 `MIMO_TTS_API_KEY`。程序按 环境变量 → 项目目录 `.env` → `<skill>/app/.env` 的顺序查找。用户提供的新密钥可写成 `MIMO_TTS_API_KEY=...` 存入 `<skill>/app/.env`，该文件已被 git 忽略。检查配置时只报告密钥是否存在，绝不打印密钥或写进脚本、命令行参数和日志。

用户指定 ElevenLabs 或真人录音时，按 `references/voices-and-languages.md` 配置；ElevenLabs 使用 `ELEVENLABS_API_KEY`。MiMo 和 ElevenLabs 会发送旁白文本并产生费用，用户明确要求离线或免费时，先确定符合要求的配音来源。

### 2.4 查中文手册

`<skill>/references/` 是完整的中文手册，按需读对应文件，不用一次读完：

| 文件 | 内容 | 什么时候读 |
|---|---|---|
| `writing-and-visuals.md` | 旁白写法、脚本语法、画面原则、镜头 | **写 `script.md` 之前必读** |
| `scene-api.md` | `scenes.js` 能调用的全部函数和选项、常见的坑 | **写 `scenes.js` 之前必读** |
| `voices-and-languages.md` | MiMo / ElevenLabs / 录音、多语言、中日文细节 | 配音有疑问或非中英文视频时 |
| `settings-and-commands.md` | 尺寸、字幕位置、多尺寸输出、pace、水印、`video.json` 全部配置、自定义外观、命令全表、透明视频、网页播放器 | 调配置、出多尺寸或特殊格式时 |
| `images-and-demos.md` | 插入现有或生成的图片、产品演示（`capture`、`s.ui`、鼠标） | 需要图片或做软件演示时 |

### 2.5 先看一个最接近的示例

`<skill>/examples/` 里每个目录都是完整项目。写之前打开最接近的一个，照它的写法来：

| 示例 | 适合参考 |
|---|---|
| `password-storage-zh` | **中文旁白**、midnight 外观、字幕、章节、`[#标记]` 用法 |
| `how-dns-works` | 技术流程图、箭头、镜头跟随 |
| `merge-vs-rebase` / `callbacks-to-async-await` | 代码逐步变化、终端 |
| `circle-area` / `leap-years` | 数学公式、图表 |
| `sqlite-demo` / `unspar-demo` | 产品演示、`s.ui` 重建界面、鼠标点击 |
| `explainroo-intro` | 综合展示 |
| `why-is-the-sky-blue-es` / `leap-years-ja` | 其他语言 |

不要直接在 `examples/` 里渲染，那样会在技能目录里生成 `build/`、`out/`。想试跑就先复制到工作区。

### 2.6 插入图片

需要插图时，可以用用户提供的图片或截图；如果当前环境有生图能力，也可以先生成符合主题和画面风格的新图片。将文件保存或复制到视频项目的 `assets/`，例如 `assets/diagram.png`。

在 `script.md` 中用 `[#diagram]` 标出图片出现的位置，在对应的场景函数中插入：

```js
s.image('assets/diagram.png', {
  x: s.W / 2, y: s.H * 0.52,
  w: s.W * 0.78, h: s.H * 0.6,
  fit: 'contain', frame: 'card', at: '#diagram',
});
```

路径相对于视频项目目录。用 `at` / `out` 控制出现和离开，`kenburns: true` 可添加缓慢推近。图片中的标题和说明尽量用 `s.text` 叠加；插入后用 `still` 检查构图和裁切。更多选项见 `references/images-and-demos.md` 和 `references/scene-api.md`。

## 3. 默认决策（不用问用户）

外观、时长、声音、构图、措辞都由你决定。只在这几种情况问，并且一次问完：主题不清或关键事实核实不了；选定的配音服务或图片生成方式缺少必要配置；用户要的东西 explainroo 做不到（如实拍）。

| 项 | 默认 |
|---|---|
| 语言 | 跟随用户提问的语言。中文 → `zh` |
| 声音 | MiMo `冰糖`；用户指定时更换音色或配音来源 |
| 外观 `theme` | 通用科普 `paper`；产品/商业 `clean`；教学 `chalk`；工程架构 `blueprint`；开发者工具 `midnight`；历史/金钱/随笔 `editorial` |
| 尺寸 `size` | 横屏 `youtube`（B站同）；抖音/Shorts/TikTok/Reels 用 `tiktok`/`shorts`/`reels`；小红书/Instagram/LinkedIn 信息流用 `4:5` |
| 时长 | 约 5 分钟，按实际内容和用户要求调整；以 `voice` 报告的时长为准，通过增删旁白和调整留白控制总时长 |
| 字幕 | 竖屏、4:5、方图默认开启；横屏中文视频建议 `"captions": true` |
| 节奏 `pace` | 1.3，整体偏快；讲解密集或需要留时间看图时适当放慢 |

## 4. 出片流程

每一步拿到"验收"一栏的证据再往下走。

| # | 做什么 | 命令 / 产物 | 验收 |
|---|---|---|---|
| 1 | 收集事实 | 读用户给的代码、文档、网页，列出要用的事实和来源。只给了主题时，只讲公认常识；具体数字、年份、版本能联网就查证，查不到就不说 | 每个数字、引语都有出处 |
| 2 | 建项目 | `explainroo init <dir> --theme paper --size youtube --language zh --pace 1.3 --title "..."`。生成的 `script.md`、`scenes.js` 是英文占位示例，要**整份重写** | 生成 `video.json`、`script.md`、`scenes.js` |
| 3 | 配声音 | 按 2.3 节修改 `video.json` 的 `voice`，覆盖 init 写入的占位音色 | `voice` 是选定的声音，`pace` 默认 1.3 |
| 4 | 写旁白 | 先读 `references/writing-and-visuals.md`，再写 `script.md` | 字数符合目标时长 |
| 5 | 生成配音 | `explainroo voice <dir>` | 每场时长合理；**未确认的词逐个处理**（见下） |
| 6 | 规划画面 | 每场列出：哪个标记出现什么、放哪、何时离开；需要图片时按 2.6 节准备素材 | 同一事物跨场位置、颜色一致；图片已放入 `assets/` |
| 7 | 写画面 | 先读 `references/scene-api.md`，再写 `scenes.js`：一场一个函数，函数名 = 场 id | — |
| 8 | 检查 | `explainroo check <dir>` | 末行是 `N error(s), M other finding(s)`，warning 和 hint 都算在 M 里。要求 **0 error，且没有以 `WARN` 开头的行**；hint 自行判断 |
| 9 | 看图 | `still`（静帧）、`sheet`（联系表），用 Read 打开图片 | 见下方看图清单 |
| 10 | 出片 | `explainroo render <dir>`，耗时较长，用 Bash 的 `run_in_background`。`--draft` 只在用户想先看粗版时出 | `out/video.mp4`、`.srt`、`.vtt`、`.cover.jpg` 都在 |
| 11 | 复核 | `explainroo verify <dir>` | 输出只有时长、尺寸、响度、峰值、`narration understood: N%`，没有 PASS 字样。**退出码 0 且没有 `WARN` 行**才算通过；要看细项加 `--json` |

**第 5 步**：`voice` 报告某个词没确认，通常是读错了。用 `{显示|读音}` 修正后重跑，它只重做改过的场。中文按拼音比对，Whisper 写成同音字不算错，不用为此改句子。**中文旁白里念出来的拉丁字母缩写（HTTPS、API 等）几乎都确认不了**，`{HTTPS|H, T, T, P, S}` 也没用：改成中文说法（"加密的网站"），缩写只放画面上。没确认的词会在第 8 步变成 WARN。

`check`、`still`、`sheet`、`render`、`preview` 都会补做缺失的配音，所以**等 `voice` 跑完再运行它们，不要并行**。

**第 9 步看图**：

```bash
explainroo still <dir>                       # 每场最后一帧
explainroo still <dir> intro@2.5 12.0        # 指定时刻
explainroo sheet <dir> --scene intro         # 单场随时间变化
explainroo sheet <dir>                       # 整片联系表
```

图片在 `<dir>/out/`。逐张打开，像观众一样看：

- 字够不够大？有没有被裁切、互相压住？
- 是不是半个画面空着？联系表上是否每 2–4 秒都有新东西？
- **每场最后一帧是否完整**：短场景结束时自动镜头可能还停在特写，把标题或元素裁出画外。修法是该场第一行写 `s.camera([])`，或用 `{hold=…}` 拉长。
- 最后一帧能否概括全片？

有问题就改，再 `check` 和 `still`，直到满意。`check` 只看得见文字和公式，形状、箭头、图标、`s.draw` 只能靠看图。

发到抖音、小红书这类小窗信息流时，再跑 `check <dir> --view-width 854`：在这个播放器宽度下可见文字小于 16px 会警告。它只查尺寸，不保证平台压缩后的效果，所以再看一张 `still <dir> --scale 0.4448`（约等于 480p）。画面上只留当前要点，字写大，细节用镜头推近。交付时提醒用户上传后把平台的低清版和原尺寸版都看一遍。

渲染因浏览器被关或 `EPIPE` 中断时，用 `render <dir> --workers 2` 重跑。

## 5. 写 `scenes.js` 前的三条铁律

完整的坑在 `references/scene-api.md` 末尾，这三条最常见：

- 每一帧都用新的 `s` 重新调用场景函数。**元素必须每次都调用**，用 `at` / `out` 控制显隐，绝不能写 `if (s.t > 3) s.box(...)`，也不要在调用之间存变量或用计时器。
- 中文旁白里**优先用 `[#标记]` 绑定画面**，`at: '词'` 必须正好匹配分词后的整词。
- `at` 不能晚于本场结束；需要更长就在脚本场名后加 `{hold=2}` 或 `{min=6}`。

## 6. 交付

全部通过后告诉用户：

- 成片路径 `<dir>/out/video.mp4`，以及同名的 `.srt`、`.vtt`、`.cover.jpg`、`.chapters.txt`（有章节时才有）
- 时长、尺寸、外观、用的声音（MiMo / ElevenLabs 要说明产生了付费调用）
- `verify` 的结论
- 你**没能检查**的部分（声音听感、配乐是否合适），请用户自己看一遍

`draft.mp4` 是半分辨率草稿，不能当成片交付。右下角默认有 `explainroo.com` 水印，用户问起时告诉他们可以在 `video.json` 里设 `"watermark": false` 或改成自己的文字。
