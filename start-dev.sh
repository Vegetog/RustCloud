#!/bin/bash

# RustCloud 开发环境一键启动脚本
# 用法: ./start-dev.sh

set -e

echo "🚀 RustCloud 开发环境启动中..."
echo ""

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查是否在项目根目录
if [ ! -f "Cargo.toml" ]; then
    echo -e "${RED}❌ 错误: 请在项目根目录运行此脚本${NC}"
    exit 1
fi

# 1. 启动 Docker 依赖服务
echo -e "${BLUE}📦 步骤 1/3: 启动 Docker 依赖服务 (PostgreSQL, Redis, MinIO)...${NC}"
docker-compose -f docker-compose.dev.yml up -d

echo -e "${GREEN}✓ Docker 服务启动成功${NC}"
echo ""

# 等待数据库就绪
echo -e "${YELLOW}⏳ 等待数据库就绪...${NC}"
sleep 3

# 检查服务健康状态
echo -e "${BLUE}🔍 检查服务状态...${NC}"
docker-compose -f docker-compose.dev.yml ps

echo ""

# 2. 启动后端 API 服务
echo -e "${BLUE}🦀 步骤 2/3: 启动后端 API 服务...${NC}"

# 检查是否已经有 rustcloud-api 进程在运行
if pgrep -f "rustcloud-api" > /dev/null; then
    echo -e "${YELLOW}⚠️  后端 API 已在运行，跳过启动${NC}"
else
    # 后台启动 Rust API
    echo -e "${YELLOW}正在编译和启动后端 API (这可能需要几秒钟)...${NC}"
    RUST_LOG=rustcloud=debug cargo run --bin rustcloud-api > logs/api.log 2>&1 &
    API_PID=$!
    echo $API_PID > .api.pid

    # 等待 API 启动
    sleep 2

    # 检查 API 是否成功启动
    if ps -p $API_PID > /dev/null; then
        echo -e "${GREEN}✓ 后端 API 启动成功 (PID: $API_PID)${NC}"
        echo -e "${GREEN}  日志文件: logs/api.log${NC}"
        echo -e "${GREEN}  API 地址: http://localhost:8080${NC}"
    else
        echo -e "${RED}❌ 后端 API 启动失败，请检查日志: logs/api.log${NC}"
        exit 1
    fi
fi

echo ""

# 3. 启动前端开发服务器
echo -e "${BLUE}⚛️  步骤 3/3: 启动前端开发服务器...${NC}"

# 检查 node_modules 是否存在
if [ ! -d "web/node_modules" ]; then
    echo -e "${YELLOW}⚠️  检测到 node_modules 不存在，正在安装依赖...${NC}"
    cd web && npm install && cd ..
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✨ RustCloud 开发环境启动完成！${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}📋 服务信息:${NC}"
echo -e "  ${GREEN}前端:${NC}        http://localhost:3000"
echo -e "  ${GREEN}后端 API:${NC}    http://localhost:8080"
echo -e "  ${GREEN}PostgreSQL:${NC}  localhost:5432"
echo -e "  ${GREEN}Redis:${NC}       localhost:6379"
echo -e "  ${GREEN}MinIO API:${NC}   http://localhost:9000"
echo -e "  ${GREEN}MinIO 控制台:${NC} http://localhost:9001 (minioadmin/minioadmin)"
echo ""
echo -e "${YELLOW}📝 提示:${NC}"
echo -e "  • 前端日志将显示在当前终端"
echo -e "  • 后端日志: tail -f logs/api.log"
echo -e "  • 停止所有服务: ./stop-dev.sh"
echo -e "  • 按 Ctrl+C 停止前端服务器"
echo ""

# 进入 web 目录并启动前端（前台运行）
cd web
npm run dev
