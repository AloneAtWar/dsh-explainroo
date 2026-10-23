---
name: explainroo
description: 在 DSH 工作区创作支持中文场景名、触发点与分镜说明的讲解视频；用于 explainroo 视频、科普动画、教程和产品演示。
version: 1.3.0
---

# Explainroo 视频创作

一个工作台可包含多个项目：新项目位于 `projects/<项目目录>/`，也兼容工作区根目录及其直接子目录中的旧项目。以 `@当前项目` 的 `folder` 为准，先用 `explainroo_setup` / `explainroo_project` 确认目标，不要把不同项目写在一起。已初始化的项目包含 `video.json`、零场景的 `script.md` 和 `scenes.js`，不要再次运行 init，也不要用占位故事冒充用户内容。

## 在 DSH 中创作

1. 根据本次主题和目标受众写旁白，按需查证事实。先读 [旁白与画面原则](references/writing-and-visuals.md)。**场景名和触发点直接支持中文**：中文项目优先写 `## 开场介绍`、`[#认识账户]`，画面对象键与 `at: '#认识账户'` 使用同一名称；不建立英文 id 到中文显示名的对照表。英文旧项目继续兼容，不因新规则自动改名。
2. 每个场景都要写分镜说明：概括画面构图、对象关系、动画顺序和对应的旁白标记。它是可编辑的视觉备注，不是朗读内容，不能混进 `script.md` 旁白。先保存场景文件，再用 `explainroo_project` 取最新 revision，逐场调用 `explainroo_edit_scene({id,sceneId,revision,note})` 写入；每次写入后使用返回的新 revision。修改场景后同步更新说明，锁定场景保持不动。具体格式见 [分镜说明](references/storyboard-notes.md)。
3. 写画面前读 [场景 API](references/scene-api.md)，参考 [中文示例](examples/chinese-demo/scenes.js)。`scenes.js` 默认导出的每个方法名必须对应场 id。每帧都调用绘图方法，用 `at` / `out` 控制显隐；需要手动调整的对象给稳定的 `id`。
4. 文件保存在当前项目，插图放 `assets/`。DSH 工作台自动刷新并展示无声预览；不需要先生成配音。
5. 修改已有项目时先调用 `explainroo_project` 核对 revision、锁定和覆盖。用 `explainroo_edit_scene` 修改单场旁白、说明或已有对象，保留其他场景和标记。不解锁用户场景，不覆盖 `.explainroo/studio.json` 或历史。
   场景或触发点改名使用 `explainroo_rename`，由工作台统一修改讲稿、画面代码、封面、手动调整与可复用配音缓存。不要只改标题或通过全文替换改名。动态生成或多场共享的引用可能被拒绝；先改成可明确定位的场景内引用，再重新验证。
6. 用户要求导出视频时可调用 `explainroo_run` 的 `render`，内部会补齐缺失或过期配音再渲染，导出请求包含这一步授权。`sheet` 导出当前画面的分镜图，不生成配音；界面右上角导出完成后进入系统保存流程。不要在日常创作、无声预览或分镜图导出中主动生成配音。后台 Jobs 仍可用 `job_output(wait=true)` 查看结果或 `job_kill` 取消，启动不等于完成。

`@当前项目` / `@当前场景` 携带项目真实位置与最新画面状态。项目不在当前库时先用 `explainroo_setup` 配置用户明确选择的目录。工具缺失时直接维护项目文件，并说明当前环境缺少工作台能力。

## 引擎与命令

Explainroo 是插件固定提交的原版外部依赖。技能仅包含 DSH 指引、中文参考和自有示例，不复制引擎或字体。安装技能时从依赖读取上游指南，存入 `references/upstream-guide.md` 并保留原许可。`engine.json` 记录插件与引擎位置；迁移机器后需更新技能位置，不复制密钥或 `node_modules`。

在当前工作区执行：

```sh
node ".dsh/skills/explainroo/scripts/explainroo.mjs" doctor --json
```

工作区脚本调用插件适配层，支持 `voice / check / sheet / render / validate <项目目录> [--json]`，以及 `doctor / voices / themes / formats / icons` 查询。上游指南中的其他命令和参数不自动透传。中文 ID 和 MiMo 项目必须经插件适配；不要直接调用原版 CLI，也不要修改引擎。原版示例可从 `engine.json` 的 `engineRoot/examples/` 读取。

- [配置与命令](references/settings-and-commands.md)：尺寸、字幕、主题、透明视频等。
- [声音与语言](references/voices-and-languages.md)：MiMo、ElevenLabs、真人录音和多语言。
- [图片与产品演示](references/images-and-demos.md)：插图、截图、UI 场景和鼠标。

默认中文、30 fps、pace 1.3；配音优先保留项目配置，未指定 voice 时沿用原版 Explainroo 的语言默认音色（当前中文为 Kokoro zf_xiaobei）。MiMo 是可选插件扩展，不强制作为默认值；画幅和主题以项目配置及用户选择为准。MiMo / ElevenLabs 可能收费，仅在用户要求配音或导出视频时调用。不要打印或询问密钥明文；凭据沿用引擎的环境变量和本机配置。本插件的 sheet 和无声预览不生成配音，check 要求已有有效配音；voice 和 render 包含明确的配音动作。原版 CLI 可能隐式补配音，不用于无声检查。

**每次 Agent 直接修改讲稿或画面文件后，交付前执行 `explainroo_validate({id})`，或运行下方无声验证脚本。必须得到 `ok: true` 和退出码 0；报错时按 file、line、scene 修复缺失场景函数、重复名称或悬空触发点。无法静态确认的动态定义不等于通过。**

```sh
node ".dsh/skills/explainroo/scripts/validate.mjs" "<视频项目目录>"
```

脚本不执行项目 JS、不生成配音。它检查引用关系，不替代实际画面验收。仍需查看画面并检查裁切、重叠、字幕与短场末帧；配音后修复未确认词并检查时长。报告实际生成路径和验证结果，区分无声预览、草稿与最终成片。中文命名和迁移规则见 [中文命名与引用验证](references/chinese-names.md)。
