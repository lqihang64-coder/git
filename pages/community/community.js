// pages/community/community.js
const app = getApp();
const { callCloud } = require('../../utils/request.js');
const { SERVER_ROOT } = require('../../utils/env.js');

// 补全相对路径为完整 URL（复用 profile.js 模式）
const fullUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return SERVER_ROOT + path;
};

Page({
  data: {
    showModal: false,
    postContent: '',
    posts: [],
    page: 1,
    hasMore: true,
    isLoading: false,
    isLoadingMore: false,
    isPublishing: false,
    currentUser: null
  },

  onLoad() {
    this.loadCurrentUser();
    this.fetchPosts();
  },

  onShow() {
    // 每次切回广场刷新当前用户信息
    this.loadCurrentUser();
  },

  loadCurrentUser() {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('user_profile_cache');
    if (userInfo) {
      this.setData({ currentUser: userInfo });
    }
  },

  fetchPosts(isRefresh = false, forcePage) {
    // 先确定目标页码（避免 setData 异步导致读到旧值）
    const targetPage = isRefresh ? 1 : (forcePage || this.data.page);

    if (isRefresh) {
      this.setData({ page: 1, hasMore: true });
    }

    const isFirstPage = targetPage === 1;
    const loadingKey = isFirstPage ? 'isLoading' : 'isLoadingMore';
    this.setData({ [loadingKey]: true });

    return callCloud('communityList', { page: targetPage })
      .then(res => {
        const list = res.data || [];

        const formattedPosts = list.map(post => ({
          id: post.id,
          content: post.content,
          likes: post.likes || 0,
          commentCount: post.commentCount || 0,
          aiReply: post.aiReply,
          time: this.formatTime(post.createTime),
          hasLiked: post.hasLiked || false,
          isOwner: post.isOwner || false,
          author: {
            openid: post.author?.openid || '',
            nickname: post.author?.nickname || '知学探索者',
            avatarUrl: fullUrl(post.author?.avatarUrl || '')
          },
          comments: (post.comments || []).map(c => ({
            id: c.id,
            content: c.content,
            createTime: c.createTime,
            author: {
              openid: c.author?.openid || '',
              nickname: c.author?.nickname || '知学探索者',
              avatarUrl: fullUrl(c.author?.avatarUrl || '')
            }
          }))
        }));

        this.setData({
          posts: isFirstPage ? formattedPosts : [...this.data.posts, ...formattedPosts],
          hasMore: res.hasMore !== false,
          [loadingKey]: false
        });
      })
      .catch(err => {
        console.error('获取社区列表失败', err);
        this.setData({ [loadingKey]: false });
        if (isFirstPage) {
          wx.showToast({ title: '加载失败，下拉重试', icon: 'none' });
        }
      })
      .finally(() => {
        if (isRefresh) wx.stopPullDownRefresh();
      });
  },

  onPullDownRefresh() {
    this.fetchPosts(true);
  },

  onScrollToLower() {
    if (this.data.isLoadingMore || !this.data.hasMore) return;
    const nextPage = this.data.page + 1;
    this.setData({ page: nextPage });
    // 直接传 nextPage，避免 setData 异步导致 fetchPosts 读到旧页码
    this.fetchPosts(false, nextPage);
  },

  onPublish() {
    const content = this.data.postContent.trim();
    if (!content) {
      wx.showToast({ title: '内容不能为空', icon: 'none' });
      return;
    }

    this.setData({ isPublishing: true });
    wx.showLoading({ title: '发布中...', mask: true });

    callCloud('communityPublish', { content })
      .then(() => {
        wx.showToast({ title: '发布成功', icon: 'success' });
        this.setData({ showModal: false, postContent: '' });
        // 刷新到第一页
        this.setData({ page: 1 });
        setTimeout(() => { this.fetchPosts(true); }, 800);
      })
      .catch(err => {
        console.error('发布失败', err);
      })
      .finally(() => {
        this.setData({ isPublishing: false });
        wx.hideLoading();
      });
  },

  onLike(e) {
    const index = e.currentTarget.dataset.index;
    const post = this.data.posts[index];
    if (!post) return;

    const newPosts = [...this.data.posts];
    const wasLiking = !post.hasLiked;

    // 乐观更新
    newPosts[index] = {
      ...newPosts[index],
      hasLiked: wasLiking,
      likes: wasLiking ? post.likes + 1 : Math.max(0, post.likes - 1)
    };
    this.setData({ posts: newPosts });

    callCloud('communityLike', { postId: post.id, isLike: wasLiking })
      .then(res => {
        if (res && res.success) {
          // 用服务端精确计数校准
          if (typeof res.likes === 'number') {
            newPosts[index].likes = res.likes;
            this.setData({ posts: newPosts });
          }
        } else {
          // 回滚
          newPosts[index] = {
            ...newPosts[index],
            hasLiked: !wasLiking,
            likes: post.likes
          };
          this.setData({ posts: newPosts });
        }
      })
      .catch(() => {
        // 网络异常回滚
        newPosts[index] = {
          ...newPosts[index],
          hasLiked: !wasLiking,
          likes: post.likes
        };
        this.setData({ posts: newPosts });
      });
  },

  onComment(e) {
    const index = e.currentTarget.dataset.index;
    const post = this.data.posts[index];
    if (!post) return;

    wx.showModal({
      title: '发表评论',
      editable: true,
      placeholderText: '写下你的想法...',
      success: (res) => {
        if (res.confirm && res.content) {
          const content = res.content.trim();
          if (!content) return;

          wx.showLoading({ title: '提交中...' });

          callCloud('communityComment', { postId: post.id, content })
            .then(response => {
              if (response.success && response.comment) {
                // 直接追加评论到本地列表
                const newPosts = [...this.data.posts];
                newPosts[index] = {
                  ...newPosts[index],
                  comments: [...(newPosts[index].comments || []), response.comment],
                  commentCount: (newPosts[index].commentCount || 0) + 1
                };
                this.setData({ posts: newPosts });
                wx.showToast({ title: '评论成功', icon: 'success' });
              } else {
                // 兜底：重新拉取
                this.fetchPosts(true);
              }
            })
            .catch(() => {
              wx.showToast({ title: '评论失败', icon: 'none' });
            })
            .finally(() => wx.hideLoading());
        }
      }
    });
  },

  onDelete(e) {
    const index = e.currentTarget.dataset.index;
    const post = this.data.posts[index];
    if (!post) return;

    wx.showModal({
      title: '删除帖子',
      content: '确定要删除这条动态吗？',
      confirmColor: '#EF4444',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          callCloud('communityDelete', { postId: post.id })
            .then(response => {
              if (response.success) {
                const newPosts = [...this.data.posts];
                newPosts.splice(index, 1);
                this.setData({ posts: newPosts });
                wx.showToast({ title: '已删除', icon: 'success' });
              } else {
                wx.showToast({ title: response.message || '删除失败', icon: 'none' });
              }
            })
            .catch(() => {
              wx.showToast({ title: '删除失败', icon: 'none' });
            })
            .finally(() => wx.hideLoading());
        }
      }
    });
  },

  // 头像加载失败时隐藏 image，让 wx:else 的首字母色块显示
  onAvatarError(e) {
    const index = e.currentTarget.dataset.index;
    if (index !== undefined) {
      const newPosts = [...this.data.posts];
      newPosts[index] = { ...newPosts[index], avatarError: true };
      this.setData({ posts: newPosts });
    }
  },

  // 根据昵称生成固定颜色（用于无头像时的首字母色块）
  avatarColor(nickname) {
    const colors = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#14B8A6'];
    if (!nickname) return colors[0];
    const idx = nickname.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % colors.length;
    return colors[idx];
  },

  formatTime(timeStr) {
    if (!timeStr) return '刚刚';
    if (typeof timeStr === 'object') {
      const d = new Date(timeStr);
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hour = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${month}-${day} ${hour}:${min}`;
    }
    return String(timeStr).replace('T', ' ').substring(5, 16);
  },

  openModal() { this.setData({ showModal: true }); },
  closeModal() { this.setData({ showModal: false }); },
  onInput(e) { this.setData({ postContent: e.detail.value }); }
});
