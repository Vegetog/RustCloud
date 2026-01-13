//! RustCloud API Server

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

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

    // TODO: Initialize application state
    // TODO: Configure routes
    // TODO: Start server

    tracing::info!("RustCloud API server initialized");
}
