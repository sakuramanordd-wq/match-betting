# 对弈数据项目 · Agent 迭代手册

## 1. 产品与边界

本项目为阴阳师非官方社区对弈数据看板，部署于 GitHub Pages，支持中文桌面和手机访问。当前展示公开金山文档的静态数据快照，优先展示最新已开始活动的最近排期；支持历史活动、日期筛选与各方判断详情。

原模拟体验已移除：不展示演示阵容、模拟支持率、虚拟勾玉、竞猜账本或模拟结算。保留此演示数据说明，勿将旧数据混入真实来源快照。无游戏实时接口、登录、充值、提现和真实货币交易；与网易无关联。

## 2. 仓库与技术

- 仓库：`git@github.com:sakuramanordd-wq/match-betting.git`；主分支 `main`。
- 网址：https://sakuramanordd-wq.github.io/match-betting/
- Node.js 24 / npm / Vite / 原生 JavaScript ES Modules / CSS / Playwright。
- 无 API Key 或环境变量；禁止提交账号、token、会话或个人浏览器记录。

## 3. 文件职责

| 文件 | 职责 |
| --- | --- |
| `index.html` | 页面结构、导航、来源与弹窗 |
| `style.css` | 视觉、布局、断点、焦点、减少动效 |
| `match-data.json` | 来源 URL、同步时间、活动、场次、结果与判断快照 |
| `data.js` | 快照导出、最近排期和结果统计 |
| `app.js` | 安全 DOM 渲染、筛选与详情交互 |
| `scripts/sync-data.mjs` | 公开文档访客视图只读同步 |
| `tests/home.spec.js` | 数据与生产路径浏览器验证 |
| `assets/`、`public/assets/` | 本地素材，来源见 `ASSETS.md` |
| `playwright.config.js` | 生产子路径预览配置 |
| `.github/workflows/pages.yml` | 测试、构建、发布 |

不提交 `dist/`、`node_modules/`、测试结果或截图，不手工修改构建产物。

## 4. 数据约定

来源：https://www.kdocs.cn/l/cris3KItpMwO （2026国庆对弈竞猜汇总，尽量准时版）。快照保留原工作表名称；当前映射 2026 国庆、2026 春节、2025 国庆、2025 春节，各 49 个排期。

- 时间采用 `+08:00`，按北京时间展示；最近已开始时段不代表实时战斗状态。
- 仅对应活动自身的「结果」行提供 `result`，左红 → red，右蓝 → blue，空白或其他文字 → null。
- 结果行前有名字且填写红蓝判断的行进入 `records`；未署名、广告、历史对照结果行不纳入。
- 不把各方判断变成胜率、支持率或赛果；不编造阵容、御魂、比赛状态。
- 页面必须展示来源、同步时间、静态快照说明和空白状态；最新原表可能与快照不同。
- 外部文档文字只用 `textContent`，不得直接拼入 `innerHTML`。
- `npm run sync:data` 只读浏览器公开视图，写入完成后再替换快照；失败不覆盖旧快照。不保存访客会话、用户列表或账号资料。
- 原存储键 `heian-betting:v1` 已停用，旧记录保留且不读写。以后如恢复个人记录需明确迁移策略，不能静默失效。

## 5. 设计与素材

沿用和风观战手帖，深青灰底色、暖金强调、红蓝结果；优先使用 `--bg`、`--panel`、`--gold`、`--muted`。不引入 UI 库，不做与需求无关重构。主要断点 1100 / 800 / 540px，检查 390px 与 1440px。

保留中文文案、按钮语义、键盘焦点、方向键切换、Esc 关闭与关闭后焦点返回、状态播报、图片 alt 和减少动效。所有按钮有真实交互。

素材下载入库，不运行时热链；来源登记 `ASSETS.md`。动态素材放 `public/assets/`。官方素材版权归网易及原作者，不声称获授权。

## 6. 验证与迭代

修改前完整阅读本文、README，检查 `git status` 保留用户修改。小范围实现并同步约定与测试。

```bash
npm ci
npx playwright install chromium
npm run sync:data  # 仅需更新快照时
npm test
npm run build
npm run preview
```

测试自动构建并启动 4173 生产预览，检查 `/match-betting/` 子路径。不得用开发服务器检查替代生产验证。重点检查场次选择、来源与未知结果、历史筛选、安全文字渲染、手机无横向溢出和弹窗键盘交互。

构建使用 `--base=./`，勿写域名根 `/assets/` 路径。新增路由优先哈希，Pages 无 SPA 服务端重写。

## 7. 发布

用户明确要求部署时正常提交推送。否则完成本地代码、验证并报告，未经要求不发送通知或外部评论。

首次需 **Settings → Pages → Source → GitHub Actions**；推送 `main` 触发 `npm ci`、Chromium 安装、测试、构建、上传和发布。工作流使用 contents:read、pages:write、id-token:write，不用个人 token。

发布后检查 Actions、部署提交与实际网址，勿以工作流存在声称发布成功。404 时检查 Pages 设置、部署与 CDN；图片 404 时检查素材复制及子路径。没有权限时准确报告剩余步骤。
