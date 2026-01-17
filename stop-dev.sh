#!/bin/bash

# RustCloud 开发环境停止脚本
# 用法: ./stop-dev.sh

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🛑 停止 RustCloud 开发环境...${NC}"
echo ""

# 1. 停止后端 API 服务
if [ -f ".api.pid" ]; then
    API_PID=$(cat .api.pid)
    if ps -p $API_PID > /dev/null 2>&1; then
        echo -e "${YELLOW}🦀 停止后端 API 服务 (PID: $API_PID)...${NC}"
        kill $API_PID
        echo -e "${GREEN}✓ 后端 API 已停止${NC}"
    else
        echo -e "${YELLOW}⚠️  后端 API 进程未运行${NC}"
    fi
    rm -f .api.pid
else
    echo -e "${YELLOW}⚠️  未找到 API PID 文件${NC}"
fi

# 2. 停止 Docker 依赖服务
echo -e "${YELLOW}📦 停止 Docker 依赖服务...${NC}"
docker-compose -f docker-compose.dev.yml down

echo ""
echo -e "${GREEN}✨ 所有服务已停止${NC}"
echo ""
echo -e "${YELLOW}提示: 如果前端开发服务器还在运行，请在其终端按 Ctrl+C 停止${NC}"
