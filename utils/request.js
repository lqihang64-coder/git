// utils/request.js
// 统一 HTTP 请求封装 — callCloud 接口保持不变，内部映射到 REST API
const { BASE_URL } = require('./env.js');

// 云函数名 → HTTP 路由映射表
const ROUTE_MAP = {
  'login':             { method: 'POST', path: '/auth/login' },
  'cardDaily':         { method: 'GET',  path: '/card/daily' },
  'cardByTitle':       { method: 'GET',  path: '/card/byTitle' },
  'userInfo':          { method: 'GET',  path: '/user/info' },
  'userUpdateProfile': { method: 'POST', path: '/user/updateProfile' },
  'userCheckin':       { method: 'POST', path: '/user/checkin' },
  'userAddStudyLog':   { method: 'POST', path: '/user/addStudyLog' },
  'userHistory':       { method: 'GET',  path: '/user/history' },
  'chatAsk':           { method: 'POST', path: '/chat/ask' },
  'communityList':     { method: 'GET',  path: '/community/list' },
  'communityPublish':  { method: 'POST', path: '/community/publish' },
  'communityLike':     { method: 'POST', path: '/community/like' },
  'communityComment':  { method: 'POST', path: '/community/comment' },
  'communityDelete':   { method: 'DELETE', path: '/community/post' },
  'cardTags':         { method: 'GET',  path: '/tags/list' },
};

/**
 * 调用后端接口（兼容原 callCloud 接口，页面无需改动）
 * @param {string} name - 接口名
 * @param {object} data - 请求参数
 * @returns {Promise}
 */
const callCloud = (name, data = {}) => {
  const route = ROUTE_MAP[name];
  if (!route) {
    return Promise.reject(new Error(`未知接口: ${name}`));
  }

  const token = wx.getStorageSync('token');
  const header = { 'content-type': 'application/json' };
  if (token) {
    header['Authorization'] = `Bearer ${token}`;
  }

  // GET/DELETE 参数拼入 query string；POST/PUT 参数放 body
  const useQuery = route.method === 'GET' || route.method === 'DELETE';
  const url = useQuery
    ? BASE_URL + route.path + '?' + Object.keys(data)
        .filter(k => data[k] !== undefined && data[k] !== null && data[k] !== '')
        .map(k => `${k}=${encodeURIComponent(data[k])}`)
        .join('&')
    : BASE_URL + route.path;

  return new Promise((resolve, reject) => {
    wx.request({
      url: url,
      method: route.method,
      data: useQuery ? undefined : data,
      header: header,
      timeout: 30000,
      success: (res) => {
        if (res.statusCode === 200) {
          resolve(res.data);
        } else if (res.statusCode === 401) {
          wx.removeStorageSync('token');
          wx.showToast({ title: '请重新进入小程序', icon: 'none' });
          reject(new Error('未登录'));
        } else {
          const msg = (res.data && res.data.message) || `请求异常(${res.statusCode})`;
          reject(new Error(msg));
        }
      },
      fail: (err) => {
        console.error(`[${name}] 请求失败:`, err);
        let errorMsg = '网络连接失败';
        if (err.errMsg && err.errMsg.includes('timeout')) {
          errorMsg = '请求超时';
        } else if (err.errMsg && err.errMsg.includes('connect')) {
          errorMsg = '无法连接后端，请检查服务是否启动';
        }
        wx.showToast({ title: errorMsg, icon: 'none', duration: 2000 });
        reject(err);
      }
    });
  });
};

/**
 * 上传文件
 * @param {string} filePath - 本地文件路径
 * @returns {Promise<string>} 文件 URL
 */
const uploadFile = (filePath) => {
  const token = wx.getStorageSync('token');
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: BASE_URL + '/upload/image',
      filePath: filePath,
      name: 'file',
      header: token ? { 'Authorization': `Bearer ${token}` } : {},
      success: (res) => {
        if (res.statusCode === 200) {
          const data = JSON.parse(res.data);
          if (data.success && data.url) {
            resolve(data.url);
          } else {
            reject(new Error(data.message || '上传失败'));
          }
        } else {
          reject(new Error('上传失败'));
        }
      },
      fail: reject
    });
  });
};

module.exports = { callCloud, uploadFile };
