# Project Copilot Instructions

## Core Quality Rule

- 本项目所有功能迭代与缺陷修复必须遵循：**逻辑严谨、用户体验好**。

## Product Mission (Lightweight Couple App)

- 产品核心：情侣轻互动 + 回忆沉淀。
- 抽奖是激励子模块，不是首页主流程。
- 首屏必须包含：
  - 恋爱计时（第 N 天 + HH:mm:ss）
  - 全屏相册背景图（有可读性遮罩）

## IA / UX Constraints

- 一级导航保持 4 项：`今天`、`回忆`、`任务`、`我的`。
- 设计保持轻量：一屏一重点，避免信息过载。
- 优先保证可读性：背景图上方文字必须清晰。

## Engineering Standards

- 业务逻辑优先保证正确性与一致性：
  - 明确边界条件与异常路径。
  - 防止并发/重复提交导致状态错乱。
  - 输入必须做类型与范围校验。
- 用户体验优先保证可感知反馈：
  - 异步操作提供加载态与禁用态。
  - 失败信息可理解、可操作，不使用模糊报错。
  - 关键操作（保存/重置）提供确认与结果提示。

## Architecture Rules

- 页面负责组装，业务逻辑放入 `modules/*/useXxx.ts`。
- API 调用集中在 `modules/*/api.ts`。
- 优先小步重构，不做一次性大改。
- 无明确要求时，避免引入 breaking changes。

## Change Expectations

- 代码改动应小步可验证。
- 修改后必须进行类型检查与构建验证。
- 避免引入与需求无关的重构或样式噪音。

## Preferred Delivery Format

每次开发输出默认包含：

1. 改动说明
2. 文件清单
3. 验证方式
4. 下一步建议（<= 3 条）
