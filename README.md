# 知学AI · 每日冷知识助手

微信小程序知识卡片学习平台 — 每日 AI 冷知识卡片 + 趣味测验 + AI 助教多轮对话 + 社区广场。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | 微信原生小程序（WXML + WXSS + JS） |
| 后端 | Express.js（Node.js） |
| 数据库 | SQLite（本地）/ MySQL（生产） |
| AI | DeepSeek API |

## 快速开始

```bash
# 1. 后端
cd server
npm install
node app.js
# → http://localhost:8080

# 2. 小程序
# 微信开发者工具打开项目根目录
# 详情 → 本地设置 → 勾选「不校验合法域名」
# 编译运行
```

## 项目结构

```
├── app.js / app.json / app.wxss    # 小程序入口
├── pages/
│   ├── discovery/    # 学习首页（卡片 + 测验 + 打卡）
│   ├── community/    # 社区广场（发帖 + 点赞 + 评论）
│   ├── profile/      # 个人中心（资料 + 标签 + 统计）
│   ├── chat/         # AI 助教多轮对话
│   ├── history/      # 学习历史
│   └── card-detail/  # 卡片详情
├── components/
│   └── knowledge-card/  # 可复用卡片组件
├── utils/            # 工具函数（请求封装、标签、环境配置）
├── server/
│   ├── app.js        # Express 入口
│   ├── routes/       # auth / cards / chat / community / users / upload / tags
│   ├── middleware/    # JWT 鉴权
│   └── utils/        # 数据库 + DeepSeek 客户端
└── assets/           # 图标等静态资源
```

## 环境变量

在 `server/.env` 中配置（不提交到 Git）：

| 变量 | 说明 |
|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 |
| `JWT_SECRET` | JWT 签名密钥 |
| `WX_APPID` / `WX_SECRET` | 微信小程序凭证 |
| `DB_TYPE` | `sqlite`（本地）或 `mysql`（生产） |
