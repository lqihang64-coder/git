Component({
  options: {
    multipleSlots: true // 允许组件使用 slot
  },

  properties: {
    card: {
      type: Object,
      value: {}
    }
  },

  data: {
    isPlaying: false
  },

  // 组件生命周期
  lifetimes: {
    attached() {
      // 1. 在组件加载时初始化音频实例
      this.audioCtx = wx.createInnerAudioContext();
      
      // 2. 监听播放自然结束
      this.audioCtx.onEnded(() => {
        this.setData({ isPlaying: false });
      });

      // 3. 监听播放错误
      this.audioCtx.onError((res) => {
        console.error('音频播放失败', res);
        this.setData({ isPlaying: false });
        wx.showToast({
          title: '无法播放音频',
          icon: 'none'
        });
      });
    },

    detached() {
      // 4. 组件销毁时释放资源，防止内存泄漏
      if (this.audioCtx) {
        this.audioCtx.destroy();
      }
    }
  },

  methods: {
    onPlaySound() {
      // 场景 A: 如果正在播放，点击则停止
      if (this.data.isPlaying) {
        this.audioCtx.stop();
        this.setData({ isPlaying: false });
        return;
      }

      // 场景 B: 如果未播放，点击则开始
      this.setData({ isPlaying: true });
      
      // 震动反馈，增加实体感
      wx.vibrateShort({ type: 'light' });

      // 设置音频源
      // 这里使用了有道词典的公共 TTS 接口进行演示
      // type=1 为英式发音，type=2 为美式发音。由于是有道，读中文标题也没问题。
      const textToRead = this.properties.card.title || '今日探索';
      this.audioCtx.src = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(textToRead)}&type=1`;
      
      // 播放
      this.audioCtx.play();
    }
  }
});