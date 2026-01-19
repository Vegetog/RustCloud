#!/bin/bash

# RustCloud 开发环境启动脚本

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

# 步骤1: 检查环境
info "检查开发环境..."

if ! command -v docker &> /dev/null; then
    error "Docker 未安装，请先安装 Docker"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    error "Docker Compose 未安装"
    exit 1
fi

if ! command -v cargo &> /dev/null; then
    error "Rust 未安装，请运行: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi

success "环境检查通过"

# 步骤2: 创建 .env 文件（如果不存在）
if [ ! -f .env ]; then
    warning ".env 文件不存在，正在创建默认配置..."
    cat > .env << 'EOF'
# 服务器配置
SERVER_HOST=0.0.0.0
SERVER_PORT=8080

# 数据库配置
DATABASE_URL=postgres://rustcloud:rustcloud_dev@localhost:5432/rustcloud
DATABASE_MAX_CONNECTIONS=20

# Redis 配置
REDIS_URL=redis://localhost:6379

# MinIO 配置
STORAGE_BACKEND=minio
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_BUCKET=rustcloud
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin

# JWT 配置
JWT_SECRET=your-super-secret-key-at-least-32-bytes-long-replace-me
JWT_ACCESS_TOKEN_TTL=3600
JWT_REFRESH_TOKEN_TTL=604800

# 日志配置
RUST_LOG=rustcloud=debug,tower_http=debug,sqlx=info
EOF
    success ".env 文件已创建"
fi

# 步骤3: 启动依赖服务
info "启动依赖服务（PostgreSQL, Redis, MinIO）..."

if ! docker-compose ps | grep -q "Up"; then
    docker-compose up -d
else
    warning "依赖服务已在运行"
fi

# 步骤4: 等待服务就绪
info "等待服务启动..."

# 等待 PostgreSQL
echo -n "  等待 PostgreSQL"
for i in {1..30}; do
    if docker exec rustcloud-postgres pg_isready -U rustcloud &> /dev/null; then
        break
    fi
    echo -n "."
    sleep 1
done
echo ""
success "PostgreSQL 就绪"

# 等待 Redis
echo -n "  等待 Redis"
for i in {1..30}; do
    if docker exec rustcloud-redis redis-cli ping &> /dev/null; then
        break
    fi
    echo -n "."
    sleep 1
done
echo ""
success "Redis 就绪"

# 等待 MinIO
echo -n "  等待 MinIO"
for i in {1..30}; do
    if curl -s http://localhost:9000/minio/health/live &> /dev/null; then
        break
    fi
    echo -n "."
    sleep 1
done
echo ""
success "MinIO 就绪"

# 步骤5: 初始化 MinIO 存储桶
info "初始化 MinIO 存储桶..."

# 配置 mc 客户端
docker exec rustcloud-minio mc alias set local http://localhost:9000 minioadmin minioadmin 2>/dev/null || true

# 创建存储桶（如果不存在）
if ! docker exec rustcloud-minio mc ls local/rustcloud &> /dev/null; then
    docker exec rustcloud-minio mc mb local/rustcloud
    success "存储桶 'rustcloud' 已创建"
else
    warning "存储桶 'rustcloud' 已存在"
fi

# 步骤6: 数据库迁移
if command -v sea-orm-cli &> /dev/null; then
    info "运行数据库迁移..."
    sea-orm-cli migrate up
    success "数据库迁移完成"
else
    warning "sea-orm-cli 未安装，跳过数据库迁移"
    warning "安装命令: cargo install sea-orm-cli"
fi

# 步骤7: 显示服务信息
echo ""
info "═══════════════════════════════════════════════════"
success "开发环境启动完成！"
info "═══════════════════════════════════════════════════"
echo ""
echo "📊 服务信息:"
echo "  - API 服务:        http://localhost:8080"
echo "  - MinIO 控制台:    http://localhost:9001 (minioadmin/minioadmin)"
echo "  - PostgreSQL:      localhost:5432 (rustcloud/rustcloud_dev)"
echo "  - Redis:           localhost:6379"
echo ""
echo "🚀 启动后端服务:"
echo "  cargo run --bin rustcloud-api"
echo ""
echo "🎨 启动前端服务 (可选):"
echo "  cd web && npm run dev"
echo ""
echo "🛑 停止所有服务:"
echo "  docker-compose down"
echo ""
info "═══════════════════════════════════════════════════"
echo ""

# 步骤8: 询问是否启动后端
read -p "是否立即启动后端服务? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    info "启动后端服务..."
    cargo run --bin rustcloud-api
fi
