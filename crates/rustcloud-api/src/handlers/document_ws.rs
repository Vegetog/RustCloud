//! WebSocket 多人实时协同编辑处理器
//!
//! 端点：GET /api/v1/documents/:id/ws?token=<jwt>
//!
//! 认证通过 query param 完成（浏览器 WebSocket API 不支持自定义 Header）。
//! 服务端仅转发加密 Yjs 数据，不解密任何 payload，保持 E2EE 特性。

use std::sync::Arc;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    response::Response,
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use redis::AsyncCommands;
use rustcloud_database::{DocumentKeyRepository, DocumentKeyRepositoryTrait, PermissionLevel};
use serde::Deserialize;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::{
    dto::ws::{ClientWsMessage, PresenceUser, ServerWsMessage},
    error::ApiError,
    services::ws_room::{DocRoom, WsClient},
    state::AppState,
};

#[derive(Deserialize)]
pub struct WsAuthQuery {
    pub token: String,
}

/// GET /api/v1/documents/:id/ws?token=<jwt>
///
/// WebSocket 升级端点。认证在升级前完成，失败则返回 HTTP 错误。
pub async fn document_ws_handler(
    State(state): State<AppState>,
    Path(doc_id): Path<Uuid>,
    Query(query): Query<WsAuthQuery>,
    ws: WebSocketUpgrade,
) -> Result<Response, ApiError> {
    // 1. 验证 JWT
    let claims = state
        .jwt_manager
        .verify_access_token(&query.token)
        .map_err(|_| ApiError::unauthorized("Invalid token"))?;

    // 2. 检查 token 黑名单
    let mut session_manager = state.session_manager();
    if session_manager
        .is_token_blacklisted(&claims.jti)
        .await
        .unwrap_or(false)
    {
        return Err(ApiError::unauthorized("Token has been revoked"));
    }

    // 3. 解析用户 ID
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| ApiError::unauthorized("Invalid user ID"))?;
    let user_email = claims.email.clone();

    // 4. 检查文档权限
    let key_repo = DocumentKeyRepository::new(state.db.clone());
    let doc_key = key_repo
        .find_by_document_and_user(doc_id, user_id)
        .await
        .map_err(|e| ApiError::internal(format!("Database error: {}", e)))?
        .ok_or_else(|| ApiError::forbidden("No access to this document"))?;

    let permission_level = doc_key.permission_level.to_string();

    let can_write = doc_key.permission_level != PermissionLevel::Read;

    // 5. 升级为 WebSocket
    Ok(ws.on_upgrade(move |socket| {
        handle_ws_connection(socket, state, doc_id, user_id, user_email, permission_level, can_write)
    }))
}

async fn handle_ws_connection(
    socket: WebSocket,
    state: AppState,
    doc_id: Uuid,
    user_id: Uuid,
    user_email: String,
    permission_level: String,
    can_write: bool,
) {
    let (mut ws_sink, mut ws_stream) = socket.split();

    // 创建向该客户端发送消息的通道（不阻塞接收循环）
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    // 获取或创建该文档的协作房间
    let room = {
        let entry = state
            .ws_rooms
            .entry(doc_id)
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(DocRoom::new())));
        entry.clone()
    };

    // 收集当前在线用户列表，然后注册自己
    let presence_users = {
        let mut room_guard = room.lock().await;
        let users: Vec<PresenceUser> = room_guard
            .clients
            .values()
            .map(|c| PresenceUser {
                user_id: c.user_id,
                user_email: c.user_email.clone(),
                permission_level: c.permission_level.clone(),
            })
            .collect();
        // 注册自己
        room_guard.clients.insert(
            user_id,
            WsClient {
                user_id,
                user_email: user_email.clone(),
                permission_level: permission_level.clone(),
                can_write,
                tx: tx.clone(),
            },
        );
        users
    };

    // 发送当前在线列表给新加入者
    send_msg(&tx, &ServerWsMessage::Presence { users: presence_users });

    // 从 Redis 读取所有累积的 Yjs 更新，立即发送给新加入者（确保同步 A 的已有编辑）
    let stored_updates = get_yjs_updates(&state.redis, doc_id).await;
    for (payload, nonce) in &stored_updates {
        send_msg(
            &tx,
            &ServerWsMessage::SyncStep2 {
                payload: payload.clone(),
                nonce: nonce.clone(),
            },
        );
    }

    // 广播 UserJoined 给其余人
    broadcast_except(
        &room,
        user_id,
        &ServerWsMessage::UserJoined {
            user_id,
            user_email: user_email.clone(),
            permission_level: permission_level.clone(),
        },
    )
    .await;

    // 启动独立的发送任务（将 rx 中的消息写入 ws_sink）
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sink.send(msg).await.is_err() {
                break;
            }
        }
    });

    // 接收循环
    while let Some(result) = ws_stream.next().await {
        let msg = match result {
            Ok(m) => m,
            Err(_) => break,
        };

        match msg {
            Message::Text(text) => {
                let client_msg: ClientWsMessage = match serde_json::from_str(&text) {
                    Ok(m) => m,
                    Err(_) => continue,
                };

                match client_msg {
                    ClientWsMessage::YjsUpdate { payload, nonce } => {
                        if !can_write {
                            // 静默丢弃只读用户的写操作
                            continue;
                        }
                        // 广播加密更新给其他人
                        broadcast_except(
                            &room,
                            user_id,
                            &ServerWsMessage::YjsUpdate {
                                from_user_id: user_id,
                                payload: payload.clone(),
                                nonce: nonce.clone(),
                            },
                        )
                        .await;
                        // 追加加密更新到 Redis LIST（累积所有更新供后来者同步）
                        append_yjs_update(&state.redis, doc_id, &payload, &nonce).await;
                    }
                    ClientWsMessage::Awareness { payload, nonce } => {
                        // 感知消息（光标位置）广播给其他人
                        broadcast_except(
                            &room,
                            user_id,
                            &ServerWsMessage::Awareness {
                                from_user_id: user_id,
                                payload,
                                nonce,
                            },
                        )
                        .await;
                    }
                    ClientWsMessage::SyncStep1 { state_vector: _ } => {
                        // 返回 Redis 中累积的所有加密更新给请求者
                        let updates = get_yjs_updates(&state.redis, doc_id).await;
                        for (payload, nonce) in updates {
                            send_msg(
                                &tx,
                                &ServerWsMessage::SyncStep2 {
                                    payload,
                                    nonce,
                                },
                            );
                        }
                    }
                }
            }
            Message::Close(_) => break,
            Message::Ping(data) => {
                let _ = tx.send(Message::Pong(data));
            }
            _ => {}
        }
    }

    // 连接断开：清理
    send_task.abort();

    {
        let mut room_guard = room.lock().await;
        room_guard.clients.remove(&user_id);
        let is_empty = room_guard.is_empty();
        drop(room_guard);
        if is_empty {
            state.ws_rooms.remove(&doc_id);
            // 清除 Redis 更新列表，防止下次新会话使用过期的 CRDT 状态
            clear_yjs_updates(&state.redis, doc_id).await;
        }
    }

    // 广播 UserLeft 给剩余用户
    broadcast_except(
        &room,
        user_id,
        &ServerWsMessage::UserLeft {
            user_id,
            user_email: user_email.clone(),
        },
    )
    .await;

    tracing::info!(
        "WS connection closed: doc_id={}, user_id={}, email={}",
        doc_id,
        user_id,
        user_email
    );
}

/// 广播消息给房间内除 exclude_user_id 之外的所有连接
async fn broadcast_except(
    room: &Arc<tokio::sync::Mutex<DocRoom>>,
    exclude_user_id: Uuid,
    msg: &ServerWsMessage,
) {
    let text = match serde_json::to_string(msg) {
        Ok(t) => t,
        Err(_) => return,
    };
    let room_guard = room.lock().await;
    for (uid, client) in &room_guard.clients {
        if *uid != exclude_user_id {
            let _ = client.tx.send(Message::Text(text.clone().into()));
        }
    }
}

/// 向单个客户端发送消息
fn send_msg(tx: &mpsc::UnboundedSender<Message>, msg: &ServerWsMessage) {
    if let Ok(text) = serde_json::to_string(msg) {
        let _ = tx.send(Message::Text(text.into()));
    }
}

/// 从 Redis 读取所有累积的 Yjs 加密更新（LIST 结构）
async fn get_yjs_updates(
    redis: &redis::aio::ConnectionManager,
    doc_id: Uuid,
) -> Vec<(String, String)> {
    let key = format!("ws_yjs_updates:{}", doc_id);
    let mut conn = redis.clone();
    let entries: Vec<String> = match conn.lrange(&key, 0, -1).await {
        Ok(v) => v,
        Err(_) => return vec![],
    };
    entries
        .iter()
        .filter_map(|entry| {
            let parsed: serde_json::Value = serde_json::from_str(entry).ok()?;
            Some((
                parsed["payload"].as_str()?.to_string(),
                parsed["nonce"].as_str()?.to_string(),
            ))
        })
        .collect()
}

/// 将 Yjs 加密更新追加到 Redis LIST（TTL 24小时）
async fn append_yjs_update(
    redis: &redis::aio::ConnectionManager,
    doc_id: Uuid,
    payload: &str,
    nonce: &str,
) {
    let key = format!("ws_yjs_updates:{}", doc_id);
    let value = serde_json::json!({"payload": payload, "nonce": nonce}).to_string();
    let mut conn = redis.clone();
    let _: Result<(), _> = conn.rpush(&key, &value).await;
    let _: Result<(), _> = conn.expire(&key, 86400).await;
}

/// 清除 Redis 中的 Yjs 更新列表（房间清空时调用，防止下次会话使用过期 CRDT 状态）
async fn clear_yjs_updates(
    redis: &redis::aio::ConnectionManager,
    doc_id: Uuid,
) {
    let key = format!("ws_yjs_updates:{}", doc_id);
    let mut conn = redis.clone();
    let _: Result<(), _> = redis::AsyncCommands::del(&mut conn, &key).await;
}
