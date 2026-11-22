# 更新日志 (Changelog)

本项目基于本地 Git 历史与工作区发布记录整理。

## [v2.3.0] - 2026-11-22

### 新增与扩展
- **排行榜、黑马榜与段位系统**：新增 `src/services/ranking-helper.js`，在学生端与教师端新增 `/leaderboard`、`/leaderboard/settings`、`/leaderboard/reset-darkhorse` 接口，支持积分总榜、按周/自定义周期统计的黑马榜以及段位成长计算。
- **每日签到与全班加分**：学生端新增 `/checkin` 每日签到接口与对应交互；教师端新增 `/class-bonus` 全班统一加分接口与界面操作。
- **个性化装扮与场景资源**：在 `skins-catalog.js` 与 `themes.css` 中扩展背景、头像框、称号与饰品系统，学生端新增对应购买与装备路由（`/background/buy`、`/background/equip` 等）。将原有 3 张 SVG 场景替换为 9 张 PNG 场景图（`aurora_snow`、`cloud_bakery`、`cyber_lab`、`cyber_maker`、`esports_room`、`magic_cloud`、`mecha_hangar`、`sakura_picnic`、`starry_treehouse`）。

### 改进与重构
- **统一控制台与部署脚本**：新增 `scripts/console.ps1` 与 `scripts/ConsoleLauncher.cs`，整合原先分散在根目录的多个 `.bat` / `.vbs` 启动与服务管理脚本，移除旧脚本与旧版 `index.html`，同步更新 `使用说明.txt`、`scripts/upgrade_deploy.ps1`、`scripts/build_update_pack.ps1` 与 `scripts/install_and_start.ps1`。
- **前后端联动与同步**：更新 `student.js`、`teacher.js`、`data-store.js`、`score-helper.js` 与 `ws/broadcaster.js`，适配新增排行榜、签到、装扮与全班加分状态同步。

## [v2.1.0] - 2026-11-19

### 修复与改进
- 修复拜访同学获取经验无限制的问题，增加 2 秒操作冷却限制。
- 完善自动合并升级脚本（升级时保留本地 `data/` 数据目录）。
