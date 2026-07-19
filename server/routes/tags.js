// server/routes/tags.js
const express = require('express');
const router = express.Router();
const db = require('../utils/db');

// GET /api/tags/list
// 从 cards 表提取所有不重复标签，按卡片数量降序
router.get('/list', async (req, res) => {
  const cards = await db.all('SELECT tags FROM cards');
  const tagCount = {};
  cards.forEach(c => {
    if (c.tags) {
      c.tags.split(',').map(t => t.trim()).filter(Boolean).forEach(t => {
        tagCount[t] = (tagCount[t] || 0) + 1;
      });
    }
  });
  const list = Object.entries(tagCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  res.json({ success: true, data: list });
});

module.exports = router;
