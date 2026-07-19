// utils/tags.js
// 标签工具函数 — 统一处理标签的数组/字符串转换，消除各处重复代码

/**
 * 将标签转为数组（兼容 string / array / null / undefined）
 * @param {string|string[]|null|undefined} tags
 * @returns {string[]}
 */
const parseTags = (tags) => {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.filter(t => typeof t === 'string' && t.trim());
  if (typeof tags === 'string') return tags.split(',').map(t => t.trim()).filter(Boolean);
  return [];
};

/**
 * 将标签数组转为逗号分隔字符串（传给 API）
 * @param {string[]} tags
 * @returns {string}
 */
const joinTags = (tags) => {
  if (!tags || !tags.length) return '';
  return tags.filter(t => typeof t === 'string' && t.trim()).join(',');
};

/**
 * 从缓存中读取用户标签，返回逗号分隔字符串（直接可传 API）
 * @returns {string}
 */
const getUserTagString = () => {
  try {
    const cache = wx.getStorageSync('user_profile_cache');
    if (!cache || !cache.tags) return '';
    return joinTags(parseTags(cache.tags));
  } catch (e) {
    return '';
  }
};

module.exports = { parseTags, joinTags, getUserTagString };
