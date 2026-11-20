# Daymark Desktop

Windows 本地任务与 Agent 工作台。

## 启动

双击 `start.bat`，或在 PowerShell 运行：

```powershell
Set-Location 'C:\path\to\Worn-In小网站\desktop-agent'
npm install
npm run dev
```

需要 Node.js 22 或更新版本。

## 已实现

- 任务看板、任务详情和本机浏览器存储。
- 首次启动时将对话中明确列出的 17 条工作任务按模块添加到任务看板；按任务标题去重，只导入一次。导入日期保留原清单中的月-日文本。
- Agent 运行事件演示（不是实际的自动化 Agent）。
- DeepSeek 流式对话：可读取当前任务清单并帮助总结/排优先级；不能直接改任务或操作外部账号。
- Notion 只读连接：安全保存 integration token、测试连接、按标题搜索已授权页面；聊天时只向 DeepSeek 提供你勾选的页面。
- DeepSeek API Key 通过 Electron `safeStorage` 加密后保存在本机应用数据目录。Key 不会回传给界面。

## 启用 DeepSeek 对话

1. 在浏览器打开 [DeepSeek API Keys](https://platform.deepseek.com/api_keys)，登录并创建 API Key。API 调用可能产生费用，使用前确认账户计费设置。
2. 打开 Daymark，点左下角「设置」，在 DeepSeek 助理区域粘贴 Key 并点「安全保存」。
3. 点右下角「和小助手聊聊」开始对话。消息和当前任务清单会发送到 DeepSeek API；不要把密码、私密客户资料等敏感信息写入聊天。
4. 更换 Key 时直接输入新 Key 保存；删除 Key 可在同一区域操作。

DeepSeek 文档：[API 快速开始](https://api-docs.deepseek.com/)、[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion)。当前使用 `deepseek-flash`。

## 平台接入说明与需要你完成的步骤

第三方授权都需要你登录相应开发者平台并同意授权。不要把密码、API Key、OAuth Client Secret 发到聊天里；密钥只粘贴到应用设置输入框。

### Notion（最适合作为第一项数据连接）

1. 打开 [Notion Developer Connections](https://www.notion.so/profile/integrations) 并创建 **Internal integration**。
2. 在集成配置里启用 **Read content**（读取内容）权限，复制 Internal Integration Secret。
3. 在 Notion 中打开要授权的任务数据库/页面，选择 `...` → `Add connections`，把刚创建的集成加进去。公司工作区可能需要管理员批准；没分享给集成的页面，API 读不到。
4. 在 Daymark 左下角「设置」→「Notion 工作区」粘贴 Secret，点「安全保存」，再点「测试连接」。
5. 在同一处按标题搜索页面并勾选最多 5 个；如果搜索索引没找到，粘贴完整 Notion 页面链接（包括 `app.notion.com/p/...`）点「添加链接」，应用会直接验证该页面是否可读并选中。也支持添加数据库链接，例如 Projects；聊天时会读取最多 40 条数据库记录。留空标题可请求列出可见页面，但 Notion Search 不是完整目录。
6. 打开聊天问关于所选页面的问题。只读取勾选的页面及其文字内容，不写回 Notion。

「测试连接成功」只说明 token 有效，不代表整个公司工作区都自动共享给 integration。若通过完整链接仍显示无权访问，再确认公司管理员允许该 integration 访问工作区，并在目标页面的 `Add connections` 里选中了它。Notion 搜索索引可能延迟，也不能保证列出所有页面。不要把 Secret 发给我或粘贴到聊天框。

#### 在 Notion 页面中授权 integration（逐页操作）

每个需要读取的顶层页面或数据库都要单独授权；如果还要读数据库里的任务记录，请授权数据库本身，而不只是某条记录。

1. 在 Notion 左侧栏点开要授权的页面，例如 `Projects`。
2. 在页面右上角点 **Share**。如果分享面板里有 **Connections** 或添加连接入口，搜索并选择 `Janice's Agent`。
3. 如果 Share 面板没有连接入口，点页面右上角 `•••` → **More** → **Connections** → **Add connections** → 搜索并选择 `Janice's Agent`。
4. 对左侧栏中的 `Social Media Calendar`、`Company Wiki`、`Brainstorm Session` 等页面逐个重复。
5. 数据库请点数据库页面本身（例如 Projects 标题页），按相同步骤授权；若数据在另一个独立的 database 页面，也要单独授权那个页面。
6. 回到 Daymark：左下角「设置」→ Notion 区域，在链接框粘贴页面地址栏完整 URL（新版 `https://app.notion.com/p/...` 也支持），点「添加链接」。如果成功，会显示“已验证并选中”。

如果搜索找不到页面，不代表没有权限；直接添加该页完整链接即可验证。若 Notion 显示管理员限制或 integration 不在连接列表，请联系公司的 Notion workspace owner 在 `Settings` → `Connections` 中允许该 integration。

官方说明：[Notion API 授权](https://developers.notion.com/guides/authorization/overview)、[认证](https://developers.notion.com/reference/authentication)。

### Instagram

官方 Insights API 需要 **Creator 或 Business 专业账号**，可读取获授权账号和媒体的部分分析数据；不是个人账号，也不保证秒级更新。

1. 如仍是个人账号，先在 Instagram 设置中切换为 Creator/Business。
2. 登录 [Meta for Developers](https://developers.facebook.com/) 创建 Meta App，添加 Instagram API（Instagram Login）产品。
3. 配置 OAuth 回调和权限；读取 Insights 通常需要 `instagram_business_basic` 与 `instagram_business_manage_insights`。Meta 的应用审核/访问级别要求由 Meta 决定。
4. 准备好应用 ID、Secret、回调配置后，Daymark 才能实现并测试授权连接。当前应用还没有这段 OAuth 流程。

官方说明：[Instagram API with Instagram Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/)、[Insights](https://developers.facebook.com/documentation/instagram-platform/insights)。

### TikTok

官方 API 通过 TikTok 登录授权，不是单独粘贴账号密码。普通开发者 API 与 Research API 的用途/资格不同；Research API 面向符合条件的研究，不适合普通商业创作者分析面板。

1. 登录 [TikTok for Developers](https://developers.tiktok.com/)，创建应用并申请需要的产品/权限。
2. 获取 `client_key`、`client_secret`，配置 HTTPS OAuth 回调并申请用户授权。用户资料统计要申请对应的 `user.info.stats` scope；公开视频列表使用 `video.list`，可读字段以平台批准范围为准。
3. 平台批准且你提供应用配置后，才能完成 Daymark 的 OAuth 流程。当前尚未实现。

官方说明：[Login Kit](https://developers.tiktok.com/doc/login-kit-web/)、[Get User Info API](https://developers.tiktok.com/docs/en/tiktok-api-v2-get-user-info)、[Research API 资格](https://developers.tiktok.com/products/research-api/)。

### 小红书

小红书创作者服务平台提供站内数据分析；目前没有确认到可供普通个人开发者自助申请、公开文档化的通用创作者 Insights API。若你有小红书官方商务/开放平台给出的接口文档或已批准的凭据，可再按其授权范围开发。

现阶段建议从创作者中心手动抄录，或使用平台提供的导出文件后导入。不要用账号密码、Cookie、未公开接口或自动读屏绕过访问限制；读屏/OCR 只能作为你主动打开页面时的本地辅助识别，并应由你核对。

## 隐私与边界

- DeepSeek 是在线模型：发送消息时会将聊天文本和当前任务清单发送至 DeepSeek API。
- OAuth Client Secret、API Key 不要贴到代码或聊天中。
- Notion 内容会发送给 DeepSeek API；只授权并勾选适合交给外部 AI 处理的页面。
- 当前没有真实平台同步、自动发布、自动写入 Notion、桌面宠物或可自主操作电脑的 Agent。
- Agent 活动面板中的「运行演示」只模拟进度事件。
