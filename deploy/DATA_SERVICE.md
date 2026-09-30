# GitHub Pages 每分钟更新

网页继续部署到 GitHub Pages，独立 Node.js 服务每 60 秒从公开原表同步数据。浏览器每 60 秒读取服务；首次启动立即同步。抓取耗时超过一分钟时不重叠抓取，失败保留上次成功数据及其同步时间。

## 1. 部署持续运行的数据服务

在安装 Docker 和 Compose 的服务器上，在仓库目录执行：

```bash
docker compose up -d --build
curl http://127.0.0.1:8080/healthz
```

Docker 镜像安装 Node.js 24、依赖及 Chromium。`compose.yaml` 使用持久卷 `/data` 保存快照与首次预测记录，服务重启或镜像更新不清空留档。不要删除该卷。服务仅提供只读接口，不开放访客触发同步的接口。

没有 Docker 时也可使用：

```bash
npm ci
npx playwright install --with-deps chromium
DATA_DIR=/path/to/persistent-data npm run serve:data
```

进程需由服务器进程管理器持续运行。容器平台要配置端口 `8080`、持久目录 `/data`，并选择不会休眠的实例；服务休眠时无法每分钟同步。

## 2. 为数据服务配置 HTTPS

把自己的数据域名解析到服务器，通过现有反向代理转发到 `127.0.0.1:8080`。例如 Caddy 配置（替换为自己的域名）：

```caddyfile
data.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

确认 `https://你的域名/data-snapshot.json` 和 `/healthz` 可访问。GitHub Pages 是 HTTPS，不能连接 HTTP 数据接口。代理不能缓存 `/data-snapshot.json`。

服务默认允许来源 `https://sakuramanordd-wq.github.io`。如使用自定义页面域名，设置 `ALLOWED_ORIGINS` 为页面的完整 origin（不含路径）；多个来源用逗号分隔。无需登录、密钥或用户数据。

## 3. 连接 GitHub Pages

在 GitHub 仓库 **Settings → Secrets and variables → Actions → Variables** 设置公开变量：

```text
DATA_API_URL=https://你的域名/data-snapshot.json
```

随后运行 Pages 发布工作流。构建时会注入 `VITE_DATA_API_URL`；页面无需重复发布即可读取该服务更新的场次、统计及首次预测记录。

本地测试连接该线上服务可执行：

```bash
LOCAL_AUTO_SYNC=0 VITE_DATA_API_URL=https://你的域名/data-snapshot.json ./scripts/local-deploy.sh
```

同时把本地页面 origin 加入数据服务的 `ALLOWED_ORIGINS`。

## 4. 验证

打开网页，标注应为“每分钟同步”。等待两个周期，确认同步时间使用服务抓取时间，场次数据也随原表变化。暂时停止数据服务后，网页应提示更新失败并保留旧数据；恢复服务后自动恢复。

`/healthz` 表示服务存活，并返回真实 `fetchedAt` 与 `syncFailed`；监控应同时检查同步时间是否过旧。同步时间不会因为浏览器检查更新而被改成当前时间。

若未配置 `DATA_API_URL`，页面仍可读取构建时的静态快照，标注为“每分钟检查更新”，不会声称已从原表自动同步。
