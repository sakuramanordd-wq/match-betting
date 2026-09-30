# 对弈竞猜项目 · Agent 迭代手册

## 1. 产品定位与当前边界

这是部署在 GitHub Pages 的阴阳师非官方同人竞猜首页，面向中文用户，支持桌面和手机访问。
当前版本是**静态模拟体验**：无后端、无登录、无真实游戏接口，无充值、提现和真实货币交易。
不得把演示阵容、支持率、预设赛果包装成实时游戏数据。涉及官方素材时保留来源记录与版权说明。

已实现：首页、状态筛选、五人式神阵容、竞猜弹窗、金额校验、浏览器记录、模拟结算、命中率、重置确认、规则与攻略弹窗。
初始 1,000 枚虚拟勾玉；每场限一次；投入 10–500 枚整数且不得超余额；命中返还 2 倍投入（含本金）。
赛果来自 `data.js` 的预设 `winner`，在用户主动点击「模拟结算」时结算，不存在实时战斗计算。

## 2. 仓库与环境

- 仓库：`git@github.com:sakuramanordd-wq/match-betting.git`
- 主分支：`main`
- 目标网址：`https://sakuramanordd-wq.github.io/match-betting/`
- Node.js：24；包管理器：npm；依赖版本以 `package-lock.json` 为准。
- 技术栈：Vite + 原生 JavaScript ES Modules + CSS；测试：Playwright。
- 不需要 API Key 或环境变量；禁止提交 token、SSH 私钥、用户个人记录。

## 3. 快速启动与验证

```bash
npm ci
npm run dev
# 首次浏览器测试安装
npx playwright install chromium
# Linux CI 缺少系统依赖时：npx playwright install --with-deps chromium
npm test
npm run build
npm run preview
```

开发默认端口 5173，预览默认端口 4173。测试自动构建并启动 4173 端口的生产预览，挂载到 `/match-betting/`，验证项目子路径。
不要把测试运行在开发服务器上代替生产路径检查。

## 4. 目录职责

| 文件/目录 | 职责 |
| --- | --- |
| `index.html` | 首页结构、SEO、导航、弹窗容器 |
| `style.css` | 色彩变量、布局、断点、动效、弹窗样式 |
| `data.js` | 式神映射、演示对局、攻略文章 |
| `state.js` | 初始状态、存档验证、竞猜与结算纯函数 |
| `app.js` | DOM 渲染、弹窗交互、浏览器存储、事件处理 |
| `assets/` | Vite 可静态分析引用的背景、攻略图、favicon |
| `public/assets/` | 由式神 ID 动态拼接的头像，构建时原样复制 |
| `ASSETS.md` | 网络图片原始 URL、用途、来源和版权 |
| `tests/home.spec.js` | 账本规则与浏览器交互测试 |
| `playwright.config.js` | 测试及项目子路径预览配置 |
| `.github/workflows/pages.yml` | 检查、构建与 GitHub Pages 发布 |
| `README.md` | 面向开发者的启动和部署说明 |
| `AGENTS.md` | Agent 自动读取的入口，指向本手册 |

`dist/` 是构建产物，不手动编辑、不提交主分支。`node_modules/`、测试结果与截图同样不提交。

## 5. 设计约定

- 风格：和风观战手帖；深青灰底色、暖金强调、红蓝队伍区分，克制使用卡片边框。
- 页面主文案全部中文；英文仅作为小字号装饰副标题。
- 全局变量在 `style.css` 的 `:root`，优先复用 `--bg`、`--panel`、`--gold`、`--muted`。
- 不引入无必要 UI 库；沿用已有 `primary`、`secondary`、`modal`、`match-card` 样式。
- 核心断点为 1100 / 800 / 540px；至少检查 390px 手机和 1440px 桌面。
- 保留键盘焦点、Esc 关闭弹窗、按钮语义、图片 alt、状态播报及减少动效设置。
- 所有按钮必须有实际交互；不能留下看似可点但无响应的入口。

## 6. 数据与账本约束

存储键是 `heian-betting:v1`，结构为：

```js
{
  version: 1,
  balance: 1000,
  bets: [{ matchId, side: 'red', amount: 100, status: 'pending', createdAt: 'ISO 时间' }]
}
```

- `placeBet()` 返回新状态，不原地修改传入值；扣款与追加记录在同一更新中完成。
- `settleBets()` 只处理 pending，重复调用不得重复发奖。
- `validateState()` 同时验证版本、对局 ID、金额、状态、赛果以及余额守恒；异常存档回退初始体验并提示。
- 余额守恒：初始余额减所有投入，加所有命中的 2 倍投入。
- `storage` 事件同步同源其他标签页；提交前刷新存档减少重复提交。localStorage 不提供事务，多标签页真正同时操作仍存在竞争；如加入真实账户必须移至后端事务。
- 当前记录仅属于浏览器，无法跨设备同步或防篡改。不要将此机制用作真实资产账本。
- 更改规则、对局 ID 或存储结构时，必须明确升级版本、迁移旧记录或提示重置；不能静默令用户记录失效。
- 新增实时数据时，先定义来源、更新时间、失败状态与后端协议，再替换演示数据标记。密钥不得放入前端。
- `innerHTML` 当前只拼接仓库内静态内容、经验证数字及枚举值。外部接口、URL 参数、用户文本必须用 `textContent` 或经严格清洗后渲染。

## 7. 素材和路径

- 网络素材下载后入库，不使用运行时热链。登记到 `ASSETS.md`。
- 动态图片放在 `public/assets/`，否则 Vite 无法通过动态字符串自动收集资源。
- 静态背景和 HTML 图片可以从 `assets/` 引入，Vite 会生成哈希文件名。
- 生产构建使用 `--base=./`。不要写 `/assets/...` 之类域名根路径，站点部署在 `/match-betting/` 下。
- 新增路由优先哈希路由。GitHub Pages 无服务端 SPA 重写，直接引入 history 路由会导致刷新 404。
- 官方原图版权归网易及原作者，不宣称已取得转载许可。商用或推广前另行确认授权，替换素材时同时更新版权记录。

## 8. 迭代流程

1. 先读本手册和 README，检查 `git status`，保留用户未提交修改。
2. 找到对应职责文件，明确需求是否影响演示边界、数据规则、存储兼容或发布路径。
3. 小范围修改；不因单次功能需求重构整个页面或引入新框架。
4. 涉及金额、结算、存储时先检查 `state.js` 并补充有意义的规则验证；涉及 UI 时检查生产预览。
5. 运行 `npm test` 与 `npm run build`，确认手机无横向溢出、头像加载、键盘及弹窗可用。
6. 变更产品规则、目录结构或部署方式时同步本文档、README 以及相关测试。
7. 用清楚的提交信息说明最终行为，发布后查看 Actions 和实际网站状态。

视觉微调无需写镜像 CSS 的测试，但必须进行对应宽度的浏览器检查。
未经用户要求，不发送通知、邮件或外部评论。用户已明确要求部署时，正常提交推送与发布可以继续。

## 9. GitHub Pages 发布

在 GitHub 仓库 `Settings → Pages → Build and deployment → Source` 选择 **GitHub Actions**（首次需要有仓库管理权限的账号设置）。

推送 `main` 后自动触发流程：`npm ci` → 安装 Chromium → `npm test` → `npm run build` → 上传 Pages artifact → 发布。
工作流权限为 contents:read、pages:write、id-token:write；通过 github-pages 环境部署，不使用个人 token。
可以在 Actions 页面手动运行 `Deploy GitHub Pages`，但必须有权限。

故障排查：
- Pages 未启用：先完成上面的 Source 设置；SSH 能推代码不代表能修改 Pages 设置。
- workflow 失败：查看第一个失败步骤，不以工作流文件存在作为成功部署证据。
- 图片 404：检查 `public/assets/` 是否存在、构建是否复制及项目子路径是否正确。
- 发布成功但短暂访问 404：检查部署状态与 CDN 传播后再次访问。
- 页面显示旧版本：比对源码提交、部署提交与浏览器缓存；检查推送是否发生在 main。
- 缺乏权限时：完成本地代码、测试和推送，准确告知剩余设置；不声称站点已经可访问。

## 10. 后续功能建议

根据实际需求可增加：真实对局数据接口、御魂和速度详情、阵容分析、本地复盘备注、历史筛选、登录与云端记录。
真实赛况、个人账号与持久账本均需要独立后端或受控服务，GitHub Pages 本身只托管静态资源。
