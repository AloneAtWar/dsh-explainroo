# DSH 工作台市场材料

本项目对应工作台市场 `dataelement/awesome-dsh-workbench`。2026-10-24 已核对[官方验收规范](https://dshdesktop.com/workbench/docs/market-acceptance/)、[开发规范](https://dshdesktop.com/workbench/docs/development/)及市场仓库的 [catalog/README.md](https://github.com/dataelement/awesome-dsh-workbench/blob/main/catalog/README.md)。

## 已准备的材料

- 条目文件：[aloneatwar__dsh-explainroo.yml](../.github/market/aloneatwar__dsh-explainroo.yml)。投稿目标为市场仓库的 `data/workbenches/aloneatwar__dsh-explainroo.yml`，无需给新工作台增加 `workbenchId` 或注册 `id`。
- 安装契约：仓库根目录一个工作台，MIT 许可，完整 SemVer、repository、bundle patch、真实 Client 导出与 `dsh-desktop-workbenches` 注入均已声明。
- 依赖直接指向 Explainroo 原作者仓库的固定提交，扩展与中文兼容转换留在插件中。包中不携带上游源码、字体或示例。
- 本机安装与打开证据：已从正式 v0.8.2 Release 下载地址复装，Windows x64，Desktop 0.12.0 / Harness 0.2.0-rc.2 / 内置 Node.js 24.17.0。完整检查及验证边界见 [verification.md](verification.md)。
- 三张截图均在上述正式安装版本实拍，使用自有中文示例和空白原生对话，不含私人会话或机器路径。JPEG 为 904 × 905，最大 79579 字节，符合格式、2 MiB 单图大小与 16M 像素限制。本轮保留实际窗口比例，未合成或改写产品界面。

| 文件 | 内容 |
| --- | --- |
| [workbench.jpg](../.github/screenshots/workbench.jpg) | 原生对话、中文场景预览、旁白和时间线 |
| [narration.jpg](../.github/screenshots/narration.jpg) | 展开的连续旁白与触发点编辑 |
| [voice-settings.jpg](../.github/screenshots/voice-settings.jpg) | 原版 Kokoro 默认配音设置 |

图片与 YAML 放在 `.github/`，供公开仓库和市场读取，不随插件 tgz 分发。

## 发布与下载核验

标签 [v0.8.2](https://github.com/AloneAtWar/dsh-explainroo/releases/tag/v0.8.2) 已发布固定资产名 `dsh-explainroo.tgz`。正式下载地址可访问，包为 412864 字节、38 个文件，SHA-256 为 `242e7705abc794d948d5ab63bf84f52fa465518e4bf344aedabc9a584d1979c1`，与 GitHub 资产 digest 匹配。

使用当前 Desktop 内置 CLI 卸载本包，再从正式 v0.8.2 HTTPS 地址安装，安装使用 `--ignore-scripts`，随后执行 Desktop「应用 → 重启」。有效配置包含本插件层，「已安装」显示 v0.8.2，实际界面和后台均为 0.8.2，引擎 0.4.1 已就绪。正式包的 13 个运行文件与已检查构建及安装内容逐一匹配，外部引擎的 9 个上游文件哈希匹配。该 Release 提交的 Windows / Linux、Node 22 / 24 CI 均通过。

## 本机核验范围

| 范围 | 实际结果 |
| --- | --- |
| 无会话和空项目 | 未发送消息即可预览、使用设置；两个目录分别初始化零场景项目，从项目入口开始会话后保留当时的业务选择 |
| 分栏与侧栏 | 展开、收起及约 280 像素业务分栏均有实测；长中英文标题、标识、数字和时间可读，场景横排，方向键和 Enter 调整宽度可用 |
| 目录取消与错误恢复 | 系统选择器取消后设置及文件不变；不存在的路径保存被拒绝，原设置字节不变，也没有创建该目录；可以重选已有位置 |
| 原生会话 | 同一资料目录分别创建原生、Explainroo 和 Oil 会话并切换；返回 Explainroo 可恢复其草稿。跨目录后通过项目入口恢复已关联会话，草稿仍在 |
| 卸载与重装 | 卸载前后，原目录 189 个源文件、状态和历史文件，以及验收目录 72 个文件哈希不变；正式来源复装后可恢复原生草稿 |
| 用户环境恢复 | 原工作台目录和默认引擎设置已恢复，原有 12 场项目继续可预览，MiMo 音色保留；最终原目录 189 个文件与初始快照一致 |

会话身份、筛选、收藏和笔记由 Desktop 管理。切换工作区进入的新空白页不等于打开原来的会话，草稿保留通过恢复已关联会话核验。本轮没有另外创建宿主收藏或独立会话笔记样本，不把这些样本的保留行为写成已实测。标准分栏不使用 `customFrame`。代理未自动发送消息或请求付费语音，其他平台的原生体验未验证。

## 收录进度

正式投稿只新增自己的一个 YAML，说明用途、平台、安装来源和下方依赖与数据位置。进度以[官方市场 PR](https://github.com/dataelement/awesome-dsh-workbench/pulls?q=is%3Apr+dsh-explainroo)及最新提交的实际检查为准；只有 PR 合并、目录更新且 Desktop 市场可见后才称为已上架。本机安装卡片不代表市场已收录。

## 投稿说明需要披露的内容

Explainroo 0.4.1 固定到 `e95232c8d535ed2aa390e7b1caee0d1326dd9e83`，安装需访问原作者的 GitHub 源码包。预览使用本机临时兼容副本与回环服务；中文字体和本地配音模型首次使用可能需要下载。视频导出需要可用的 FFmpeg 和 Chrome / Edge。

视频项目保存在用户选择的目录，插件设置在用户目录的 `.dsh-explainroo/settings.json`。旁白预览和分镜图不调用 TTS；视频导出可能生成缺失配音，所选 MiMo / ElevenLabs 服务可能收费。API Key 由本机环境变量或项目 `.env` 提供，不写入工作台设置或插件包。仅声明已实测的 Windows x64；其他平台的原生体验需要独立验证。
