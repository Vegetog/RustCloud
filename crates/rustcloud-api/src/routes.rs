//! Route configuration

use axum::{
    middleware,
    routing::{delete, get, post},
    Router,
};
use tower_http::compression::CompressionLayer;
use tower_http::trace::TraceLayer;

use crate::handlers;
use crate::middleware::{auth_middleware, cors_layer};
use crate::state::AppState;

/// Create the application router with all routes configured
pub fn create_router(state: AppState) -> Router {
    // Public routes (no authentication required)
    let public_auth_routes = Router::new()
        .route("/register", post(handlers::auth::register))
        .route("/login", post(handlers::auth::login))
        .route("/refresh", post(handlers::auth::refresh));

    let public_share_routes = Router::new()
        .route("/access/:token", get(handlers::share::access_share_get))
        .route("/access/:token", post(handlers::share::access_share_post))
        .route(
            "/access/:token/download",
            get(handlers::share::download_shared_document),
        );

    // Protected auth routes
    let protected_auth_routes = Router::new()
        .route("/logout", post(handlers::auth::logout))
        .route("/me", get(handlers::auth::me))
        .route(
            "/users/:email/public-key",
            get(handlers::auth::get_user_public_key),
        );

    // Protected document routes
    let document_routes = Router::new()
        .route("/", get(handlers::document::list_documents))
        .route("/", post(handlers::document::upload_document))
        .route("/:id", get(handlers::document::get_document))
        .route("/:id/download", get(handlers::document::download_document))
        .route("/:id", delete(handlers::document::delete_document))
        .route("/:id/permissions", get(handlers::document::list_permissions))
        .route("/:id/permissions", post(handlers::document::grant_permission))
        .route(
            "/:id/permissions/:user_id",
            delete(handlers::document::revoke_permission),
        );

    // Protected share routes
    let protected_share_routes = Router::new()
        .route("/", post(handlers::share::create_share))
        .route("/", get(handlers::share::list_shares))
        .route("/:id", delete(handlers::share::delete_share));

    // Combine protected routes with auth middleware
    let protected_routes = Router::new()
        .nest("/auth", protected_auth_routes)
        .nest("/documents", document_routes)
        .nest("/shares", protected_share_routes)
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ));

    // Combine public routes
    let public_routes = Router::new()
        .nest("/auth", public_auth_routes)
        .nest("/shares", public_share_routes);

    // Health check route
    let health_route = Router::new().route("/health", get(health_check));

    // Combine all routes under /api/v1
    let api_routes = Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .merge(health_route);

    // Build final router with middleware
    Router::new()
        .nest("/api/v1", api_routes)
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
        .layer(cors_layer())
        .with_state(state)
}

/// Health check endpoint
async fn health_check() -> &'static str {
    "OK"
}
