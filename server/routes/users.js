// server/routes/users.js
const express = require('express');
const router = express.Router();
const db = require('../utils/db');

// GET /api/user/info
router.get('/info', async (req, res) => {
  if (!req.openid) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  const openid = req.openid;

  const user = await db.get('SELECT * FROM users WHERE openid = ?', [openid]);
  if (!user) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }

  const studyCount = await db.get('SELECT COUNT(*) as count FROM study_logs WHERE openid = ?', [openid]);

  const timeline = await db.all(
    'SELECT title, read_at FROM study_logs WHERE openid = ? ORDER BY read_at DESC LIMIT 5',
    [openid]
  );

  res.json({
    success: true,
    user: {
      nickname: user.nickname,
      avatarUrl: user.avatar_url,
      tags: user.tags ? user.tags.split(',').filter(Boolean) : [],
      checkinDays: user.checkin_days,
      level: user.level,
      levelName: user.level_name,
      likesReceived: user.likes_received || 0
    },
    cardsRead: studyCount.count,
    timeline: timeline.map(t => ({ title: t.title, time: t.read_at }))
  });
});

// POST /api/user/updateProfile
router.post('/updateProfile', async (req, res) => {
  if (!req.openid) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  const openid = req.openid;
  const { nickname, avatarUrl, tags } = req.body;

  const updates = [];
  const params = [];

  if (nickname !== undefined) { updates.push('nickname = ?'); params.push(nickname); }
  if (avatarUrl !== undefined) { updates.push('avatar_url = ?'); params.push(avatarUrl); }
  if (tags !== undefined) {
    const tagStr = typeof tags === 'string' ? tags : (Array.isArray(tags) ? tags.join(',') : '');
    updates.push('tags = ?');
    params.push(tagStr);
  }

  if (updates.length === 0) {
    return res.status(400).json({ success: false, message: '没有需要更新的字段' });
  }

  params.push(openid);
  await db.run(`UPDATE users SET ${updates.join(', ')} WHERE openid = ?`, params);

  res.json({ success: true });
});

// POST /api/user/checkin
router.post('/checkin', async (req, res) => {
  if (!req.openid) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  const openid = req.openid;

  const today = new Date().toISOString().split('T')[0];

  const exist = await db.get(
    'SELECT COUNT(*) as count FROM checkins WHERE openid = ? AND date = ?',
    [openid, today]
  );

  if (exist.count > 0) {
    return res.json({ success: false, message: '今日已打卡' });
  }

  // 检查上次打卡日期，断签则重置计数
  const lastCheckin = await db.get(
    'SELECT date FROM checkins WHERE openid = ? ORDER BY date DESC LIMIT 1',
    [openid]
  );

  if (lastCheckin) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (lastCheckin.date === yesterdayStr) {
      await db.run('UPDATE users SET checkin_days = checkin_days + 1 WHERE openid = ?', [openid]);
    } else if (lastCheckin.date !== today) {
      await db.run('UPDATE users SET checkin_days = 1 WHERE openid = ?', [openid]);
    }
  } else {
    await db.run('UPDATE users SET checkin_days = 1 WHERE openid = ?', [openid]);
  }

  await db.run('INSERT INTO checkins (openid, date) VALUES (?, ?)', [openid, today]);

  res.json({ success: true });
});

// POST /api/user/addStudyLog
// 静默记录，无 openid 时跳过
router.post('/addStudyLog', async (req, res) => {
  if (!req.openid) {
    return res.json({ success: true, skipped: true });
  }
  const openid = req.openid;
  const { title } = req.body;

  if (!title) {
    return res.json({ success: false, message: '缺少卡片标题' });
  }

  await db.run('INSERT INTO study_logs (openid, title) VALUES (?, ?)', [openid, title]);

  res.json({ success: true });
});

// GET /api/user/history
router.get('/history', async (req, res) => {
  if (!req.openid) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  const openid = req.openid;

  const list = await db.all(
    'SELECT title, read_at as time FROM study_logs WHERE openid = ? ORDER BY read_at DESC LIMIT 50',
    [openid]
  );

  res.json({ success: true, data: list });
});

module.exports = router;
