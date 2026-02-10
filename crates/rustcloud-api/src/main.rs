//! # RustCloud API Server
//!
//! 这是 RustCloud 的主程序入口

use axum::{
    routing::get,
    Router,
    Json,
};
use serde_json::json;
use std::net::SocketAddr;
use tracing::info;

// 引入 rustcloud-core 模块
// use rustcloud_core::{AppConfig, RustCloudError, Result};

/// 健康检查处理器
async fn health_check() -> Json<serde_json::Value> {
    Json(json!({
        "status": "ok",
        "service": "RustCloud API",
        "version": "0.1.0"
    }))
}

/// 获取配置信息（仅用于演示）
async fn get_config() -> Json<serde_json::Value> {
    // 演示配置信息
    let config_info = json!({
        "message": "配置已加载",
        "storage_backend": "local"
    });

    Json(config_info)
}

/// 主函数
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 1. 初始化日志系统
    tracing_subscriber::fmt()
        .with_target(true)
        .with_line_number(true)
        .init();

    info!("🚀 Starting RustCloud API Server...");

    // 2. 加载 .env 文件
    dotenv::dotenv().ok();

    // 3. 加载配置（如果有 .env 文件的话）
    // let config = AppConfig::from_env()?;

    // 演示：使用默认配置
    let host = "0.0.0.0";
    let port = 8080;

    info!("📊 Configuration loaded");
    info!("   - Host: {}", host);
    info!("   - Port: {}", port);

    // 4. 构建路由
    let app = Router::new()
        .route("/", get(|| async { "Welcome to RustCloud API!" }))
        .route("/health", get(health_check))
        .route("/api/v1/config", get(get_config));

    info!("🛣️  Routes configured:");
    info!("   - GET  /");
    info!("   - GET  /health");
    info!("   - GET  /api/v1/config");

    // 5. 启动 HTTP 服务器
    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    info!("");
    info!("╔═══════════════════════════════════════╗");
    info!("║  RustCloud API Server                ║");
    info!("║  Listening on http://{}:{:<4}       ║", host, port);
    info!("╚═══════════════════════════════════════╝");
    info!("");

    // 启动服务器
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
