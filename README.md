# 平安京 · 对弈竞猜

阴阳师非官方同人首页，包含式神阵容、模拟竞猜、本地记录、模拟结算和对弈手帖，适配手机与桌面。

目标访问地址：https://sakuramanordd-wq.github.io/match-betting/

## 本地开发

需要 Node.js 24：

```bash
npm ci
npm run dev
```

## 验证

```bash
npx playwright install chromium
npm test
npm run build
npm run preview
```

测试覆盖金额限制、重复提交、重复结算、刷新持久化、重置确认、存储异常、图片加载、对局筛选及手机/桌面布局，并检查生产项目子路径。

## 部署到 GitHub Pages

1. 首次在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。
2. 推送至 `main`；`.github/workflows/pages.yml` 自动测试、构建并发布。
3. 在 Actions 检查 `Deploy GitHub Pages` 成功，再访问目标网址。

若首次发布时 Pages 未开启，请开启后在 Actions 页面重新运行失败的工作流。

## 功能与边界

- 初始 1,000 枚模拟勾玉，每场限一次，可投入 10–500 枚整数勾玉。
- 「我的竞猜」可主动模拟结算。命中返还 2 倍投入（含本金），否则不返还。
- 阵容、支持率、收益和赛果均为预设演示，不接入实时游戏数据。
- 记录保存在当前浏览器；可重置，不跨设备同步。无登录、充值、提现或真实交易。
- 本站与网易无关联；图片来自阴阳师官网，版权归网易及原作者，素材来源见 [ASSETS.md](./ASSETS.md)。

迭代请阅读 [Agent.md](./Agent.md)，自动化 Agent 入口为 [AGENTS.md](./AGENTS.md)。
