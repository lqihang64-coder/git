// server/routes/upload.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

// 配置文件存储
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, Date.now() + '_' + Math.random().toString(36).slice(2, 8) + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// POST /api/upload/image
router.post('/image', (req, res, next) => {
  if (!req.openid) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  next();
}, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: '请选择图片' });
  }

  const url = '/uploads/' + req.file.filename;
  res.json({ success: true, url });
});

module.exports = router;
