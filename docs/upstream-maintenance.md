# 原版 Explainroo 与维护

从 0.8.0 起，Explainroo 使用官方仓库固定提交的源码包作为运行时依赖。当前为 0.4.1，commit `e95232c8d535ed2aa390e7b1caee0d1326dd9e83`。来源、版本和关键文件 SHA-256 在 `upstream.json`，完整归档的 integrity 在 `package-lock.json`。

Git 仓库和插件 tgz 只包含 DSH 实现、自有示例和指引，不包含引擎、字体或上游示例；安装时由包管理器获取依赖。不使用安装脚本打补丁，不修改 `node_modules/explainroo`。首次安装需能访问官方源码包 URL。DSH 自身仍为 peer 依赖。

## 功能边界

- `src/host/compat/`：插件自己的 Unicode 解析适配、静态引用检查、改名和 MiMo 接口。上游解析器及其余实现不复制到插件。
- `src/host/compatibility.ts`：读取原始项目，物化兼容副本。中文 ID 变为确定性 ASCII ID，只改语法中的真实引用，保留可见文字、颜色、讲稿和其他场景。封面、手动时序、录音文件名与配音元数据使用相同映射。
- `src/host/preview.ts`：无声预览、版本化模块 URL 和临时目录清理。不调用原版 `preview` 命令，因为该命令会补配音。
- `src/host/voice.ts`：在显式 voice/render 任务内生成 MiMo 音频，保留读音覆盖、停顿和语速。原版 recording provider 负责音频规范化和词级对齐。Kokoro、ElevenLabs 和用户录音由原版实现。
- `src/host/tasks.ts`：所有任务使用项目独立快照和自有 worker。原项目 revision 未变时，事务回写配音缓存，并恢复原 ID。过期结果留在任务副本，不覆盖新内容。
- `src/bridge.ts`：工作区脚本与 Host 共用适配层，避免中文/MiMo 项目误走原版 CLI。

原项目仍是唯一真源，不保存英文显示名映射。兼容副本中的映射是可重新生成的派生数据。动态场景定义、动态拼接触发点和无法静态确认的模块不会被猜测转换；先改为显式引用再验证。

## 升级流程

1. 审阅官方提交与变更，选择准确的完整 commit。普通启动和安装不会自动跟随 main。
2. 修改 `package.json` 的 explainroo 源码包 URL，仅替换其中提交值。
3. 运行 `npm install --package-lock-only --ignore-scripts`，再运行 `npm ci --ignore-scripts`，确保依赖来自该归档，不能从被手动修改过的安装目录记录基线。
4. 运行 `npm run upstream:record -- <完整提交SHA>` 更新版本和关键文件哈希；人工审阅 `upstream.json` 与锁文件。
5. 运行 `npm run check`，检查实际 tgz；使用中文旧项目验证预览、导出、改名、锁定、撤销、缓存保留和取消。不使用真实付费请求作为自动测试。
6. 在目标 Desktop 安装最终包，记录版本、平台、真实界面和失败恢复后，才发布插件新版本。引擎接口变化集中修改插件适配层。

哈希校验用于发现依赖被改写；记录新哈希本身不代表兼容验证通过。若通用能力已被上游接收，可逐步缩小对应适配逻辑。

## 旧项目与安装

原始中文文件、`video.json` 中的 MiMo 配置和 `.explainroo/studio.json` 无需英文化。已确认有效的旧配音可复用。录音项目改名仍需先迁移原始录音文件。

旧的自定义工作区 skill 不自动覆盖。旧脚本可能直接调用旧引擎；优先使用插件 Host 工具。备份自定义指引后移走旧 skill 目录，再调用插件的 `installSkill({id})` 远程服务安装新版本；当前界面没有独立的替换按钮。新的 skill 记录插件与引擎位置，迁移机器或移除插件后需要重新定位。

浏览器开发预览与 Desktop 安装是独立验收项。0.8.0 的浏览器和引擎验证不继承 0.7.2 的原生安装结论。原生安装按 README 的 tgz 流程进行；不在正在使用的宿主会话中擅自重启应用。
