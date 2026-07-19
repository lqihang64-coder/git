// server/routes/community.js
const express = require('express');
const router = express.Router();
const db = require('../utils/db');

// GET /api/community/list — 分页 + 用户信息 + 评论内容 + hasLiked + isOwner
router.get('/list', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;

  // 1. 帖子（JOIN 用户表获取作者信息）
  const posts = await db.all(`
    SELECT p.*, u.nickname, u.avatar_url
    FROM posts p
    JOIN users u ON p.openid = u.openid
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `, [limit, offset]);

  if (posts.length === 0) {
    const total = await db.get('SELECT COUNT(*) as count FROM posts');
    return res.json({ success: true, data: [], hasMore: false, page, total: total.count });
  }

  const postIds = posts.map(p => p.id);

  // 2. 批量查询这些帖子的所有评论（JOIN 用户表）
  const placeholders = postIds.map(() => '?').join(',');
  const comments = await db.all(`
    SELECT c.*, u.nickname, u.avatar_url
    FROM comments c
    JOIN users u ON c.openid = u.openid
    WHERE c.post_id IN (${placeholders})
    ORDER BY c.created_at ASC
  `, postIds);

  const commentsByPost = {};
  for (const c of comments) {
    if (!commentsByPost[c.post_id]) commentsByPost[c.post_id] = [];
    commentsByPost[c.post_id].push({
      id: c.id,
      content: c.content,
      createTime: c.created_at,
      author: {
        openid: c.openid,
        nickname: c.nickname,
        avatarUrl: c.avatar_url
      }
    });
  }

  // 3. 登录用户已点赞的帖子 ID 集合
  const likedSet = new Set();
  if (req.openid) {
    const likedRows = await db.all(`
      SELECT post_id FROM post_likes
      WHERE openid = ? AND post_id IN (${placeholders})
    `, [req.openid, ...postIds]);
    likedRows.forEach(r => likedSet.add(r.post_id));
  }

  // 4. 是否还有更多帖子
  const total = await db.get('SELECT COUNT(*) as count FROM posts');
  const hasMore = offset + limit < total.count;

  // 5. 组装响应
  const list = posts.map(post => ({
    id: post.id,
    content: post.content,
    likes: post.likes,
    aiReply: post.ai_reply || '',
    createTime: post.created_at,
    commentCount: (commentsByPost[post.id] || []).length,
    hasLiked: likedSet.has(post.id),
    isOwner: req.openid ? post.openid === req.openid : false,
    author: {
      openid: post.openid,
      nickname: post.nickname,
      avatarUrl: post.avatar_url
    },
    comments: commentsByPost[post.id] || []
  }));

  res.json({ success: true, data: list, hasMore, page, total: total.count });
});

// POST /api/community/publish
router.post('/publish', async (req, res) => {
  if (!req.openid) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  const openid = req.openid;
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, message: '内容不能为空' });
  }

  const result = await db.run(
    'INSERT INTO posts (openid, content, likes) VALUES (?, ?, 0)',
    [openid, content.trim()]
  );

  res.json({ success: true, postId: result.lastInsertRowid });
});

// POST /api/community/like — 持久化 + 去重（事务保证一致性）
router.post('/like', async (req, res) => {
  if (!req.openid) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  const { postId, isLike } = req.body;

  if (!postId) {
    return res.status(400).json({ success: false, message: '缺少帖子ID' });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const post = await tx.get('SELECT openid FROM posts WHERE id = ?', [postId]);
      if (!post) {
        throw { status: 404, message: '帖子不存在' };
      }

      const existing = await tx.get(
        'SELECT id FROM post_likes WHERE post_id = ? AND openid = ?',
        [postId, req.openid]
      );

      if (isLike) {
        if (existing) {
          const p = await tx.get('SELECT likes FROM posts WHERE id = ?', [postId]);
          return { already: true, likes: p.likes };
        }
        await tx.run('INSERT INTO post_likes (post_id, openid) VALUES (?, ?)', [postId, req.openid]);
        await tx.run('UPDATE posts SET likes = likes + 1 WHERE id = ?', [postId]);
        await tx.run('UPDATE users SET likes_received = likes_received + 1 WHERE openid = ?', [post.openid]);
      } else {
        if (!existing) {
          const p = await tx.get('SELECT likes FROM posts WHERE id = ?', [postId]);
          return { already: true, likes: p.likes };
        }
        await tx.run('DELETE FROM post_likes WHERE post_id = ? AND openid = ?', [postId, req.openid]);
        await tx.run('UPDATE posts SET likes = MAX(0, likes - 1) WHERE id = ?', [postId]);
        await tx.run('UPDATE users SET likes_received = MAX(0, likes_received - 1) WHERE openid = ?', [post.openid]);
      }

      const updated = await tx.get('SELECT likes FROM posts WHERE id = ?', [postId]);
      return { likes: updated.likes };
    });

    res.json({ success: true, likes: result.likes, already: result.already || false });
  } catch (e) {
    if (e.status) {
      res.status(e.status).json({ success: false, message: e.message });
    } else {
      // UNIQUE constraint violation → 并发重复点赞，幂等处理
      const p = await db.get('SELECT likes FROM posts WHERE id = ?', [postId]);
      res.json({ success: true, likes: p ? p.likes : 0, already: true });
    }
  }
});

// POST /api/community/comment — 返回新评论数据
router.post('/comment', async (req, res) => {
  if (!req.openid) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  const openid = req.openid;
  const { postId, content } = req.body;

  if (!postId || !content || !content.trim()) {
    return res.status(400).json({ success: false, message: '参数不完整' });
  }

  const result = await db.run(
    'INSERT INTO comments (post_id, openid, content) VALUES (?, ?, ?)',
    [postId, openid, content.trim()]
  );

  // 查询新评论 + 评论者信息
  const newComment = await db.get(`
    SELECT c.*, u.nickname, u.avatar_url
    FROM comments c
    JOIN users u ON c.openid = u.openid
    WHERE c.id = ?
  `, [result.lastInsertRowid]);

  res.json({
    success: true,
    comment: {
      id: newComment.id,
      content: newComment.content,
      createTime: newComment.created_at,
      author: {
        openid: newComment.openid,
        nickname: newComment.nickname,
        avatarUrl: newComment.avatar_url
      }
    }
  });
});

// DELETE /api/community/post — 删帖（仅作者）
router.delete('/post', async (req, res) => {
  if (!req.openid) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  const postId = req.query.postId;

  if (!postId) {
    return res.status(400).json({ success: false, message: '缺少帖子ID' });
  }

  const post = await db.get('SELECT openid FROM posts WHERE id = ?', [postId]);
  if (!post) {
    return res.status(404).json({ success: false, message: '帖子不存在' });
  }
  if (post.openid !== req.openid) {
    return res.status(403).json({ success: false, message: '无权删除他人帖子' });
  }

  // 事务级联删除：post_likes → comments → posts
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM post_likes WHERE post_id = ?', [postId]);
    await tx.run('DELETE FROM comments WHERE post_id = ?', [postId]);
    await tx.run('DELETE FROM posts WHERE id = ?', [postId]);
  });

  res.json({ success: true });
});

module.exports = router;
