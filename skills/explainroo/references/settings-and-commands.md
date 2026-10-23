# 设置与命令

尺寸、主题、字幕和配音方式通过工作台设置或 `video.json` 维护。原版引擎配置的完整说明见 [上游指南](upstream-guide.md)。

工作区脚本调用 DSH 插件适配层，支持 `voice / check / sheet / render / validate <项目目录> [--json]`。`doctor / voices / themes / formats / icons` 转发原版只读查询；`doctor --fetch` 会下载模型，需要明确请求。其他参数不自动透传。

中文 ID 和 MiMo 项目必须通过工作台工具或插件脚本执行。直接调用原版 CLI 不理解这些插件扩展。预览使用工作台；分镜图使用 `sheet`，两者都不生成配音。
