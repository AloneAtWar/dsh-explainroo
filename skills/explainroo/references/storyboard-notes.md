# 分镜说明

每个场景保存旁白、画面代码和分镜说明。说明写给创作者与后续修改它的 DSH，不作为配音或字幕。

说明应覆盖当前画面的空间布局、主要对象之间的关系、入场与连接顺序，以及使用的 `[#标记]`。根据场景复杂度写一段简洁的中文，不机械重复旁白。

示例：`[#account] 中央出现账户卡；[#all] 下方从左到右展开余额、代码和状态三个字段，以短线连接主卡；[#only] 其他对象淡出，主卡保留强调框。`

先完成 `script.md` 和 `scenes.js`，再读取 `explainroo_project({id})`。对每个未锁定场景调用 `explainroo_edit_scene({id,sceneId,revision,note})`，下次修改使用刚返回的 revision。已有手动说明应与用户意图一致，不用统一模板覆盖。修改构图或动画后同时更新该场的说明。

工具缺失时，读取并保留 `.explainroo/studio.json` 的现有内容，仅合并相应 `scenes[sceneId].note`，保留 version、stage、appearance、锁定、其他场景与 elements；递增 revision。文件不存在时结构为 `{"version":1,"revision":1,"stage":"storyboard","scenes":{"intro":{"locked":false,"note":"分镜说明","elements":{}}}}`。不要重写用户的历史文件。
