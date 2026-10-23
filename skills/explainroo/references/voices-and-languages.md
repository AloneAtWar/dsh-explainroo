# 配音与语言

Kokoro、ElevenLabs 和外部录音由原版 Explainroo 提供，配置方式见 [上游指南](upstream-guide.md)。MiMo 由 DSH 插件接入，以外部音频交给原版录音入口。

优先沿用项目 `video.json` 中的语言、provider、音色、模型及录音来源，不因打开设置而切换 provider。新建项目和插件示例不指定 `voice`，由原版按语言选择默认音色；当前中文为 Kokoro `zf_xiaobei`。MiMo 需要用户主动选择，已有 MiMo 项目仍保留原设置。

MiMo 密钥使用本机 `MIMO_TTS_API_KEY` 环境变量，或放在视频项目的 `.env` 中。兼容旧的 `MIMO_API_KEY` 名称。不要把密钥写入 `video.json`、引用、对话或仓库。ElevenLabs 使用 `ELEVENLABS_API_KEY`。

MiMo 的音色、模型、主机名和风格描述通过工作台设置，支持 `mimo-v2.5-tts` 和项目原有配置。MiMo 可能收费；仅在用户明确请求配音或视频导出时运行。

插件按讲稿的实际读音生成每个语音块，插入停顿并应用语速，随后由原版引擎规范化音频、识别词级时间、生成字幕和渲染。无声预览不请求语音服务或下载语音模型。

录音项目仍遵循原版按文件或按场景输入的约定。原始录音场景改名需先迁移录音文件；工作台不会擅自改变用户录音。
