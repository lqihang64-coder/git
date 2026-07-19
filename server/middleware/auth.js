// server/middleware/auth.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'zhixue-ai-secret-key-2024';

// JWT 验证中间件 — 提取用户身份，不强制拦截
// 需要登录的路由自行检查 req.openid 是否存在
function authMiddleware(req, res, next) {
  // 白名单：登录接口直接放行
  if (req.path === '/auth/login') {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.openid = decoded.openid;
      return next();
    } catch (err) {
      return res.status(401).json({ success: false, message: '登录已过期' });
    }
  }

  // 无身份信息，放行但无 openid（公开接口可用，需登录接口自行检查 req.openid）
  next();
}

// 生成 JWT token
function generateToken(openid) {
  return jwt.sign({ openid }, JWT_SECRET, { expiresIn: '30d' });
}

module.exports = { authMiddleware, generateToken, JWT_SECRET };
