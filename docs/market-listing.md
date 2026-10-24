# DSH 工作台市场材料

本项目对应工作台市场 `dataelement/awesome-dsh-workbench`。材料依据 2026-10-24 查阅的[官方验收规范](https://dshdesktop.com/workbench/docs/market-acceptance/)、[开发规范](https://dshdesktop.com/workbench/docs/development/)及市场仓库的 [catalog/README.md](https://github.com/dataelement/awesome-dsh-workbench/blob/main/catalog/README.md)准备；正式提交时应再核对其当前版本。

## 已准备的材料

- 条目草稿：[aloneatwar__dsh-explainroo.yml](../.github/market/aloneatwar__dsh-explainroo.yml)。正式投稿目标为市场仓库的 `data/workbenches/aloneatwar__dsh-explainroo.yml`，无需给新工作台增加 `workbenchId` 或注册 `id`。
- 安装契约：仓库根目录一个工作台，MIT 许可，完整 SemVer、repository、bundle patch、真实 Client 导出与 `dsh-desktop-workbenches` 注入均已声明。
- 依赖直接指向 Explainroo 原作者仓库的固定提交，扩展与中文兼容转换留在插件中。包中不携带上游源码、字体或示例。
- 本机安装与打开证据：已从正式 v0.8.1 Release 下载地址安装，Windows x64，Desktop 0.12.0 / Harness 0.2.0-rc.2。完整检查及验证边界见 [verification.md](verification.md)。
- 三张真实产品截图，均为 JPEG、2032 × 1315，最大 185143 字节，符合数量、格式、2 MiB 单图大小与 16M 像素限制。第一张作为封面；16:9 为官方建议，本轮保留实际窗口比例。

| 文件 | 内容 |
| --- | --- |
| [workbench.jpg](../.github/screenshots/workbench.jpg) | 原生对话、中文场景预览与对象属性 |
| [narration.jpg](../.github/screenshots/narration.jpg) | 旁白触发点、分镜说明和定位菜单 |
| [voice-settings.jpg](../.github/screenshots/voice-settings.jpg) | 原版 Kokoro 默认配音设置 |

图片与 YAML 放在 `.github/`，供公开仓库和市场读取，不随插件 tgz 分发。

## 发布与下载核验

代码、文档和截图已推送，标签 [v0.8.1](https://github.com/AloneAtWar/dsh-explainroo/releases/tag/v0.8.1) 已发布固定资产名 `dsh-explainroo.tgz`。正式下载地址可访问，包为 411481 字节，SHA-256 为 `c70f8cfaf154af8c39112e77f0768aafcf204ff5bf65fd6cee9d83521f778605`，与 GitHub 资产 digest 匹配。

已从条目中的正式 Release URL 在原生 Desktop 安装并重启，核对包内运行文件、上游引擎完整性和实际界面；三张截图的作者仓库 HTTPS 地址均返回 200。Windows / Linux、Node 22 / 24 的 CI 检查均通过。该验证覆盖正式安装来源，不等同于下方完整市场自测已完成。

## 正式投稿前

1. 按开发规范第 4–7 节补齐 0.8.1 的完整原生自测，尤其是窄窗口、目录选择取消、首次使用与无归属会话、多会话归属隔离、模式切换和卸载后数据保留。当前有自动测试与部分历史原生记录，不能把它们合并表述为本版本全部通过。
2. 正式提交前再次核对市场当前 schema、分类及规范；若修改产品画面或安装包，重新安装并更新对应截图与证据。
3. 向市场仓库只新增自己的 YAML 条目。PR 描述写明用途、实际验证的平台与 Desktop 版本、最终安装来源，以及下方依赖和数据说明；以该 PR 最新提交实际执行的检查为准。

v0.8.1 已发布并完成正式来源的本机复装。市场条目保留为草稿，尚未创建收录 PR。

## 投稿说明需要披露的内容

Explainroo 0.4.1 固定到 `e95232c8d535ed2aa390e7b1caee0d1326dd9e83`，安装需访问原作者的 GitHub 源码包。预览使用本机临时兼容副本与回环服务；中文字体和本地配音模型首次使用可能需要下载。视频导出需要可用的 FFmpeg 和 Chrome / Edge。

视频项目保存在用户选择的目录，插件设置在用户目录的 `.dsh-explainroo/settings.json`。旁白预览和分镜图不调用 TTS；视频导出可能生成缺失配音，所选 MiMo / ElevenLabs 服务可能收费。API Key 由本机环境变量或项目 `.env` 提供，不写入工作台设置或插件包。仅声明已实测的 Windows x64；其他平台的原生体验需要独立验证。
