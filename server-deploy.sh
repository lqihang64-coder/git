#!/bin/bash
# 知学AI — 服务器一键部署脚本
# 通过宝塔面板 → 文件管理 → 上传 server-deploy.tar.gz + 此脚本 → 终端执行

set -e

APP_DIR="/opt/daily-fact"
DEPLOY_PKG="server-deploy.tar.gz"

echo "===== 1. 检查 Node.js ====="
if command -v node &>/dev/null; then
    echo "Node.js 已安装: $(node --version)"
else
    echo "安装 Node.js 18 LTS..."
    cd /tmp
    if [ "$(uname -m)" = "aarch64" ]; then
        NODE_URL="https://npmmirror.com/mirrors/node/v18.20.4/node-v18.20.4-linux-arm64.tar.xz"
    else
        NODE_URL="https://npmmirror.com/mirrors/node/v18.20.4/node-v18.20.4-linux-x64.tar.xz"
    fi
    curl -L --max-time 120 -o node.tar.xz "$NODE_URL"
    tar -xf node.tar.xz -C /usr/local/ --strip-components=1
    rm -f node.tar.xz
    echo "Node.js 安装完成: $(node --version)"
    echo "npm 版本: $(npm --version)"
fi

echo ""
echo "===== 2. 解压部署包 ====="
mkdir -p "$APP_DIR"
tar -xzf "$DEPLOY_PKG" -C "$APP_DIR" --strip-components=1
echo "代码已部署到: $APP_DIR"

echo ""
echo "===== 3. 安装依赖 ====="
cd "$APP_DIR"
npm install --production 2>&1 | tail -5
echo "依赖安装完成"

echo ""
echo "===== 4. 检查环境变量 ====="
if [ -z "$DEEPSEEK_API_KEY" ]; then
    echo "⚠️  未设置 DEEPSEEK_API_KEY，AI 对话功能暂不可用"
    echo "   设置方法: export DEEPSEEK_API_KEY=sk-your-key"
fi

echo ""
echo "===== 5. 停止旧进程 ====="
pkill -f "node app.js" 2>/dev/null || echo "无旧进程"

echo ""
echo "===== 6. 启动服务 ====="
nohup node app.js > /opt/daily-fact/server.log 2>&1 &
sleep 2

if pgrep -f "node app.js" > /dev/null; then
    echo "✅ 服务启动成功!"
    echo "   API 地址: http://101.96.209.133:8080/"
    echo "   健康检查: curl http://127.0.0.1:8080/"
    echo "   日志文件: /opt/daily-fact/server.log"
else
    echo "❌ 服务启动失败，查看日志: cat /opt/daily-fact/server.log"
fi
