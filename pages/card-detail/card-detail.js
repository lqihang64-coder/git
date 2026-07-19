// pages/card-detail/card-detail.js
const { callCloud } = require('../../utils/request.js');

Page({
  data: {
    card: null
  },

  onLoad(options) {
    if (options.title) {
      this.fetchCardDetail(decodeURIComponent(options.title));
    }
  },

  fetchCardDetail(title) {
    wx.showLoading({ title: '正在调阅知识库...' });
    callCloud('cardByTitle', { title: title })
      .then(res => {
        this.setData({ card: res });
      })
      .catch(err => {
        wx.showToast({ title: '卡片已被封存', icon: 'none' });
      })
      .finally(() => wx.hideLoading());
  }
});
