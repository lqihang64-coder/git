// app.js
const { BASE_URL } = require('./utils/env.js');

App({
  onLaunch() {
    // 已有有效 token 和缓存则跳过登录，保持用户身份一致
    const token = wx.getStorageSync('token');
    const cache = wx.getStorageSync('user_profile_cache');
    if (token && cache) {
      this.globalData.userInfo = cache;
      this.globalData.isLogin = true;
      console.log('使用已缓存身份，跳过登录');
      return;
    }
    // 静默登录：wx.login → 后端 code2session → JWT token
    this.silentLogin();
  },

  silentLogin() {
    wx.login({
      success: (res) => {
        if (!res.code) return;

        // 直接用 wx.request（不经过 request.js，避免循环依赖）
        wx.request({
          url: BASE_URL + '/auth/login',
          method: 'POST',
          data: { code: res.code },
          header: { 'content-type': 'application/json' },
          success: (result) => {
            if (result.statusCode === 200 && result.data.success) {
              const { token, user } = result.data;
              wx.setStorageSync('token', token);
              this.globalData.userInfo = user;
              this.globalData.isLogin = true;
              wx.setStorageSync('user_profile_cache', user);
              console.log('登录成功:', user.nickname);
            }
          },
          fail: (err) => {
            console.error('登录请求失败:', err);
          }
        });
      }
    });
  },

  globalData: {
    isLogin: false,
    userInfo: null,
    currentCardContent: '',  // 跨页面传递给 AI 助教的卡片上下文
    cardCache: { current: null, next: null }  // L1 内存缓存
  },

  showToast(msg) {
    wx.showToast({ title: msg, icon: 'none' });
  }
});
