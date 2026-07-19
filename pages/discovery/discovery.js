// pages/discovery/discovery.js
const app = getApp();
const { callCloud } = require('../../utils/request.js');
const { getUserTagString } = require('../../utils/tags.js');

Page({
  data: {
    loading: true,
    checkinDays: 12,
    hasCheckedIn: false,
    selectedOption: null,
    card: null,
    todayDate: ''
  },

  onLoad() {
    this.initDate();
    this.loadUserStats();
    this.fetchDailyCard();
  },

  onShow() {
    // 从其他 tab 切回时，检查标签是否有变化，有则刷新卡片
    const currentTags = getUserTagString();
    if (this._lastTags !== undefined && this._lastTags !== currentTags) {
      this._lastTags = currentTags;
      this.fetchDailyCard(true);
    } else if (this._lastTags === undefined) {
      this._lastTags = currentTags;
    }
    this.loadUserStats();
  },

  // 从缓存加载用户统计数据（打卡天数 + 今日打卡状态）
  loadUserStats() {
    const cache = wx.getStorageSync('user_profile_cache');
    if (cache && cache.checkinDays !== undefined) {
      this.setData({ checkinDays: cache.checkinDays });
    }
    // 检查今日是否已打卡
    const today = this.formatDateStr(new Date());
    const lastCheckinDate = wx.getStorageSync('last_checkin_date');
    if (lastCheckinDate === today) {
      this.setData({ hasCheckedIn: true });
    }
  },

  formatDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  initDate() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const weeks = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const weekDay = weeks[now.getDay()];
    this.setData({
      todayDate: `${month}月${day}日 · ${weekDay}`
    });
  },

  fetchDailyCard(forceRefresh = false) {
    // L1 内存缓存：非强制刷新时优先读内存
    if (!forceRefresh && app.globalData.cardCache.current) {
      this.setData({
        card: app.globalData.cardCache.current,
        loading: false,
        selectedOption: null
      });
      // 预加载下一张
      this.preloadNext(app.globalData.cardCache.current._id);
      return;
    }

    // 强制刷新 → 清空旧标签预加载的残留卡片
    if (forceRefresh) {
      app.globalData.cardCache.next = null;
    }

    this.setData({ loading: true });

    // L2 本地存储：先渲染旧卡片兜底
    const localCard = wx.getStorageSync('last_card');
    if (localCard && !forceRefresh) {
      this.setData({ card: localCard });
    }

    // 读取用户标签
    const userTags = getUserTagString();

    const currentCardId = this.data.card ? this.data.card._id : '';

    // 从云端获取卡片
    callCloud('cardDaily', {
      tags: userTags,
      forceRefresh: forceRefresh,
      excludeId: forceRefresh ? currentCardId : ''
    }).then(res => {
      // 检查 API 是否返回有效卡片
      if (!res || !res.success) {
        // 保留 L2 缓存兜底
        if (!this.data.card) {
          this.setData({ loading: false });
          wx.showToast({ title: res?.message || '暂无更多卡片', icon: 'none' });
        }
        return;
      }
      const card = res;
      // 写入 L1 内存缓存
      app.globalData.cardCache.current = card;
      // 写入 L2 本地存储
      wx.setStorageSync('last_card', card);

      this.setData({
        card: card,
        loading: false,
        selectedOption: null
      });

      // 记录学习日志
      if (card.title) {
        callCloud('userAddStudyLog', { title: card.title }).catch(() => {});
      }

      // 预加载下一张卡片
      this.preloadNext(card._id);
    }).catch(err => {
      this.handleError('网络连接失败');
    });
  },

  // 预加载下一张卡片到 L1 内存缓存
  preloadNext(currentId) {
    const userTags = getUserTagString();

    callCloud('cardDaily', {
      tags: userTags,
      forceRefresh: true,
      excludeId: currentId
    }).then(nextCard => {
      app.globalData.cardCache.next = nextCard;
    }).catch(() => {
      // 预加载失败不影响主流程
    });
  },

  handleError(msg) {
    wx.showToast({ title: msg, icon: 'none' });
    this.setData({ loading: false });
  },

  onCheckIn() {
    if (this.data.hasCheckedIn) return;

    callCloud('userCheckin', {}).then(res => {
      const newDays = this.data.checkinDays + 1;
      this.setData({
        hasCheckedIn: true,
        checkinDays: newDays
      });
      // 持久化打卡状态
      wx.setStorageSync('last_checkin_date', this.formatDateStr(new Date()));
      // 更新缓存中的天数
      const cache = wx.getStorageSync('user_profile_cache') || {};
      cache.checkinDays = newDays;
      wx.setStorageSync('user_profile_cache', cache);

      wx.vibrateShort({ type: 'medium' });
      wx.showToast({ title: '已记录你的进步', icon: 'success' });
    }).catch(() => {
      wx.showToast({ title: '打卡失败，请重试', icon: 'none' });
    });
  },

  onSelectOption(e) {
    if (this.data.selectedOption !== null) return;
    // 卡片无 quiz 时点击选项不做任何反应
    if (!this.data.card || !this.data.card.quiz) return;
    const index = e.currentTarget.dataset.index;
    this.setData({ selectedOption: index });

    if (this.data.card.quiz && index === this.data.card.quiz.correctIndex) {
      wx.vibrateShort({ type: 'light' });
    } else {
      wx.vibrateLong();
    }
  },

  onNextCard() {
    // 优先使用预加载的卡片
    if (app.globalData.cardCache.next) {
      app.globalData.cardCache.current = app.globalData.cardCache.next;
      app.globalData.cardCache.next = null;
      wx.setStorageSync('last_card', app.globalData.cardCache.current);
      this.setData({
        card: app.globalData.cardCache.current,
        selectedOption: null
      });
      // 记录 + 预加载下一张
      callCloud('userAddStudyLog', { title: app.globalData.cardCache.current.title }).catch(() => {});
      this.preloadNext(app.globalData.cardCache.current._id);
    } else {
      this.fetchDailyCard(true);
    }
    wx.pageScrollTo({ scrollTop: 0, duration: 400 });
  },

  onOpenChat() {
    if (this.data.card) {
      app.globalData.currentCardContent = this.data.card.content;
    }
    wx.navigateTo({ url: '/pages/chat/chat' });
  }
});
