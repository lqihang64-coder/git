// server/app.js
// 加载 .env 环境变量（必须在最顶部）
require('dotenv').config({ path: __dirname + '/.env' });

const express = require('express');
const cors = require('cors');
const path = require('path');
const { authMiddleware } = require('./middleware/auth');

// 路由模块
const authRoutes = require('./routes/auth');
const cardsRoutes = require('./routes/cards');
const usersRoutes = require('./routes/users');
const chatRoutes = require('./routes/chat');
const communityRoutes = require('./routes/community');
const uploadRoutes = require('./routes/upload');
const tagsRoutes = require('./routes/tags');

const app = express();
const PORT = process.env.PORT || 8080;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件（上传的图片）
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// JWT 鉴权（白名单: /api/auth/login）
app.use('/api', authMiddleware);

// 路由挂载
app.use('/api/auth', authRoutes);
app.use('/api/card', cardsRoutes);
app.use('/api/user', usersRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/tags', tagsRoutes);

// 健康检查
app.get('/', (req, res) => {
  res.json({ status: 'ok', name: '知学AI · 每日冷知识 API' });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ success: false, message: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`知学AI 后端已启动: http://localhost:${PORT}`);
  console.log(`API 文档: http://localhost:${PORT}/api/`);
});
