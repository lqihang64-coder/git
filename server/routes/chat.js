// server/routes/chat.js
const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const deepseek = require('../utils/deepseek');

// POST /api/chat/ask
router.post('/ask', async (req, res) => {
  if (!req.openid) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  const openid = req.openid;
  const { sessionId, question, context } = req.body;

  if (!question || !question.trim()) {
    return res.status(400).json({ success: false, message: '问题不能为空' });
  }

  // 1. 加载历史消息
  const messages = [];

  if (context) {
    messages.push({
      role: 'system',
      content: `用户当前正在学习的知识卡片内容：${context}`
    });
  }

  if (sessionId) {
    const history = await db.all(
      'SELECT role, content FROM chat_sessions WHERE openid = ? AND session_id = ? ORDER BY timestamp ASC LIMIT 30',
      [openid, sessionId]
    );
    history.forEach(h => messages.push({ role: h.role, content: h.content }));
  }

  // 追加当前问题
  messages.push({ role: 'user', content: question.trim() });

  // 2. 调 DeepSeek
  const aiReply = await deepseek.chat(messages);

  // 3. 保存到数据库
  if (sessionId) {
    await db.run(
      'INSERT INTO chat_sessions (openid, session_id, role, content) VALUES (?, ?, ?, ?)',
      [openid, sessionId, 'user', question.trim()]
    );
    await db.run(
      'INSERT INTO chat_sessions (openid, session_id, role, content) VALUES (?, ?, ?, ?)',
      [openid, sessionId, 'assistant', aiReply]
    );
  }

  res.json({ success: true, answer: aiReply });
});

module.exports = router;
