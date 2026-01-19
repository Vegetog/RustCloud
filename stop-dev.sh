#!/bin/bash

# RustCloud 停止开发环境脚本

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

info "停止 RustCloud 开发环境..."

# 停止 Docker Compose 服务
docker-compose down

success "所有服务已停止"

# 询问是否删除数据卷
read -p "是否删除数据卷（这会清空数据库和存储的文件）? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker-compose down -v
    success "数据卷已删除"
    warning "下次启动需要重新初始化数据库"
fi
