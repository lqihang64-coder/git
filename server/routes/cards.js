// server/routes/cards.js
const express = require('express');
const router = express.Router();
const db = require('../utils/db');

// 取卡片标签数量
const tagCount = (c) => (c.tags || '').split(',').filter(Boolean).length;

// 卡片标签列表
const cardTagList = (c) => (c.tags || '').split(',').map(t => t.trim()).filter(Boolean);

// 从匹配的卡片中：1) 优先匹配更多用户标签  2) 同匹配数时优先标签更少的（更聚焦）  3) 同数量随机
const pickBestCard = (cards, userTagList) => {
  if (!cards.length) return null;
  cards.sort((a, b) => {
    const tagsA = cardTagList(a);
    const tagsB = cardTagList(b);
    const matchA = tagsA.filter(ct => userTagList.some(ut => ct.includes(ut) || ut.includes(ct))).length;
    const matchB = tagsB.filter(ct => userTagList.some(ut => ct.includes(ut) || ut.includes(ct))).length;
    if (matchB !== matchA) return matchB - matchA;
    return tagsA.length - tagsB.length;
  });
  const bestA = cardTagList(cards[0]);
  const bestMatch = bestA.filter(ct => userTagList.some(ut => ct.includes(ut) || ut.includes(ct))).length;
  const bestCount = bestA.length;
  const topCards = cards.filter(c => {
    const tags = cardTagList(c);
    const m = tags.filter(ct => userTagList.some(ut => ct.includes(ut) || ut.includes(ct))).length;
    return m === bestMatch && tags.length === bestCount;
  });
  return topCards[Math.floor(Math.random() * topCards.length)];
};

// GET /api/card/daily
router.get('/daily', async (req, res) => {
  const { forceRefresh, tags, excludeId } = req.query;

  let card;

  // 如果有标签，优先匹配
  if (tags && tags.trim()) {
    const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);

    // Phase 1: LIKE 子串精确匹配
    let sql = 'SELECT * FROM cards WHERE ';
    const conditions = tagList.map(() => `tags LIKE ?`);
    sql += '(' + conditions.join(' OR ') + ')';

    if (forceRefresh === 'true' && excludeId) {
      sql += ' AND id != ?';
    }

    const params = tagList.map(t => `%${t}%`);
    if (forceRefresh === 'true' && excludeId) params.push(excludeId);

    const exactMatches = await db.all(sql, params);
    card = pickBestCard(exactMatches, tagList);

    // Phase 2: LIKE 未命中 → 双向模糊匹配
    if (!card) {
      let fallbackSql = 'SELECT * FROM cards';
      const fallbackParams = [];
      if (forceRefresh === 'true' && excludeId) {
        fallbackSql += ' WHERE id != ?';
        fallbackParams.push(excludeId);
      }
      const allCards = await db.all(fallbackSql, fallbackParams);
      const fuzzyMatches = allCards.filter(c => {
        const cardTags = (c.tags || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
        return tagList.some(userTag => {
          const ut = userTag.toLowerCase();
          return cardTags.some(ct => ct.includes(ut) || ut.includes(ct));
        });
      });
      card = pickBestCard(fuzzyMatches, tagList);
    }
  }

  // 降级：随机一张
  if (!card) {
    let sql = 'SELECT * FROM cards';
    const params = [];
    if (forceRefresh === 'true' && excludeId) {
      sql += ' WHERE id != ?';
      params.push(excludeId);
    }
    sql += ' ORDER BY RANDOM() LIMIT 1';
    card = await db.get(sql, params);
  }

  if (!card) {
    return res.json({
      success: false,
      message: '暂无所选兴趣的卡片',
      title: '暂无所选兴趣的卡片',
      subtitle: '题库正在扩容中'
    });
  }

  // 安全解析 quiz JSON 字段
  let quizOptions = [];
  if (card.quiz_question) {
    try {
      quizOptions = JSON.parse(card.quiz_options || '[]');
    } catch (e) {
      console.error('quiz_options JSON 解析失败:', card.id, e.message);
      quizOptions = [];
    }
  }

  res.json({
    success: true,
    _id: card.id,
    category: card.category,
    title: card.title,
    subtitle: card.subtitle,
    content: card.content,
    aiInsight: card.ai_insight,
    tags: card.tags ? card.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    quiz: card.quiz_question ? {
      question: card.quiz_question,
      options: quizOptions,
      correctIndex: card.quiz_correct_index,
      explanation: card.quiz_explanation
    } : null
  });
});

// GET /api/card/byTitle
router.get('/byTitle', async (req, res) => {
  const { title } = req.query;

  if (!title) {
    return res.status(400).json({ success: false, message: '缺少卡片标题' });
  }

  const card = await db.get('SELECT * FROM cards WHERE title = ? LIMIT 1', [title]);

  if (!card) {
    return res.status(404).json({ success: false, message: '卡片已被封存' });
  }

  res.json({
    success: true,
    _id: card.id,
    category: card.category,
    title: card.title,
    subtitle: card.subtitle,
    content: card.content,
    aiInsight: card.ai_insight,
    tags: card.tags ? card.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    quiz: card.quiz_question ? {
      question: card.quiz_question,
      options: JSON.parse(card.quiz_options || '[]'),
      correctIndex: card.quiz_correct_index,
      explanation: card.quiz_explanation
    } : null
  });
});

module.exports = router;
