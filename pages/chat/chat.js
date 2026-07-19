// pages/chat/chat.js
const app = getApp();
const { callCloud } = require('../../utils/request.js');

// 简单 Markdown → HTML（支持 rich-text 组件渲染的标签子集）
function markdownToHtml(text) {
  if (!text) return '';
  let html = text;
  // 转义 HTML 特殊字符（除了我们后续要插入的标签）
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // 粗体 **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // 斜体 *text*（避免匹配 ** 残留）
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // 行内代码 `code`
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');
  // 标题 ### / ## / #
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // 无序列表 - item
  html = html.replace(/^- (.+)$/gm, '<p>• $1</p>');
  // 有序列表 1. item
  html = html.replace(/^\d+\. (.+)$/gm, '<p>$&</p>');
  // 换行
  html = html.replace(/\n\n/g, '<br/><br/>');
  html = html.replace(/\n/g, '<br/>');
  return html;
}

Page({
  data: {
    messages: [{
      role: 'ai',
      content: '你好！我是你的 AI 智能助教。我已经阅读了你当前学习的卡片上下文，关于这块知识点，你有什么深度疑问吗？随时向我提问！',
      contentHtml: markdownToHtml('你好！我是你的 AI 智能助教。我已经阅读了你当前学习的卡片上下文，关于这块知识点，你有什么深度疑问吗？随时向我提问！')
    }],
    inputText: '',
    toView: '',
    isLoading: false,
    currentContext: '',
    userAvatar: '',
    sessionId: ''       // 会话 ID，用于后端维护多轮对话记忆
  },

  onLoad() {
    // 生成唯一会话 ID
    this.setData({ sessionId: 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) });

    // 同步加载卡片上下文
    if (app.globalData.currentCardContent) {
      this.setData({ currentContext: app.globalData.currentCardContent });
    }

    // 加载用户头像（兼容旧 avatar 和新 avatarUrl）
    const cache = wx.getStorageSync('user_profile_cache');
    if (cache && (cache.avatarUrl || cache.avatar)) {
      this.setData({ userAvatar: cache.avatarUrl || cache.avatar });
    }
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  onSend() {
    const text = this.data.inputText.trim();
    if (!text || this.data.isLoading) return;

    // 1. 立即展示用户消息
    const newMsgs = [...this.data.messages, { role: 'user', content: text, contentHtml: markdownToHtml(text) }];
    const userMsgIndex = newMsgs.length - 1;

    this.setData({
      messages: newMsgs,
      inputText: '',
      isLoading: true,
      toView: `msg-${userMsgIndex}`
    });

    // 2. 发送给 chatAsk 云函数（带 sessionId + 完整 history）
    callCloud('chatAsk', {
      sessionId: this.data.sessionId,
      question: text,
      context: this.data.currentContext
    }).then(res => {
      const aiReply = res.answer || '抱歉，我的思绪稍微飘远了，能请你换个方式再问问吗？';

      const updatedMsgs = [...newMsgs, { role: 'ai', content: aiReply, contentHtml: markdownToHtml(aiReply) }];
      const aiMsgIndex = updatedMsgs.length - 1;

      this.setData({
        messages: updatedMsgs,
        isLoading: false,
        toView: `msg-${aiMsgIndex}`
      });
    }).catch(err => {
      console.error('AI助教通信链路异常:', err);
      const errorMsgs = [...newMsgs, {
        role: 'ai',
        content: '网络探索舱发生中转延迟，请确保云函数已部署。',
        contentHtml: markdownToHtml('网络探索舱发生中转延迟，请确保云函数已部署。')
      }];
      const errorIndex = errorMsgs.length - 1;

      this.setData({
        messages: errorMsgs,
        isLoading: false,
        toView: `msg-${errorIndex}`
      });
    });
  },

  onClearChat() {
    wx.showModal({
      title: '清空对话确认',
      content: '是否要清空当前的聊天记录并重新开启全新的探索提问？',
      confirmColor: '#4F46E5',
      success: (res) => {
        if (res.confirm) {
          // 重置会话 ID，开启新会话
          const newSessionId = 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
          this.setData({
            messages: [{
              role: 'ai',
              content: '历史档案已归档整理。我是你的随身 AI 助教，关于最新的知识要点，请尽情向我探索。',
              contentHtml: markdownToHtml('历史档案已归档整理。我是你的随身 AI 助教，关于最新的知识要点，请尽情向我探索。')
            }],
            inputText: '',
            toView: 'msg-0',
            isLoading: false,
            sessionId: newSessionId
          });
          wx.showToast({ title: '会话已刷新', icon: 'success' });
        }
      }
    });
  }
});
