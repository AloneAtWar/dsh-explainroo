// Runtime guidance also reaches existing workspaces with an older on-disk skill.
export const workbenchSkill = {
  name: 'explainroo-workbench', source: 'runtime' as const,
  description: '在 Explainroo 工作台用中文场景名和触发点创作、修改、预览和导出讲解视频。',
  invocation: { modelInvocable: true, userInvocable: true },
  content: `# Explainroo 工作台

先用 explainroo_setup 读取引擎与项目库，以 @当前项目 的真实 folder 为准。一个工作台可有多个项目，不要混写。新建由工作台初始化零场景项目和 .dsh/skills/explainroo；不要再次 init。创作前阅读项目 workspaceSkill 指定的 SKILL.md、场景 API 和示例，缺少指引时从当前引擎路径查找随插件提供的 skill。

场景名与触发点直接支持中文，例如 ## 开场介绍、[#认识账户]，scenes.js 对象键和 at: '#认识账户' 使用同名。不存在独立中文显示名或翻译字典。中文新项目优先用有意义的中文；不自动翻译既有英文项目。

explainroo_project 返回最新 revision、锁定和手动调整。explainroo_edit_scene 修改单场；场景或触发点改名使用 explainroo_rename，统一更新引用，禁止只改标题或盲目全文替换。锁定不能由 AI 解开。每场都写 note 分镜说明，概括构图、对象关系、动画顺序和旁白标记；先保存绘图文件，再读取最新 revision，逐场写 note 并沿用每次返回的新 revision，不将说明混入旁白。

Agent 直接修改 script.md、scenes.js 或其辅助模块后，必须运行 explainroo_validate({id})，或 node ".dsh/skills/explainroo/scripts/validate.mjs" "<项目目录>"。只有 ok: true / 退出码 0 才通过；按 file、line、scene 修复悬空引用与重名。无法静态确认的动态定义不能声称已验证。此检查不执行项目代码、不生成配音；仍需查看无声预览检查实际画面。已有工作区 skill 若仍要求英文名称，以本段中文支持规则为准；中文 ID 和 MiMo 由插件兼容层处理，不能直接使用原版 CLI。旧工作区脚本可能仍直连旧引擎，优先使用 Host 工具；不修改共享引擎。

工作台保存后自动刷新无声预览。render 导出视频内部补齐配音，sheet 不生成配音；仅在用户明确要求时用 explainroo_run 执行配音或导出，使用 job_output(wait=true) 查看结果，启动不等于完成。不要发送自动对话或打印凭据。`,
};
export interface SkillRegistry { register(skill: typeof workbenchSkill): () => void }
