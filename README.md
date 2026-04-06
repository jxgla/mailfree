# CF邮箱（mailfree-src）

一个基于 Cloudflare Workers + D1 + R2 的临时邮箱项目，支持收件、发件、转发、历史邮箱管理、用户管理和外部 API。

这个仓库当前维护重点不是花哨展示，而是把日常使用体验压到更直接、更稳定：少跳转、少重绘、少动画，收信和管理都更顺手。

## 本次更新

- 首页历史邮箱列表改为更轻量的刷新方式，减少整块重绘
- 首页自动刷新会同时更新历史邮箱和当前邮箱邮件列表
- 管理页改成“用户管理 / API 设置”同页切换，减少页面跳转
- “所有邮箱”页支持同页查看邮箱邮件详情，不必再跳回首页
- 多个页面样式进一步压平，移除了大量 blur、重阴影、位移动画和长过渡
- 临时邮箱保留时间为 30 分钟，置顶/收藏邮箱不会被定时清理误删
- 默认部署方式改为更安全的代码上传流程，避免误覆盖 Cloudflare 线上 routes / custom_domain 配置

## 功能概览

| 类别 | 说明 |
| --- | --- |
| 邮箱生成 | 随机邮箱、自定义邮箱、随机人名邮箱、多域名支持 |
| 邮件收发 | 接收邮件、发件、验证码提取、HTML/纯文本查看 |
| 邮箱管理 | 历史邮箱、置顶、收藏、转发、搜索、分页 |
| 管理后台 | 用户管理、邮箱登录权限、邮箱分配、API Key 管理 |
| 外部 API | 创建邮箱、查询域名、获取最新验证码 |
| 存储架构 | Cloudflare Workers + D1 + R2 + Email Routing |

## 页面结构

- `/`：首页，生成邮箱、查看历史邮箱、查看收件箱/发件箱
- `/html/admin.html`：管理后台，同页切换用户管理与 API 设置
- `/html/mailboxes.html`：所有邮箱列表，可直接查看某个邮箱的邮件详情

## 部署与发布

### 推荐日常发布

```bash
npm install
npm run deploy
```

`npm run deploy` 对应 `wrangler versions upload`，只上传 Worker 代码版本，适合日常更新。

### 需要显式修改 Worker 路由配置时

```bash
npm run deploy:full
```

`npm run deploy:full` 对应完整 `wrangler deploy`。只有在你明确要同步 `wrangler.toml` 中的 Worker 配置时再使用。

### 为什么这样区分

`wrangler.toml` 已开启：

```toml
keep_vars = true
```

同时默认注释掉了 `[[routes]]` / `custom_domain` 配置，避免本地配置在部署时误覆盖线上已经绑定好的域名和路由设置。

## 必要配置

### Cloudflare 资源绑定

- D1：`TEMP_MAIL_DB`
- R2：`MAIL_EML`
- Assets：`ASSETS`

### 主要变量

| 变量名 | 说明 | 必需 |
| --- | --- | --- |
| `MAIL_DOMAIN` | 可用邮箱域名，多个用逗号或空格分隔 | 是 |
| `ADMIN_PASSWORD` | 管理员密码 | 是 |
| `ADMIN_NAME` | 管理员用户名，默认 `admin` | 否 |
| `JWT_TOKEN` | 登录态签名密钥 | 是 |
| `RESEND_API_KEY` | 发件所需密钥，可按域名配置 | 否 |
| `FORWARD_RULES` | 批量前缀转发规则 | 否 |

## 邮箱保留策略

项目内定时清理任务每 5 分钟执行一次：

- 普通临时邮箱及其邮件保留 30 分钟
- 被置顶或收藏的邮箱不会被自动清理
- 邮件原始 EML 会同步从 R2 清理，避免残留

## 外部 API

当前常用接口：

- `GET /api/ext/domains`：获取可用域名
- `POST /api/ext/accounts`：创建邮箱
- `GET /api/ext/messages/latest-code?mailbox=...`：获取最新验证码

更多说明见：[docs/api.md](docs/api.md)

## 文档

- [一键部署指南](docs/yijianbushu.md)
- [Resend 发件配置](docs/resend.md)
- [API 文档](docs/api.md)
- [页面展示](docs/zhanshi.md)

## 本地开发

```bash
npm install
npm run dev
```

常用调试命令：

```bash
wrangler tail
wrangler d1 execute TEMP_MAIL_DB --command "SELECT * FROM mailboxes LIMIT 10"
```

## 注意事项

- Cloudflare 静态资源可能有缓存，前端更新后如未生效可手动清缓存
- 生产环境务必自行设置强密码和 JWT 密钥
- 收件功能依赖 Email Routing 正确绑定到当前 Worker
- 转发目标邮箱需要先在 Cloudflare Email Routing 中完成验证
