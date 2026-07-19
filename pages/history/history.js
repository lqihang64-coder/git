// pages/history/history.js
const { callCloud } = require('../../utils/request.js');

Page({
  data: {
    historyList: []
  },

  onLoad() {
    this.loadAllHistory();
  },

  loadAllHistory() {
    wx.showLoading({ title: '拾起记忆中...' });
    callCloud('userHistory', {})
      .then(res => {
        this.setData({ historyList: res.data || [] });
      })
      .catch(err => {
        wx.showToast({ title: '服务器连接异常', icon: 'none' });
      })
      .finally(() => wx.hideLoading());
  },

  onTapItem(e) {
    const title = e.currentTarget.dataset.title;
    if (!title) return;
    wx.navigateTo({
      url: `/pages/card-detail/card-detail?title=${encodeURIComponent(title)}`
    });
  }
});
