// pages/profile/profile.js
const app = getApp();
const { callCloud, uploadFile } = require('../../utils/request.js');
const { parseTags, joinTags } = require('../../utils/tags.js');
const { SERVER_ROOT } = require('../../utils/env.js');

// 补全相对路径为完整 URL
const fullUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return SERVER_ROOT + path;
};

Page({
  data: {
    user: {
      nickname: "加载中...",
      avatar: "",
      tags: [],
      checkinDays: 0,
      cardsRead: 0,
      likesReceived: 0,
      level: 1,
      levelName: "探索者",
      timeline: []
    },
    isFirstLoad: true,
    showTagSheet: false,
    recommendTags: [],
    selectedTagMap: {},
    avatarDisplay: ''  // HTTP 头像转换后的本地路径
  },

  onLoad() {
    this.renderFromCache();
    this.fetchAvailableTags();
  },

  onShow() {
    this.fetchUserProfile(false);
  },

  async onPullDownRefresh() {
    await this.fetchUserProfile(true);
    wx.stopPullDownRefresh();
  },

  renderFromCache() {
    const cache = wx.getStorageSync('user_profile_cache');
    if (cache) {
      this.setData({ user: cache });
      // 兼容旧缓存（avatar）和新格式（avatarUrl）
      this._loadAvatarDisplay(cache.avatarUrl || cache.avatar);
    }
  },

  fetchUserProfile(isSilent = false) {
    if (!isSilent && this.data.isFirstLoad) {
      wx.showLoading({ title: '同步探索空间...' });
    }

    return callCloud('userInfo', {})
      .then(res => {
        const userData = this.adaptBackendData(res);
        // 缓存存服务端 URL，同步时原样发送
        wx.setStorageSync('user_profile_cache', userData);
        this.setData({ user: userData, isFirstLoad: false });
        // HTTP 头像转本地路径供 image 组件显示
        this._loadAvatarDisplay(userData.avatar);
      })
      .catch(err => {
        console.error("网络档案请求异常:", err);
      })
      .finally(() => {
        wx.hideLoading();
        this.setData({ isFirstLoad: false });
      });
  },

  // HTTP 头像 → 本地临时路径（小程序 image 组件不支持 HTTP）
  _loadAvatarDisplay(serverUrl) {
    if (!serverUrl || !serverUrl.startsWith('http://')) {
      this.setData({ avatarDisplay: serverUrl || '' });
      return;
    }
    wx.downloadFile({
      url: serverUrl,
      success: (res) => this.setData({ avatarDisplay: res.tempFilePath }),
      fail: () => this.setData({ avatarDisplay: '' })
    });
  },

  adaptBackendData(data) {
    const safeData = data || {};
    const u = safeData.user || {};

    return {
      nickname: u.nickname || "知学探索者",
      avatar: fullUrl(u.avatarUrl),
      tags: parseTags(u.tags),
      checkinDays: u.checkinDays || 0,
      cardsRead: safeData.cardsRead || 0,
      likesReceived: u.likesReceived || 0,
      level: u.level || 1,
      levelName: u.levelName || "探索者",
      timeline: safeData.timeline || []
    };
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    // 立即显示本地临时图
    this.setData({ 'user.avatar': avatarUrl, avatarDisplay: avatarUrl });

    uploadFile(avatarUrl).then(fileID => {
      const serverUrl = fullUrl(fileID);
      // 存入服务端 URL（缓存 & 同步用），显示走本地下载
      this.setData({ 'user.avatar': serverUrl });
      this._loadAvatarDisplay(serverUrl);
      this.syncProfileToBackend();
    }).catch(err => {
      console.error('头像上传失败:', err);
    });
  },

  onNicknameChange(e) {
    const nickname = e.detail.value.trim();
    if (!nickname) return;
    this.setData({ 'user.nickname': nickname });
    this.syncProfileToBackend();
  },

  openTagSheet() {
    this._updateSelectedMap();
    this.setData({ showTagSheet: true });
  },
  closeTagSheet() { this.setData({ showTagSheet: false }); },

  fetchAvailableTags() {
    callCloud('cardTags', {}).then(res => {
      if (res.success && res.data && res.data.length) {
        // 合并用户已选标签，确保孤儿标签（旧数据残留）也能在弹窗中显示并取消
        const apiTags = res.data.map(t => t.name);
        const userTags = this.data.user.tags || [];
        const merged = [...new Set([...apiTags, ...userTags])];
        this.setData({ recommendTags: merged });
        this._updateSelectedMap();
      }
    }).catch(() => {
      // 网络失败时用默认值兜底，同样合并用户已选标签
      if (!this.data.recommendTags.length) {
        const defaults = ['Java', '架构', '计算机科学', '心理学', '自我提升', '历史', '艺术', '经济管理', 'AI大模型', '前端开发'];
        const userTags = this.data.user.tags || [];
        const merged = [...new Set([...defaults, ...userTags])];
        this.setData({ recommendTags: merged });
        this._updateSelectedMap();
      }
    });
  },

  _updateSelectedMap() {
    const map = {};
    (this.data.user.tags || []).forEach(t => { if (t) map[t] = true; });
    this.setData({ selectedTagMap: map });
  },

  toggleTag(e) {
    const selectedTag = e.currentTarget.dataset.tag;
    let tags = [...this.data.user.tags];
    const index = tags.indexOf(selectedTag);

    if (index > -1) {
      tags.splice(index, 1);
    } else {
      if (tags.length >= 8) {
        wx.showToast({ title: '最多只能订阅 8 个兴趣领域哦', icon: 'none' });
        return;
      }
      tags.push(selectedTag);
    }
    this.setData({ 'user.tags': tags });
    this._updateSelectedMap();
  },

  saveTags() {
    this.syncProfileToBackend();
    this.closeTagSheet();
    wx.showToast({ title: '知识分类库已对齐 ✨', icon: 'success' });
  },

  syncProfileToBackend() {
    const u = this.data.user;
    const tagString = joinTags(u.tags);

    // 乐观更新缓存（先写，确保其他页面立即可读到最新标签）
    wx.setStorageSync('user_profile_cache', u);

    callCloud('userUpdateProfile', {
      nickname: u.nickname,
      avatarUrl: u.avatar,
      tags: tagString
    }).catch(err => {
      console.error("上报数据持久化失败:", err);
    });
  },

  onGoToHistory() {
    wx.navigateTo({
      url: '/pages/history/history'
    });
  }
});
