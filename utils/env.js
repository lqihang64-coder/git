// utils/env.js
// 后端服务地址配置

const CURRENT_ENV = 'dev';

const ENV_CONFIG = {
  // 本地开发
  dev: {
    baseUrl: 'http://127.0.0.1:8080/api',
    serverRoot: 'http://127.0.0.1:8080'
  },
  // 火山引擎云服务器（部署后替换 IP）
  prod: {
    baseUrl: 'http://101.96.209.133:8080/api',
    serverRoot: 'http://101.96.209.133:8080'
  }
};

const config = ENV_CONFIG[CURRENT_ENV];

module.exports = {
  BASE_URL: config.baseUrl,
  SERVER_ROOT: config.serverRoot,
  ENV: CURRENT_ENV
};
