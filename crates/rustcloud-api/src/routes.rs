//! 路由配置

use axum::{
    extract::DefaultBodyLimit,
    middleware,
    routing::{delete, get, patch, post},
    Router,
};
use tower_http::compression::CompressionLayer;
use tower_http::trace::TraceLayer;

use crate::handlers;
use crate::middleware::{auth_middleware, cors_layer};
use crate::state::{AppState, MAX_FILE_SIZE};

/// 创建并配置完整路由的应用 Router
pub fn create_router(state: AppState) -> Router {
    // 公开路由（无需认证）
    let public_auth_routes = Router::new()
        .route("/register", post(handlers::auth::register))
        .route("/login", post(handlers::auth::login))
        .route("/refresh", post(handlers::auth::refresh));

    let public_share_routes = Router::new()
        .route("/access/:token", get(handlers::share::access_share_get))
        .route(
            "/access/:token/download",
            get(handlers::share::download_shared_document),
        );

    // 受保护的认证路由
    let protected_auth_routes = Router::new()
        .route("/logout", post(handlers::auth::logout))
        .route("/me", get(handlers::auth::me))
        .route(
            "/users/:email/public-key",
            get(handlers::auth::get_user_public_key),
        );

    // 受保护的文档路由
    let document_routes = Router::new()
        .route("/", get(handlers::document::list_documents))
        .route("/", post(handlers::document::upload_document))
        .route("/:id", get(handlers::document::get_document))
        .route("/:id", patch(handlers::document::update_document))
        .route("/:id/download", get(handlers::document::download_document))
        .route("/:id", delete(handlers::document::delete_document))
        .route("/:id/permissions", get(handlers::document::list_permissions))
        .route("/:id/permissions", post(handlers::document::grant_permission))
        .route(
            "/:id/permissions/:user_id",
            delete(handlers::document::revoke_permission),
        )
        .layer(DefaultBodyLimit::max(MAX_FILE_SIZE));

    // 受保护的分享路由
    let protected_share_routes = Router::new()
        .route("/", post(handlers::share::create_share))
        .route("/", get(handlers::share::list_shares))
        .route("/:id", delete(handlers::share::delete_share));

    // 受保护的存储路由
    let storage_routes = Router::new()
        .route("/upload", post(handlers::storage::upload_file))
        .layer(DefaultBodyLimit::max(MAX_FILE_SIZE));

    // 受保护的文件夹路由
    let folder_routes = Router::new()
        .route("/", post(handlers::folder::create_folder))
        .route("/", get(handlers::folder::list_folder_children))
        .route("/:id", get(handlers::folder::get_folder))
        .route("/:id", patch(handlers::folder::rename_folder))
        .route("/:id/move", post(handlers::folder::move_folder))
        .route("/:id", delete(handlers::folder::delete_folder))
        .route("/:id/snapshot", get(handlers::folder::get_folder_snapshot))
        .route("/:id/share", post(handlers::folder::share_folder));

    // 受保护的身份路由
    let identity_routes = Router::new()
        .route("/", post(handlers::identity::create_identity))
        .route("/", get(handlers::identity::list_identities))
        .route("/granted", get(handlers::identity::list_granted_identities))
        .route("/:id", get(handlers::identity::get_identity))
        .route("/:id", axum::routing::put(handlers::identity::update_identity))
        .route("/:id", delete(handlers::identity::delete_identity))
        .route("/:id/users", post(handlers::identity::batch_add_users))
        .route("/:id/users", get(handlers::identity::list_identity_users))
        .route("/:id/users", delete(handlers::identity::batch_remove_users));

    // 组合受保护路由并挂载认证中间件
    let protected_routes = Router::new()
        .nest("/auth", protected_auth_routes)
        .nest("/documents", document_routes)
        .nest("/folders", folder_routes)
        .nest("/shares", protected_share_routes)
        .nest("/storage", storage_routes)
        .nest("/identities", identity_routes)
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ));

    // 组合公开路由
    let public_routes = Router::new()
        .nest("/auth", public_auth_routes)
        .nest("/shares", public_share_routes);

    // 健康检查路由
    let health_route = Router::new().route("/health", get(health_check));

    // WebSocket 协同编辑路由（认证在 handler 内部完成，不走 auth_middleware）
    let ws_routes = Router::new()
        .route("/documents/:id/ws", get(handlers::document_ws::document_ws_handler));

    // 合并所有路由到 /api/v1 路径下
    let api_routes = Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .merge(ws_routes)
        .merge(health_route);

    // 构建带中间件的最终路由器
    Router::new()
        .nest("/api/v1", api_routes)
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
        .layer(cors_layer())
        .with_state(state)
}

/// 健康检查接口
async fn health_check() -> &'static str {
    "OK"
}
