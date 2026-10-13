# 校园体验指南 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement the tasks below. Work within the existing local deployment; ownership is separated to protect classroom data and avoid conflicting edits.

**Goal:** 把原四站融入校园开放日接待任务，添加可跳过/重看的剧情图文，消除单个候选答案的视觉暗示。

**Architecture:** 新增story.mjs管理静态剧情、session已读键和原生dialog，story.css仅作用于剧情。app.mjs调用剧情入口并显示目标/结果；focus.mjs统一处理候选按钮中性引导；rpg.mjs在弹窗期间暂停键盘和移动。服务端与规则不变。

**Tech Stack:** 原生ES模块、dialog、sessionStorage、Node node:test、Playwright临时服务浏览器回归。

### Task 1: 先复现缺失行为

- [x] 新建tools/story-walkthrough.mjs，使用createService的临时runtime与虚构roster。
- [x] 在旧版/test检查story-dialog缺失；进入temp后检查#qAsk .chip.cta不为空。两项RED均已实际复现。
- [x] 扩充普通登录/刷新/身份、错误重试/IPO/排序、窄屏、剧情重看与返回的真实浏览器检查。

### Task 2: 独立剧情模块（story_module worker）

Files: public/story.mjs、public/story.css、tests/story.test.cjs。

- [x] 先写STORY内容/身份轮次隔离/无提前答案测试并观察失败。
- [x] 实现STORY与storySessionKey(student,round,chapter)。
- [x] 实现openStory(chapter,{student,round,once})，共用dialog与Promise，设置body.story-open，关闭时恢复焦点，重复打开安全。
- [x] 关键控件：#story-dialog、.story-continue、.story-skip；各站outcome用于结算。
- [x] 完成桌面并排与窄屏上下布局、滚动与图片失败降级，并运行测试。

### Task 3: 接入与中性提示（主代理）

Files: public/app.mjs、public/focus.mjs、public/rpg.mjs、public/index.html、public/style.css。

- [x] index引用story.css，地图提供#mission-status，HUD提供#story-replay。
- [x] app导入STORY/openStory；登录与恢复统一await enterCampus()；进站复用await openStory(id,{student,round,once:true})；关卡提供#stage-story；结算显示#story-outcome；主线完成展示complete。
- [x] focus将button.opt提升为所在题组目标，候选不添加cta，coach.neutral隐藏指示手，普通行动按钮继续高亮。
- [x] rpg在body.story-open期间清除按键、停止运动与interact。
- [x] 保持原body题目、条件、规则与提交函数。

### Task 4: 配图、验证与本地交付

- [x] 内置imagegen更新开场和阅读图片，保持其余三图，记录最终提示词和来源。
- [x] 运行npm test，运行tools/story-walkthrough.mjs，修复本次相关失败。
- [x] TypeScript/JavaScript reviewer只读审查；落实必要修复并重跑受影响检查。
- [x] 教师电脑当前局域网IP的8795/test入口走查开场、温度题中性状态、地图重看、完成结果，并保存安全截图。
- [x] 核对正式名单与课堂记录保留，报告当前局域网链接和已测范围；GitHub发布按后续明确授权执行。
- [x] 用户追加“继续”后补齐四站完整通关、最终剧情和20题错题路径：`tools/story-full-journey.mjs`，27项检查通过。

2026-10-12用户追加要求上传现有GitHub仓库。推送范围为本次源代码、剧情配图、测试与说明；真实名单、运行数据和备份保持本地。
