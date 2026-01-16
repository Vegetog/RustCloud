//! RustCloud API Server

use std::net::SocketAddr;

use rustcloud_core::config::AppConfig;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use rustcloud_api::{routes::create_router, state::AppState};

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "rustcloud_api=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting RustCloud API server...");

    // Load configuration
    let config = match AppConfig::from_env() {
        Ok(config) => config,
        Err(e) => {
            tracing::error!("Failed to load configuration: {}", e);
            std::process::exit(1);
        }
    };

    let server_addr = config.server_addr();
    tracing::info!("Server will listen on {}", server_addr);

    // Initialize application state
    let state = match AppState::new(config).await {
        Ok(state) => state,
        Err(e) => {
            tracing::error!("Failed to initialize application state: {:?}", e);
            std::process::exit(1);
        }
    };

    tracing::info!("Application state initialized");

    // Create router
    let app = create_router(state);

    // Parse server address
    let addr: SocketAddr = server_addr.parse().unwrap_or_else(|_| {
        tracing::warn!("Invalid server address, using default");
        SocketAddr::from(([0, 0, 0, 0], 8080))
    });

    tracing::info!("RustCloud API server listening on {}", addr);

    // Start server
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app)
        .await
        .unwrap_or_else(|e| {
            tracing::error!("Server error: {}", e);
            std::process::exit(1);
        });
}
