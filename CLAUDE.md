# 知学AI · 每日冷知识助手 — 模块化设计文档

## 项目概述

知学AI是一款微信小程序知识卡片学习平台。每日获取AI生成的冷知识卡片，支持趣味测验、AI助教多轮对话、社区广场互动、个人兴趣标签个性化推荐。

**架构**：原生小程序（WXML+WXSS+JS） + Express.js后端(8080端口) + SQLite数据库(本地) / MySQL数据库(生产)。

**核心业务流程**：
```
启动小程序 → wx.login() 静默登录 → 发现页推荐知识卡片 → 答题测验 → 打卡
                                                    │
                                                    ├→ AI助教多轮对话（带卡片上下文）
                                                    └→ 广场发帖/点赞/评论
```

**项目结构**：
```
miniprogram-6/
├── app.js / app.json / app.wxss          # 小程序入口 + 6页面注册 + 3TabBar
├── pages/
│   ├── discovery/      # 学习首页（卡片+测验+打卡+预加载）
│   ├── community/      # 社区广场（发帖+点赞+评论）
│   ├── profile/        # 个人中心（资料+标签+统计）
│   ├── chat/           # AI助教多轮对话
│   ├── history/        # 学习历史列表
│   └── card-detail/    # 卡片详情（按标题查询）
├── components/
│   └── knowledge-card/ # 可复用卡片组件（TTS朗读+震动反馈）
├── utils/
│   ├── env.js          # 环境配置（dev/prod baseUrl）
│   ├── request.js      # HTTP封装（callCloud接口+JWT注入+错误处理）
│   ├── tags.js         # 标签工具函数（parseTags / joinTags / getUserTagString）
│   └── util.js         # 时间格式化
├── server/
│   ├── app.js          # Express入口（CORS+JWT身份提取+6路由挂载）
│   ├── routes/         # auth / cards / chat / community / users / upload / tags
│   ├── middleware/auth.js   # JWT解析 → req.openid 注入
│   └── utils/          # db.js（SQLite建表+种子数据）+ deepseek.js（DeepSeek客户端）
└── assets/             # TabBar图标等静态资源
```

> **已清理**：`pages/index/`、`pages/logs/`、`cloudfunctions/`、`SmartLearnApp.jsx` 已删除（废弃代码）。
```

---

# 模块一：认证模块 (Auth Module)

## 模块职责
微信OAuth 2.0静默登录。`wx.login()`获取code，后端调用微信code2session换openid，自动注册/识别用户，签发30天JWT。后续所有请求通过`Authorization: Bearer <token>`鉴权。

## 涉及文件

| 端 | 文件 | 职责 |
|---|---|---|
| 前端 | `app.js` | `onLaunch()` 调用 `silentLogin()`，直发 POST /auth/login |
| 前端 | `utils/request.js` | 从Storage读取token，注入`Authorization`头 |
| 后端 | `server/routes/auth.js` | POST /api/auth/login 处理登录 |
| 后端 | `server/middleware/auth.js` | JWT验证 + `req.openid`注入 |
| 后端 | `server/utils/db.js` | users 表建表 |

## 数据流

```
小程序启动
  → app.js onLaunch() → 检查 token + user_profile_cache
      ├─ 两者均存在 → 复用已有身份，跳过登录（保持用户身份一致）
      └─ 缺失 → silentLogin():
          → wx.login() 获取 code
          → wx.request POST /api/auth/login { code }
          → 后端 auth.js:
              WX_SECRET 为空？→ crypto.createHash('md5').update(code) → 'wx_dev_' + 前16位
              否则 → axios.get(code2session) → { openid }
              → SELECT * FROM users WHERE openid = ? → 不存在则静默注册
              → jwt.sign({ openid }, JWT_SECRET, { expiresIn: '30d' })
              → 返回 { token, openid, user, isNewUser }
          → 前端 wx.setStorageSync('token', token) + wx.setStorageSync('user_profile_cache', user)

后续请求:
  → request.js 读取 token → 请求头 Authorization: Bearer <token>
  → middleware/auth.js: jwt.verify → req.openid = decoded.openid → next()
```

## 接口契约

### POST /api/auth/login

Request: `{ "code": "wx_code_xxxxxxxx" }`

Response:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "openid": "oxxxxxxxxxxxxxx",
  "user": {
    "nickname": "知学探索者",
    "avatar": "",
    "tags": [],
    "checkinDays": 0,
    "level": 1,
    "levelName": "探索者"
  },
  "isNewUser": true
}
```

## 数据库表
`users` — 登录时读取，新用户注册时写入。

## 实现要点

- **身份保持**：`onLaunch()` 先检查 `wx.getStorageSync('token')` 和 `user_profile_cache`，两者存在则直接复用，跳过 `wx.login()`。避免开发模式下每次重启生成新 openid 导致标签丢失。
- **白名单**：`/api/auth/login` 不需要鉴权，中间件对 `/auth/login` 路径直接放行。前端首次登录用 `wx.request` 直发（避免 `request.js` 循环依赖）。
- **开发降级**：`WX_SECRET` 为空时直接跳过微信 code2session 调用，用 `crypto.createHash('md5').update(code)` + `'wx_dev_'` 前缀生成openid，保证本地开发零依赖独立运行。
- **Token过期**：JWT 有效期30天。401时前端清token。
- **鉴权策略**：中间件只提取身份不强制拦截。公开接口（卡片、帖子列表）无需 token；需登录路由（用户/对话/发帖/评论）各自检查 `req.openid` 为空时返回 401。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `WX_APPID` | `wx307fcb4d9234d1c2` | 微信小程序AppID |
| `WX_SECRET` | `''` | 微信AppSecret（缺省时降级用dev_openid） |
| `JWT_SECRET` | `zhixue-ai-secret-key-2024` | JWT签名密钥 |

---

# 模块二：知识卡片模块 (Card Module)

## 模块职责
知识卡片的获取、标签推荐、测验交互、预加载缓存。按用户兴趣标签匹配（`LIKE '%tag%'`），无匹配时随机降级。支持按标题精确查找。答题即时反馈（振动+颜色）。

## 涉及文件

| 端 | 文件 | 职责 |
|---|---|---|
| 前端 | `pages/discovery/discovery.js` | 卡片加载、L1/L2缓存、预加载、测验、跳转AI对话 |
| 前端 | `pages/card-detail/card-detail.js` | 按标题查卡片（历史回顾） |
| 前端 | `components/knowledge-card/knowledge-card.js` | 卡片UI组件 + TTS音频朗读 + 震动反馈 |
| 后端 | `server/routes/cards.js` | GET /daily + GET /byTitle |
| 后端 | `server/utils/db.js` | cards 表建表 + 4条种子数据 |

## 数据流

```
发现页加载:
  → discovery.js fetchDailyCard()
  → 查 L1: app.globalData.cardCache.current → 命中直接渲染
  → 查 L2: wx.getStorageSync('last_card') → 兜底渲染
  → callCloud('cardDaily', { tags: 'Java,心理学', forceRefresh, excludeId })
  → 后端 cards.js:
      tags 有值 → WHERE tags LIKE '%Java%' OR tags LIKE '%心理学%' + ORDER BY RANDOM()
      无结果 → SELECT * FROM cards ORDER BY RANDOM() LIMIT 1 (降级)
  → 写入 L1 + L2
  → 记录学习日志: callCloud('userAddStudyLog', { title })
  → 预加载: preloadNext(card._id) → 结果写入 L1.cardCache.next

用户点击"下一张":
  → L1.next 存在 → 直接切换（零网络等待）
  → L1.next 为空 → fetchDailyCard(true) 强制刷新

测验交互:
  → onSelectOption → 比对 card.quiz.correctIndex
  → 正确: wx.vibrateShort('light'), 绿色高亮
  → 错误: wx.vibrateLong(), 红色高亮
```

## 接口契约

### GET /api/card/daily

Query: `tags=Java,心理学&forceRefresh=true&excludeId=3`

Response:
```json
{
  "success": true,
  "_id": 1,
  "category": "计算机科学",
  "title": "CAP 定理",
  "subtitle": "分布式系统的不可能三角",
  "content": "在分布式系统中，一致性、可用性、分区容错性...",
  "aiInsight": "架构选型核心：业务更容忍数据延迟(AP)还是服务不可用(CP)？",
  "tags": ["Java", "架构", "计算机科学"],
  "quiz": {
    "question": "Redis Cluster 默认倾向于保证什么？",
    "options": ["C (一致性)", "A (可用性)", "CA (两者兼顾)"],
    "correctIndex": 1,
    "explanation": "Redis Cluster 默认倾向于 AP..."
  }
}
```

无匹配卡片时: `{ "success": false, "message": "暂无所选兴趣的卡片" }`

### GET /api/card/byTitle

Query: `title=CAP 定理`

Response: 同上。quiz 字段在卡片无题目时为 `null`。

## 数据库表
`cards` — 只读。按标签/随机/标题查询。

## 实现要点

- **三级缓存**：L1 内存（`app.globalData.cardCache` 毫秒级）→ L2 Storage（`last_card` 离线兜底）→ 网络。预加载队列确保"下一张"零等待。
- **标签匹配**：两阶段策略。Phase 1: `LIKE %tag%` 精确子串匹配；Phase 2: JS 层双向模糊匹配（用户标签包含卡片标签 OR 卡片标签包含用户标签），解决 `架构设计`→`架构`、`前端`→`前端开发` 的匹配问题。匹配到多张卡片时 `pickBestCard` 两级排序：① 匹配用户标签数多的优先 ② 标签总数少的优先（更聚焦）③ 同档随机。卡片响应包含 `tags` 数组字段。⚠️ 严禁使用 `flatMap`（会按字符拆分标签字符串）。
- **种子卡片（12张）**：CAP 定理 / 心流体验 / 美第奇家族 / 博弈论基础 / 大语言模型的幻觉 / 浏览器渲染流程 / JVM 垃圾回收 / 达克效应 / 敦煌藏经洞 / 复利效应 / 反向传播算法 / JavaScript Event Loop。每个标签精准对应 2 张卡片，不再降级随机。
- **quiz字段**：`quiz_options` 以 JSON 字符串存库，`cards.js` 用 `JSON.parse()` 解析。`quiz` 字段在无题目时为 `null`，前端需判空。
- **学习日志**：每次加载卡片自动 `callCloud('userAddStudyLog')`，异步，失败不阻塞。无 openid 时静默跳过（`{success: true, skipped: true}`）。
- **组件复用**：`knowledge-card` 在 discovery 和 card-detail 两页面共用，内含 TTS（有道词典API）+ 音波动画。
- **Discovery onShow**：从 profile 切回时检测标签变化（`_lastTags` 对比），变化则 `fetchDailyCard(true)` 强制刷新。

---

# 模块三：AI 对话模块 (Chat Module)

## 模块职责
基于 DeepSeek API 的多轮AI对话。携带当前卡片上下文，用户问题 + 30条历史 + 卡片上下文拼接为 prompt，回复持久化到 `chat_sessions` 表实现会话记忆。清空对话 = 生成新 sessionId（旧数据保留但不加载）。

## 涉及文件

| 端 | 文件 | 职责 |
|---|---|---|
| 前端 | `pages/chat/chat.js` | 对话UI、消息列表、Markdown→HTML渲染、session管理、上下文传递 |
| 后端 | `server/routes/chat.js` | POST /api/chat/ask 拼装prompt + 调DeepSeek + 存历史 |
| 后端 | `server/utils/deepseek.js` | DeepSeek API HTTP客户端（axios） |
| 后端 | `server/utils/db.js` | chat_sessions 表建表 |

## 数据流

```
进入对话页:
  → chat.js onLoad() → sessionId = 's_' + Date.now() + '_' + random(4)
  → 读 app.globalData.currentCardContent 作为卡片上下文

发送问题:
  → chat.js onSend() → 立即展示用户消息（乐观UI）
  → callCloud('chatAsk', { sessionId, question, context })
  → 后端 chat.js:
      1. messages = [systemPrompt(deepseek.js内置)]
      2. context有值 → push { role:'system', content:'用户正在学习:${context}' }
      3. 加载历史: SELECT * FROM chat_sessions WHERE openid+session_id ORDER BY timestamp LIMIT 30
      4. push { role:'user', content: question }
      5. deepseek.chat(messages) → answer
      6. INSERT INTO chat_sessions (user) + (assistant) 两条
      7. 返回 { answer }
  → 前端追加 AI 回复，滚动到底部

清空对话:
  → onClearChat() → 生成新 sessionId → 旧历史保留在DB
```

## 接口契约

### POST /api/chat/ask

Request:
```json
{
  "sessionId": "s_1704067200_a1b2",
  "question": "CAP定理中P为什么是必须的？",
  "context": "在分布式系统中，一致性(C)、可用性(A)、分区容错性(P)..."
}
```

Response:
```json
{
  "success": true,
  "answer": "P（分区容错性）在分布式系统中是必须的，因为网络分区客观存在..."
}
```

## 数据库表
`chat_sessions` — 读写。按 `(openid, session_id, timestamp)` 复合索引查询历史。每次对话写入 user + assistant 两条。

## 实现要点

- **DeepSeek未配置**：`DEEPSEEK_API_KEY` 为空时，`deepseek.js` 直接返回 `'AI 服务未配置 API Key，请联系管理员。'`，不调网络。
- **会话隔离**：每个 sessionId 独立上下文，清空对话 = 前端生成新 ID，旧数据保留但不加载。
- **历史上限**：`LIMIT 30` 条，防止 prompt 超出 token 限制。
- **超时**：DeepSeek API 30秒超时，失败返回友好提示（不抛异常）。
- **模型参数**：`deepseek-chat`, `temperature: 0.7`, `max_tokens: 2000`。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DEEPSEEK_API_KEY` | `''` | DeepSeek API密钥（必填，缺省时AI不可用） |

---

# 模块四：社区模块 (Community Module)

## 模块职责
社区广场帖子列表、发帖、点赞/取消（持久化去重）、评论（内容可见）、删帖。帖子按时间倒序排列，支持分页滚动加载。显示真实用户昵称+头像，自己的帖子标记"我"。

## 涉及文件

| 端 | 文件 | 职责 |
|---|---|---|
| 前端 | `pages/community/community.js` | 帖子渲染、分页加载、发帖模态框、点赞/评论/删帖交互、下拉刷新 |
| 后端 | `server/routes/community.js` | 5个接口：list / publish / like / comment / delete |
| 后端 | `server/utils/db.js` | posts / comments / post_likes 表建表 + 索引 |

## 数据流

```
加载广场:
  → callCloud('communityList', { page }) → 分页查询，每页20条
  → JOIN users 获取帖子作者 nickname + avatar_url
  → 批量查询评论（JOIN users 获取评论者信息）
  → 查 post_likes 获取当前用户 hasLiked 状态
  → 后端判断 isOwner (post.openid === req.openid)
  → 渲染真实用户身份 + 评论内容

发帖:
  → openModal → 输入 → onPublish()
  → callCloud('communityPublish', { content })
  → INSERT INTO posts (openid, content, likes=0)
  → 关闭弹窗 → 刷新第一页

点赞:
  → onLike → 前端立即改 hasLiked / likes（乐观更新）
  → callCloud('communityLike', { postId, isLike })
  → 后端查 post_likes 去重：
      isLike=true + 未点过 → INSERT post_likes → posts.likes+1 → author.likes_received+1
      isLike=false + 已点过 → DELETE post_likes → posts.likes-1 → author.likes_received-1
      自己给自己点赞不增减 likes_received
  → 返回 { success, likes } → 前端用服务端计数校准
  → 失败/已操作 → 幂等返回当前计数

评论:
  → wx.showModal({ editable:true })
  → callCloud('communityComment', { postId, content })
  → INSERT INTO comments → JOIN users 返回新评论 + 评论者信息
  → 前端直接追加到本地 post.comments，不刷新全列表

删帖:
  → onDelete → 二次确认 → callCloud('communityDelete', { postId })
  → 后端验证 post.openid === req.openid
  → 事务级联: post_likes → comments → posts
  → 前端 splice 移除
```

## 接口契约

### GET /api/community/list

Query: `page=1`（默认1，每页20条）

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "content": "今天学到CAP定理，原来Redis是AP系统！",
      "likes": 3,
      "aiReply": "",
      "createTime": "2025-12-29 14:30:00",
      "commentCount": 2,
      "hasLiked": false,
      "isOwner": true,
      "author": {
        "openid": "wx_dev_abc123",
        "nickname": "知学探索者",
        "avatarUrl": ""
      },
      "comments": [
        {
          "id": 1,
          "content": "确实，学到了！",
          "createTime": "2025-12-29 15:00:00",
          "author": {
            "openid": "wx_dev_xyz",
            "nickname": "冷知识达人",
            "avatarUrl": "/uploads/xxx.jpg"
          }
        }
      ]
    }
  ],
  "hasMore": true,
  "page": 1,
  "total": 25
}
```

### POST /api/community/publish

Request: `{ "content": "帖子内容" }`
Response: `{ "success": true, "postId": 5 }`

### POST /api/community/like

Request: `{ "postId": 1, "isLike": true }`
Response: `{ "success": true, "likes": 4 }`（`already: true` 表示已操作过，幂等返回）

### POST /api/community/comment

Request: `{ "postId": 1, "content": "确实，学到了！" }`
Response: `{ "success": true, "comment": { "id": 1, "content": "...", "createTime": "...", "author": {...} } }`

### DELETE /api/community/post

Request: `{ "postId": 1 }`
Response: `{ "success": true }`
权限：仅帖子作者可删，否则 403。

## 数据库表
`posts` — 读写。索引: `(created_at DESC)`, `(openid)`。
`comments` — 读写。复合索引: `(post_id, created_at)`。
`post_likes` — 读写。`UNIQUE(post_id, openid)` 防重复点赞。

## 实现要点

- **点赞持久化**：`post_likes` 表记录每次点赞，`UNIQUE(post_id, openid)` 防止重复。`hasLiked` 由后端查询返回，不依赖前端本地状态。
- **点赞事务**：`/like` 用 `db.transaction()` 包裹 INSERT/DELETE + UPDATE + UPDATE，保证原子性。UNIQUE 约束冲突时幂等降级。
- **评论可见**：`/list` 批量返回评论（带评论者信息），`/comment` 返回新创建的评论对象供前端本地追加。
- **真实身份**：帖子/评论 JOIN `users` 表返回 `nickname` + `avatar_url`。头像加载失败时显示首字母色块 fallback。
- **分页加载**：`page` 参数 + `hasMore` 标识，`scroll-view` 触底自动加载下一页。`fetchPosts` 先用局部变量 `targetPage` 确定页码再调 API，避免 `setData` 异步竞态。
- **删帖级联**：事务内依次删除 `post_likes` → `comments` → `posts`。
- **isOwner 后端判断**：不依赖前端传 openid（防止伪造），后端比较 `post.openid === req.openid`。
- **乐观更新**：点赞和评论操作先改 UI 再请求，失败回滚。点赞用服务端返回的精确计数校准。

---

# 模块五：用户模块 (User Module)

## 模块职责
个人中心：用户资料管理（昵称/头像/标签）、每日打卡去重、学习历史记录查询、学习统计。头像上传通过 multer 接收。

## 涉及文件

| 端 | 文件 | 职责 |
|---|---|---|
| 前端 | `pages/profile/profile.js` | 资料编辑、头像上传、标签选择（限8个）、统计展示 |
| 前端 | `pages/history/history.js` | 学习历史列表 → 点击跳转 card-detail |
| 后端 | `server/routes/users.js` | 5个接口：info / updateProfile / checkin / addStudyLog / history |
| 后端 | `server/routes/upload.js` | POST /api/upload/image（multer + 5MB限制） |
| 后端 | `server/utils/db.js` | users / study_logs / checkins 表建表 + 索引 |

## 数据流

```
个人中心:
  → profile.js onShow() → renderFromCache() 渲染缓存
  → callCloud('userInfo')
  → 后端: SELECT users + COUNT(study_logs) + 最近5条学习
  → 返回 { user, cardsRead, timeline } → 写入 user_profile_cache

修改资料:
  → onNicknameChange / onChooseAvatar / toggleTag
  → syncProfileToBackend() → callCloud('userUpdateProfile', { nickname, avatarUrl, tags })
  → 动态 UPDATE（只更新有值字段） → 更新缓存

标签选择:
  → profile.js toggleTag() → 从API动态获取标签列表，限选8个
  → saveTags() → syncProfileToBackend() → 乐观更新缓存（先写缓存再调API）

打卡:
  → discovery.js onCheckIn() → callCloud('userCheckin')
  → 后端: 今日去重(UNIQUE索引) → INSERT checkins + UPDATE checkin_days
  → 前端: checkinDays+1, 写入 last_checkin_date + user_profile_cache

历史:
  → history.js onLoad() → callCloud('userHistory')
  → SELECT * FROM study_logs WHERE openid=? ORDER BY read_at DESC LIMIT 50
  → 点击 → navigateTo card-detail?title=xxx
```

## 接口契约

### GET /api/user/info

Response:
```json
{
  "success": true,
  "user": {
    "nickname": "知学探索者",
    "avatarUrl": "/uploads/xxx.jpg",
    "tags": ["Java", "心理学", "历史"],
    "checkinDays": 12,
    "level": 1,
    "levelName": "探索者",
    "likesReceived": 0
  },
  "cardsRead": 23,
  "timeline": [
    { "title": "CAP 定理", "time": "2025-12-29 14:30:00" }
  ]
}
```

### POST /api/user/updateProfile

Request: `{ "nickname": "冷知识达人", "avatarUrl": "/uploads/xxx.png", "tags": "Java,架构,AI大模型" }`

Response: `{ "success": true }`

**注意**：三个字段均可选，后端动态拼接 SET 子句。

### POST /api/user/checkin

Response: `{ "success": true }`
重复打卡: `{ "success": false, "message": "今日已打卡" }`

### POST /api/user/addStudyLog

Request: `{ "title": "CAP 定理" }`
Response: `{ "success": true }`
无 token 时静默跳过: `{ "success": true, "skipped": true }`

### GET /api/user/history

Response:
```json
{
  "success": true,
  "data": [
    { "title": "CAP 定理", "time": "2025-12-29 14:30:00" }
  ]
}
```

### POST /api/upload/image

Request: `multipart/form-data`, field `file`
Response: `{ "success": true, "url": "/uploads/1704067200_abc123.png" }`

限制：5MB，仅 png/jpg/jpeg/gif/webp。

## 数据库表

| 表 | 读写 | 关键索引 |
|---|---|---|
| `users` | 读写 | openid UNIQUE |
| `study_logs` | 读写 | `(openid, read_at DESC)` |
| `checkins` | 写 | `UNIQUE(openid, date)` |

## 实现要点

- **打卡双重去重**：`UNIQUE(openid, date)` 索引 + 业务层 `SELECT COUNT` 检查。
- **标签限制**：前端 toggleTag() 最多8个，已选标签再次点击取消。标签列表从 `GET /api/tags/list` 动态获取（不再硬编码）。`auth.js` 和 `users.js` 均已统一返回数组格式。WXML 活动判断使用 `selectedTagMap`。`utils/tags.js` 提供 `parseTags`/`joinTags`/`getUserTagString` 统一处理。
- **缓存乐观更新**：`syncProfileToBackend()` 先写 `wx.setStorageSync('user_profile_cache', u)` 再调 API，避免竞态条件导致 discovery 读到旧标签。
- **头像上传**：`wx.uploadFile` → multer.diskStorage → `server/uploads/` → 通过 `/uploads/` 静态访问。
- **动态UPDATE**：`updateProfile` 只更新请求中传入的非 undefined 字段。
- **缓存一致性**：资料变更后同步更新 `user_profile_cache`；打卡后同步更新 `last_checkin_date`。
- **likesReceived**：`/community/like` 点赞/取消时同步更新帖子作者的 `users.likes_received` 字段。`/user/info` 读取真实值返回。

---

# 基础设施层

## request.js — HTTP 请求封装

**位置**：`utils/request.js`

**核心函数**：
- `callCloud(name, data)` → Promise。内置13条路由映射表（云函数名→HTTP方法+路径）。GET参数拼入query string，POST参数放body。自动注入`Authorization: Bearer <token>`。401时清token。超时30秒。
- `uploadFile(filePath)` → `wx.uploadFile` → POST /api/upload/image。返回上传后URL。

**路由映射表**：
```
login           POST /auth/login
cardDaily       GET  /card/daily
cardByTitle     GET  /card/byTitle
userInfo        GET  /user/info
userUpdateProfile POST /user/updateProfile
userCheckin     POST /user/checkin
userAddStudyLog POST /user/addStudyLog
userHistory     GET  /user/history
chatAsk         POST /chat/ask
communityList   GET  /community/list
communityPublish POST /community/publish
communityLike   POST /community/like
communityComment POST /community/comment
communityDelete  DELETE /community/post
cardTags        GET  /tags/list
```

**约定**：所有页面禁止直接 `wx.request`，统一走 `callCloud`。

## db.js — SQLite 数据库

**位置**：`server/utils/db.js`

- **库**：better-sqlite3（同步API）
- **文件**：`server/database.sqlite`（首次启动自动创建）
- **模式**：WAL（`PRAGMA journal_mode = WAL`）
- **6张表**（详见各模块数据库表章节）

**复合索引**：
```
study_logs:     CREATE INDEX ... ON (openid, read_at DESC)
checkins:       CREATE UNIQUE INDEX ... ON (openid, date)
posts:          CREATE INDEX ... ON (created_at DESC)
comments:       CREATE INDEX ... ON (post_id, created_at)
chat_sessions:  CREATE INDEX ... ON (openid, session_id, timestamp)
```

**种子数据**：cards 表为空时，事务插入 12 条卡片（每标签 2 张）。

## auth.js — JWT 鉴权中间件

**位置**：`server/middleware/auth.js`

**设计原则**：中间件**只提取身份，不强制拦截**。公开接口（卡片、帖子列表）无需 token 即可访问；需登录接口自行检查 `req.openid`。

**逻辑链**：
1. `/api/auth/login` → 白名单，直接放行
2. 从 `req.headers.authorization` 提取 Bearer token → `jwt.verify(token, JWT_SECRET)` → `req.openid = decoded.openid`
3. 兼容模式：从 `req.query.openid` / `req.body.openid` 读取（过渡期，后续移除）
4. 以上皆无 → 放行但 `req.openid` 为空，需登录路由自行返回 401
5. JWT过期 → 401 `{ success: false, message: '登录已过期' }`

**需登录路由**（已加 `if (!req.openid) return 401` 守卫）：
- `POST /api/chat/ask`
- `POST /api/community/publish`、`POST /api/community/comment`
- 全部 `/api/user/*`（5 个端点）

**导出**：`{ authMiddleware, generateToken, JWT_SECRET }`

## env.js — 环境配置

**位置**：`utils/env.js`

```js
const ENV_CONFIG = {
  dev:  {
    baseUrl: 'http://127.0.0.1:8080/api',
    serverRoot: 'http://127.0.0.1:8080'    // 静态文件根路径（无 /api）
  },
  prod: {
    baseUrl: 'http://your-server-ip:8080/api',
    serverRoot: 'http://your-server-ip:8080'
  }
};
// CURRENT_ENV = 'dev' | 'prod'
// 导出: { BASE_URL, SERVER_ROOT, ENV }
```

- 本地开发用 `dev`（默认），微信开发者工具需勾选「不校验合法域名」
- 生产环境改为 `prod`，指向火山引擎云服务器
- `SERVER_ROOT` 用于拼接头像等静态资源完整 URL（小程序 image 组件不认相对路径）

## server/app.js — 后端入口

**首行加载 dotenv**：`require('dotenv').config({ path: __dirname + '/.env' })`，从 `server/.env` 读取环境变量。

**挂载顺序**：`dotenv` → `cors()` → `express.json()` → `express.urlencoded()` → `/uploads`静态文件 → `/api` JWT身份提取（非强制） → 6个路由模块 → `/`健康检查 → 全局错误处理(500)。

---

# 附录

## 本地启动

```bash
# 1. 后端
cd server
npm install
node app.js
# → 知学AI 后端已启动: http://localhost:8080

# 2. 小程序
# 微信开发者工具打开 miniprogram-6/
# 详情 → 本地设置 → 不校验合法域名（勾选）
# 编译运行
```

## 部署（火山引擎）

服务器 IP：`your-server-ip`，SSH 端口：`your-ssh-port`，宝塔面板：`https://your-server-ip:25048/your-token`

```bash
# 上传 server/ 到服务器
scp -P your-ssh-port -r server/ root@your-server-ip:/opt/daily-fact/

# 服务器上
cd /opt/daily-fact/server
npm install
DEEPSEEK_API_KEY=sk-xxx WX_SECRET=xxx node app.js &

# 修改 utils/env.js: CURRENT_ENV='prod'
```

## 环境变量总表

> 本地开发：`server/.env` 文件 + `dotenv` 自动加载。生产环境：系统级环境变量。

| 变量 | 模块 | 默认值 | 说明 |
|---|---|---|---|
| `PORT` | 后端入口 | `8080` | 监听端口 |
| `JWT_SECRET` | 认证 | `zhixue-ai-secret-key-2024` | JWT签名密钥 |
| `WX_APPID` | 认证 | `wx307fcb4d9234d1c2` | 小程序AppID |
| `WX_SECRET` | 认证 | `''` | AppSecret（缺省时降级dev_openid） |
| `DEEPSEEK_API_KEY` | AI对话 | `''` | DeepSeek API密钥（已配置于 `server/.env`） |

## localStorage 缓存键

| 键 | 写入方 | 读取方 | 用途 |
|---|---|---|---|
| `token` | app.js | request.js | JWT令牌 |
| `user_profile_cache` | app.js, profile.js, discovery.js | discovery.js, chat.js, profile.js | 用户档案缓存 |
| `last_checkin_date` | discovery.js | discovery.js | 今日打卡状态持久化 |
| `last_card` | discovery.js | discovery.js | L2卡片缓存（离线兜底） |

## 编码规范

- 文件名：小写+连字符（`card-detail.js` / `knowledge-card.wxml`）
- 所有页面请求走 `callCloud(name, data)`，禁止 `wx.request`
- 页面头部：`const app = getApp(); const { callCloud } = require('../../utils/request.js');`
- SQL 参数化查询：`db.prepare('...').all/get/run(params)`
- 后端返回格式：`{ success: true/false, data?: any, message?: string }`
- 路由按资源拆分：`cards.js` / `users.js` / `chat.js` / `community.js`

## .gitignore — Git 安全

**位置**：`.gitignore`（2026-07-10 新建）

排除清单：`.env` / `node_modules/` / `*.sqlite` / `uploads/` / `miniprogram_npm/` / `Thumbs.db`

---

## 注意事项

- 小程序 AppID：`wx307fcb4d9234d1c2`
- 不提交：`server/database.sqlite` / `server/node_modules/` / `server/uploads/` / `server/.env`（`.gitignore` 已配置）
- 已清理：`pages/index/` `pages/logs/` `cloudfunctions/` `SmartLearnApp.jsx` `CLAUDE.old.md`（2026-07-07）

---

# 生产环境 MySQL 数据库结构

生产环境数据库 `zhixue_ai`，MySQL 8.0。

> ⚠️ 本地 SQLite 表名/列名与生产 MySQL 不同，部署时需注意映射。

## 表结构对照

| 本地 SQLite | 生产 MySQL | 关键列名差异 |
|---|---|---|
| `users` | `user_info` | `tags` → `interest_tags`, 多了 `create_time`/`update_time` |
| `cards` | `knowledge_card` | **无 `tags` 列**，`quiz_correct_index` → `correct_index`, `quiz_explanation` → `explanation` |
| `study_logs` | `study_log` | `read_at` → `create_time` |
| `checkins` | **无** | 生产库缺少此表 |
| `posts` | `community_post` | `ai_reply` → `ai_reply`, `created_at` → `create_time` |
| `comments` | `community_comment` | `created_at` → `create_time` |
| `chat_sessions` | **无** | 生产库缺少此表 |

## 生产表 DDL 摘要

```sql
-- user_info: 用户表
CREATE TABLE user_info (
  id bigint AUTO_INCREMENT,
  openid varchar(64) NOT NULL,
  nickname varchar(100) DEFAULT '点击设置昵称',
  avatar_url varchar(500) DEFAULT '/assets/default-avatar.svg',
  interest_tags varchar(255) DEFAULT '',        -- ← 注意：不是 tags
  checkin_days int DEFAULT 0,
  level int DEFAULT 1,
  level_name varchar(50) DEFAULT '探索者',
  create_time datetime DEFAULT CURRENT_TIMESTAMP,
  update_time datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE,
  PRIMARY KEY (id), UNIQUE INDEX uk_openid(openid)
);

-- knowledge_card: 知识卡片表（⚠️ 无 tags 列）
CREATE TABLE knowledge_card (
  id bigint AUTO_INCREMENT,
  category varchar(50) NOT NULL,
  title varchar(100) NOT NULL,
  subtitle varchar(200) DEFAULT '',
  content text NOT NULL,
  ai_insight text,
  quiz_question text NOT NULL,
  quiz_options varchar(1000) NOT NULL,          -- JSON数组字符串
  correct_index int NOT NULL,                    -- ← 不是 quiz_correct_index
  explanation text,
  create_time datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

-- community_post: 社区帖子表
-- community_comment: 帖子评论表
-- study_log: 学习足迹表
```

## 部署待办

- [ ] 生产 `knowledge_card` 表需新增 `tags` 列（`ALTER TABLE knowledge_card ADD COLUMN tags VARCHAR(500) DEFAULT ''`）
- [ ] 生产需新增 `checkins` 表和 `chat_sessions` 表
- [ ] 后端需适配 MySQL（当前用 better-sqlite3，生产需换 mysql2）
- [ ] 生产卡片种子数据已有 19 条（含更多分类），本地 12 条（每标签 2 张）

---

# 标签模块重构计划（✅ 已完成 2026-07-07）

## 问题总结（全部已修复）

| # | 问题 | 严重度 |
|---|------|--------|
| 1 | 推荐标签硬编码在 `profile.js`，不与数据库同步 | 🔴 高 |
| 2 | API 返回格式不一致（auth 数组，user/info 字符串） | 🔴 高 |
| 3 | WXML 活动标签判断用 8 次手动索引 | 🟡 中 |
| 4 | 标签解析逻辑在 6 处重复 | 🟡 中 |
| 5 | 卡片 LIKE 匹配僵化（`架构设计` 匹配不到 `架构`） | 🟡 中 |
| 6 | `cards.js` 响应缺少 `tags` 字段 | 🟢 低 |
| 7 | `cards.js` 有未使用的死代码 `placeholders` | 🟢 低 |

## 实施步骤

### Step 1: 后端 — 标签 API + 格式统一
- 新建 `server/routes/tags.js` → `GET /api/tags/list` 返回所有唯一标签
- `GET /api/user/info` 返回 tags 数组（与 auth.js 一致）
- `GET /api/card/daily` 响应加入 `tags` 字段
- 卡片匹配改为双向模糊：用户标签包含卡片标签 OR 卡片标签包含用户标签
- 删除 `cards.js:15` 死代码

### Step 2: 前端 — 标签工具函数
- 新建 `utils/tags.js`（`parseTags` / `joinTags` / `getUserTagString`）
- 替换 `discovery.js` ×3、`profile.js` ×1、`index.js` ×1 中的重复代码

### Step 3: 前端 — Profile 动态标签
- `recommendTags` 从 API 动态获取，不再硬编码
- WXML 活动标签判断改为 `selectedTagMap[item]` 或 `tagListForSheet[].active`
- 请求映射表新增 `cardTags: GET /card/tags`

### Step 4: 验证
```bash
curl http://127.0.0.1:8080/api/card/tags          # 标签列表
curl "http://127.0.0.1:8080/api/card/daily?tags=架构设计"  # 模糊匹配
curl http://127.0.0.1:8080/api/user/info          # 标签数组格式
```

---

# 变更日志

| 日期 | 变更 |
|------|------|
| 2026-07-10 | **环境变量安全化**：安装 `dotenv`；创建 `server/.env`（DEEPSEEK_API_KEY + JWT_SECRET + WX_SECRET + PORT）；创建 `.gitignore`（排除 `.env` / `node_modules/` / `*.sqlite` / `uploads/`）；`app.js` 首行 `require('dotenv').config()` |
| 2026-07-10 | **AI 回复 Markdown 渲染**：`chat.js` 新增 `markdownToHtml()`（`**粗体**` → `<strong>`、`*斜体*` → `<em>`、`` `代码` `` → `<code>`、`### 标题` → `<h3>`、换行）；`chat.wxml` `<text>` → `<rich-text nodes="{{item.contentHtml}}">` |
| 2026-07-10 | **自赞计入获赞数**：`community.js` `/like` 移除 `post.openid !== req.openid` 守卫，自己给自己点赞也更新 `likes_received`（方便开发测试） |
| 2026-07-10 | **onScrollToLower 竞态修复**：`community.js` `onScrollToLower` 改为先算 `nextPage` 再通过 `forcePage` 参数传入 `fetchPosts`，彻底避免 `setData` 异步导致读到旧页码 |
| 2026-07-07 | **社区点赞事务化**：`/like` 端点用 `db.transaction()` 包裹 INSERT + UPDATE + UPDATE，保证原子性；并发唯一约束冲突幂等处理 |
| 2026-07-07 | **社区 fetchPosts 异步竞态修复**：`setData({ page: 1 })` 改为先算 `targetPage` 再调 API，解决刷新时读到旧页码导致数据错乱 |
| 2026-07-07 | **社区模块全面改进**：去匿名化（真实昵称+头像）；`post_likes` 表防重复点赞；评论内容可见（批量返回+新评论即时追加）；分页滚动加载；删帖功能（级联事务）；`isOwner` 后端判断 |
| 2026-07-07 | **社区点赞同步**：`db.js` users 表新增 `likes_received` 列 + 迁移；`community.js` `/like` 点赞/取消时同步更新帖子作者的获赞数；`users.js` `/info` 读取真实 `likes_received`（不再硬编码 0） |
| 2026-07-07 | **历史页修复**：`history.wxml` `data-title` 从 `rawTitle` → `title`，修复点击复习无法跳转卡片详情 |
| 2026-07-07 | **标签模块重构**：`server/routes/tags.js` 新建 → `GET /api/tags/list`；`cards.js` 双向模糊匹配 + tags字段 + 死代码删除；`users.js` 返回tags数组；`utils/tags.js` 新建 |
| 2026-07-07 | **前端标签重构**：`profile.js` 动态获取标签 + `selectedTagMap`；`profile.wxml` 修复活动判断（手动索引→selectedTagMap）；`discovery.js` 3处统一用 `getUserTagString()` |
| 2026-07-07 | **标签唯一化**：重新分配卡片标签，确保10个标签各只对应1张卡片；`pickBestCard` 改为两级排序（匹配数→标签数）；孤儿标签清理 |
| 2026-07-07 | **扩容**：新增 6 张种子卡片（JVM 垃圾回收/达克效应/敦煌藏经洞/复利效应/反向传播算法/JS Event Loop），每标签 2 张不再降级随机 |
| 2026-07-07 | **discovery**：修复 `cardCache.next` 残留旧标签预加载卡片的问题（forceRefresh 时清空） |
| 2026-07-07 | **卡片组件**：`category` 单字段 → `card.tags` 数组遍历（discovery + knowledge-card 两处），解决多标签卡片只显示一个的问题 |
| 2026-07-07 | **头像**：`fullUrl()` 补全相对路径 → `_loadAvatarDisplay()` 通过 `wx.downloadFile` 转本地临时路径，解决小程序 image 组件强制 HTTPS 限制；`renderFromCache` 同步加载头像显示 |
| 2026-07-07 | **profile.wxml**：timeline `wx:key="time"` → `wx:key="*this"` 修复同时间多记录导致 key 重复警告 |
| 2026-07-07 | **广场乱码**：清理数据库中被编码污染的旧帖子，确认服务器 + 小程序 UTF-8 链路正常 |
| 2026-07-07 | 清理废弃文件：`pages/index/` `pages/logs/` `cloudfunctions/` `SmartLearnApp.jsx` `CLAUDE.old.md` |
| 2026-07-07 | CLAUDE.md 更新：生产 MySQL 结构、标签重构计划、变更日志 |
| 2026-07-06 | `app.js`: 有token+缓存时跳过登录（dev模式身份保持） |
| 2026-07-06 | `discovery.js`: 新增 `onShow` 标签变化检测 + 自动刷新卡片 |
| 2026-07-06 | `profile.js`: 推荐标签对齐卡片标签 + 乐观更新缓存 |
| 2026-07-06 | `db.js`: 新增 2 张种子卡片（LLM幻觉 + 浏览器渲染流程） |
| 2026-07-06 | `cards.js`: `flatMap`→`map` 修复标签匹配失效 |
| 2026-07-06 | `community.js`: DiceBear→本地SVG头像生成 |
| 2026-07-06 | `auth.js`: 开发降级（WX_SECRET为空时跳过微信API） |
| 2026-07-06 | `users.js`: `addStudyLog` 无openid时静默跳过 |

---

# 已知问题 & 待办

> 2026-07-10 全面代码审查发现（手动 + Agent 双重审查），按严重度排列。

## 🔴 严重 — 安全与生产阻塞

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| S1 | **OpenID 注入漏洞** | `server/middleware/auth.js:27-31` | 中间件从 `req.query.openid` / `req.body.openid` 读取身份，任何人可伪造 openid 冒充任意用户。应立即删除此兼容回退 |
| S2 | **生产环境用 HTTP 非 HTTPS** | `utils/env.js:9,14` | 微信小程序要求 HTTPS，HTTP 请求在生产中全部被拒。需 Nginx 反向代理 + SSL |
| S3 | **JWT 密钥硬编码** | `server/middleware/auth.js:4` | 默认值 `zhixue-ai-secret-key-2024` 在代码和文档中明文可见。生产必须更换并通过环境变量注入 |
| S4 | **上传端点无鉴权** | `server/routes/upload.js` | `/api/upload/image` 缺少 `req.openid` 检查，任何人可上传文件消耗存储 |

## 🔴 需修复 — 逻辑 Bug

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| B1 | **打卡连续天数永不重置** | `server/routes/users.js:88` | `checkin_days` 只增不减，断签后不重置为 1。需检查上次打卡是否为昨天 |
| B2 | **无小测卡片点击选项报错** | `pages/discovery/discovery.js:175` | 卡片无 quiz 时点击选项走 `else` 分支 → 长震动（错误反馈）。需 `if (!card.quiz) return` |
| B3 | **小测区块在 quiz=null 时仍渲染** | `pages/discovery/discovery.wxml:65-93` | `card.quiz.question` 访问 null 属性 → 运行时报错。需 `wx:if="{{card.quiz}}"` 包裹 |
| B4 | **auth.js 与 users.js 字段不一致** | `server/routes/auth.js:67` vs `users.js:28` | auth 返回 `avatar`，users 返回 `avatarUrl`，缓存键不匹配 |
| B5 | **DELETE 请求用 body 传参** | `server/routes/community.js:209` | HTTP 规范不保证 DELETE 带 body，代理/CDN 可能丢弃。应改为 query param |
| B6 | `JSON.parse()` 无异常保护 | `server/routes/cards.js:115` | `quiz_options` 格式异常 → 服务端 500。需 `try-catch` |
| B7 | `discovery.js` 未检查 API `success` | `pages/discovery/discovery.js:102` | `{success:false}` 时前端当做正常卡片使用 |

## 🟡 改进建议

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| I1 | `catchtouchmove="true"` 语法无效 | `pages/profile/profile.wxml:112` | 应写 `catchtouchmove`（无值），当前标签弹窗背景仍可滚动 |
| I2 | `cloudfunctionRoot` 指向已删除目录 | `app.json` | 应在 `app.json` 中删除此行 |
| I3 | card-detail 无错误状态 | `pages/card-detail/card-detail.js:21` | 卡片加载失败后页面空白，无重试按钮 |
| I4 | 新评论头像未走 `fullUrl()` | `pages/community/community.js:206` | 相对路径头像在新评论中显示异常 |
| I5 | `auth.js` 降级创建新身份 | `server/routes/auth.js:41-43` | code2session 网络失败降级 dev_openid，可能意外创建重复用户 |
| I6 | 聊天消息无上限 | `pages/chat/chat.js:66-80` | `messages` 数组无限增长 |
| I7 | `wx.showModal({editable})` 兼容性 | `pages/community/community.js:190` | 要求基础库 ≥ 2.17.1 |
| I8 | 无速率限制 | `server/routes/community.js` | 上线需 `express-rate-limit` |
| I9 | 卡片 fuzzy fallback 查全表 | `server/routes/cards.js:70` | 卡片量大后不可扩展 |
| I10 | 空社区无提示 | `pages/community/community.wxml` | 无帖子时页面空白，缺 `wx:if` 空状态 |
| I11 | 学习日志可能重复 | `pages/discovery/discovery.js:116` | `fetchDailyCard` + `onNextCard` 可触发同一卡片多次记录 |

## 🟢 已记录的设计决策

| # | 决策 | 说明 |
|---|------|------|
| 1 | 自赞计入 `likesReceived` | 2026-07-10 移除 `post.openid !== req.openid` 守卫。上线前可恢复 |
| 2 | `markdownToHtml` XSS 安全 | 先转义 `&lt;`/`&gt;`/`&amp;` 再替换 markdown 语法，防 XSS |
| 3 | 生产 MySQL 差异 | 表名/列名/缺失表均记录在 CLAUDE.md「生产环境 MySQL 数据库结构」章节，部署前需适配 |
