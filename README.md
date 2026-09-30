# 平安京 · 对弈数据

阴阳师非官方社区数据看板，优先展示当前活动最近场次，支持按活动、日期查看历史结果与各方判断。保留原有和风页面，移除模拟竞猜、虚拟勾玉和结算功能。

数据来源：[2026国庆对弈竞猜汇总（尽量准时版](https://www.kdocs.cn/l/cris3KItpMwO)。当前收录 2026 国庆、2026 春节、2025 国庆、2025 春节，共 196 个排期。本站显示静态快照，页面标明同步时间；不接入游戏实时接口，空白不推断赛果，各方判断条数不代表胜率。

## 开发与同步

Node.js 24，执行：

```bash
npm ci
npx playwright install chromium
npm run dev
# 从公开文档只读提取，更新 match-data.json
npm run sync:data
npm test
npm run build
npm run preview
```

同步失败会保留原快照。同步脚本使用公开访客视图，不需要账号、密钥，不修改原文档。同步后检查差异、测试和构建，再随代码发布；访问网页不会自动请求金山文档。原表结构改变时更新脚本映射，勿将记录者的判断当作结果。

测试检查数据格式、当前时段、历史活动和日期切换、未知结果、详情弹窗与焦点、旧存档保留、390px/1440px 布局，并使用生产子路径 `/match-betting/`。

## GitHub Pages

目标：https://sakuramanordd-wq.github.io/match-betting/

首次设置仓库 **Settings → Pages → Source → GitHub Actions**。推送 `main` 自动触发测试、构建、发布；查看 Actions 确认结果。

旧版演示阵容、支持率、预设赛果不再展示；旧 `heian-betting:v1` 浏览器记录不读取、不改写。本站无登录、充值、提现或真实货币交易，与网易无关联；素材版权归网易及原作者，见 [ASSETS.md](./ASSETS.md)。维护约定见 [Agent.md](./Agent.md)。
