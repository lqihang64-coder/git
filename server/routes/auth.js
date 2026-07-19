// server/routes/auth.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../utils/db');
const { generateToken } = require('../middleware/auth');

const APPID = process.env.WX_APPID || 'wx307fcb4d9234d1c2';
const SECRET = process.env.WX_SECRET || '';

// POST /api/auth/login
// 微信小程序静默登录：code → openid → 注册/返回 JWT
router.post('/login', async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.json({ success: false, message: '缺少登录凭证' });
  }

  let openid;
  if (!SECRET) {
    openid = 'wx_dev_' + require('crypto').createHash('md5').update(code).digest('hex').slice(0, 16);
  } else {
    try {
      const wxRes = await axios.get('https://api.weixin.qq.com/sns/jssdk-code2session', {
        params: {
          appid: APPID,
          secret: SECRET,
          js_code: code,
          grant_type: 'authorization_code'
        }
      });

      if (wxRes.data.errcode) {
        console.error('微信登录失败:', wxRes.data);
        return res.json({ success: false, message: '微信登录失败' });
      }
      openid = wxRes.data.openid;
    } catch (err) {
      console.warn('code2session 调用失败，使用降级方案:', err.message);
      openid = 'wx_dev_' + require('crypto').createHash('md5').update(code).digest('hex').slice(0, 16);
    }
  }

  // 查用户是否已存在
  const existUser = await db.get('SELECT * FROM users WHERE openid = ?', [openid]);
  let user, isNewUser = false;

  if (existUser) {
    user = existUser;
  } else {
    // 静默注册
    const result = await db.run(
      'INSERT INTO users (openid, nickname, avatar_url, tags, checkin_days, level, level_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [openid, '知学探索者', '', '', 0, 1, '探索者']
    );
    user = await db.get('SELECT * FROM users WHERE id = ?', [result.lastInsertRowid]);
    isNewUser = true;
  }

  const token = generateToken(openid);

  // 格式化返回
  const userData = {
    nickname: user.nickname,
    avatarUrl: user.avatar_url,
    tags: user.tags ? user.tags.split(',').filter(Boolean) : [],
    checkinDays: user.checkin_days,
    level: user.level,
    levelName: user.level_name
  };

  res.json({
    success: true,
    token,
    openid,
    user: userData,
    isNewUser
  });
});

module.exports = router;
