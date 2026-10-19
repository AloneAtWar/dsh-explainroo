# 配音与多语言视频

本技能默认使用小米 MiMo。本文件补充 MiMo、ElevenLabs、真人录音的配置，以及多语言视频的旁白和校对细节。

## API 密钥的查找顺序

MiMo（`MIMO_TTS_API_KEY`）和 ElevenLabs（`ELEVENLABS_API_KEY`）的密钥按以下顺序查找，先找到的生效：

1. 环境变量；
2. 视频项目目录下的 `.env` 文件；
3. 程序目录下的 `.env` 文件。程序目录就是技能里的 `app/` 文件夹（与 `package.json` 同级）。

`.env` 里写成 `MIMO_TTS_API_KEY=...` 或 `ELEVENLABS_API_KEY=...` 的形式。

安全要求：

- 绝不要把密钥打印出来，也不要写进脚本、提交记录或日志。
- `.env` 不能进 git。

## ElevenLabs

ElevenLabs 会从用户账户扣费，并且会收到脚本文本。如果用户想用但还没有密钥，就请用户提供一个 elevenlabs.io 的 API 密钥，按上一节的方式配置。

查看该密钥可用的音色：

```bash
explainroo voices videos/<name> --elevenlabs
explainroo voices videos/<name> --elevenlabs --json
```

列表会给出该密钥可用的音色名称、id 和标签。把 id 填进 `video.json`：

```json
"voice": { "provider": "elevenlabs", "id": "JBFqnCBsd6RMkjVDRZzb", "model": "eleven_multilingual_v2" }
```

- `model` 可省略，默认 `eleven_multilingual_v2`。
- `voice` 命令会报告用掉的字符数。每次请求都记录在 `build/voice/elevenlabs-usage.jsonl`，记录里不含密钥和脚本文本。
- 语速取 `speed` × `pace`，并限制在 0.7 到 1.2 之间。触发这个限制时，`voice` 命令会提示。

## 小米 MiMo

MiMo 同样付费，并且会收到脚本文本。使用 `MIMO_TTS_API_KEY` 配置密钥，缺少时请用户提供。绝不要打印密钥。

```bash
explainroo voices --mimo
```

`voices --mimo` 列出内置音色，不会调用 API。把 id 填进 `video.json`：

```json
"voice": { "provider": "mimo", "id": "冰糖", "style": "清晰、利落" },
"pace": 1.3
```

- `model` 默认 `mimo-v2.5-tts`。
- `host` 默认 `api.xiaomimimo.com`，只写主机名，不带 `https://`。
- `style` 是一句简短的风格指令，不会被念出来。省略时使用该音色的正常表现。
- MiMo 本身没有语速参数。`speed` × `pace` 是在音频返回之后再调整节奏。
- `voice` 命令会报告用掉的字符数。每次请求都记录在 `build/voice/mimo-usage.jsonl`，不含密钥和脚本文本。

## 真人录音

也可以由用户自己录旁白：找个安静的房间，照着 `script.md` 原样朗读。

整段视频录成一条，放在 `assets/` 里：

```json
"voice": { "provider": "recording", "src": "assets/narration.m4a" }
```

或者每个场景一个文件，放在一个文件夹里：

```json
"voice": { "provider": "recording", "src": "assets/narration/" }
```

- 按场景分文件时，每个有旁白的场景都需要一个 `<scene-id>.<ext>`，例如 `intro.wav`。
- 支持的格式：wav、mp3、m4a、aac、flac、ogg、opus。
- 文件必须在 `assets/` 内，路径里不能有 `..`。

处理方式：

- 整条录音会依据 `script.md` 里的文字切分到各场景，每段切口在语音前后各保留约 0.15 秒。场景内部的停顿保持原样。
- 场景之间的间隔由该场景的 `lead` 和 `hold` 加上。
- 录音会转成单声道并调整音量；采样率保留，最高 48 kHz。
- 修改 `pace` 或显式设置 `speed` 会改变录音的节奏，但不改变音高。

限制与注意：

- `[pause]`、`sentenceGap`、`paragraphGap` 不会给录音插入静音。
- 标记 `[#name]`、字幕、cue 和 `{shown|spoken}` 照常可用。
- 如果语音校对报告不一致，应修改 `script.md`，让它和实际念的内容一致。
- 替换某个场景的录音文件，只会重新生成该场景；替换整条录音，会重新生成它覆盖的所有场景。

## 其他语言的视频

在 `video.json` 里设置 `language`，可选 `en`、`es`、`fr`、`it`、`pt-br`、`hi`、`ja`、`zh`，默认英语。`pt-br` 指巴西葡萄牙语，`zh` 指普通话。也可以在创建时指定：

```bash
explainroo init videos/my-video --language es
```

创建后仍需按技能的配音配置设置 `voice`。切换语言时，确认所选服务和音色支持目标语言。

### 撰写旁白

- 用该语言的自然说法写旁白，不要逐字翻译英文。前面的写作规则按其精神同样适用。
- cue 词和 `[#markers]` 用法相同，`at: 'qué'` 能匹配 "Qué"。
- 印地语句子可以用 `।` 结尾。
- 字幕和字幕文件保留书面文字。
- 各套外观（looks）自带印地语字体，不需要系统字体。

## 日语和中文

中文旁白中的拉丁字母缩写（如 HTTPS、API）容易无法通过语音校对。优先改用中文说法，缩写只放在画面上。

### 书写规则

- 照常写旁白，词与词之间不加空格。explainroo 会自己分词，所以 cue 词和标记都能用：`at: '解析'` 匹配「解析」这个词，`at: '名前の解析'` 这样的短语也行。
- cue 必须匹配完整的词。需要定位到某个词内部的时刻时，用 `[#marker]`。
- 句子以 `。`、`！` 或 `？` 结尾。

### 读音

- API、JavaScript 等拉丁词会按英语读。想要日语读法就写出来：`{API|エーピーアイ}`。
- 数字可以保留阿拉伯数字，包括 365.2422 这样的小数。
- 日语读音器偶尔会选错读法，例如把「一日」读成 ついたち（想读 いちにち 就写 `1日`），把グレゴリオ暦的「暦」读成 こよみ（写成 `{グレゴリオ暦|グレゴリオれき}`）。
- 语音校对标出某个词时，先把它听到的内容和脚本对比，再决定要不要改。

### 语音校对如何比对

Whisper 经常用同音的其他字写出一个词，所以语音校对比的是读音：

- 日语按假名读音比较，所以「世紀」被听成「正規」也算通过。
- 中文按不带声调的拼音比较，繁体和简体视为相同。
- 因此不要仅仅因为 Whisper 用了别的字就改写句子。

字幕：字幕和字幕文件中词与词之间不加空格，每行最多 18 个字符，绝不在词中间断行。覆盖写法（override）的显示文本要尽量短。

### 字体

各套外观的字体不含日文和中文字符。第一次运行 `voice`、`still` 或 `render` 时，会下载 Noto Sans JP 或 Noto Sans SC 的常规体和粗体（约 33 MB）并校验文件，保存到 `~/.cache/explainroo/fonts/`（或 `$EXPLAINROO_CACHE/fonts/`），之后所有外观、字幕和应用界面都会使用。首次下载完成后，`EXPLAINROO_OFFLINE=1` 就能正常工作。用 `export` 生成的网页播放器只保留视频里出现的字符，所以字体文件很小。

### Whisper 模型

非英语视频第一次做语音校对时，会下载多语言版 Whisper small。`doctor --fetch` 仍然只获取英语模型。`verify` 也会按视频语言检查成片的声音。

## 发音修正与数字（所有非英语语言）

- 如果某个符号、缩写或词念得不对，在 `script.md` 里用 `{shown|spoken}`，然后重新运行 `voice`。读音要用同一种语言写。
- 语音校对接受用阿拉伯数字表示的数字。在英语以外的语言中，它不会尝试把拼写出来的数字和阿拉伯数字对应起来。所以请直接写数字；如果有助于校对，也可以用一个 spoken 部分含数字的覆盖写法。

## 印地语的校对

印地语的语音校对能确认的词比其他语言少，因为语音模型对印地语掌握得较差。少量未确认的词是正常的。只有当某个词在多个场景里都未确认，或者用户听出来念错了，才需要修正。
