//! WebSocket 协作房间管理

use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::ws::Message;
use dashmap::DashMap;
use tokio::sync::{mpsc, Mutex};
use uuid::Uuid;

/// 单个 WebSocket 客户端的发送端
pub struct WsClient {
    pub user_id: Uuid,
    pub user_email: String,
    pub permission_level: String,
    pub can_write: bool,
    pub tx: mpsc::UnboundedSender<Message>,
}

/// 单个文档的协作房间
pub struct DocRoom {
    pub clients: HashMap<Uuid, WsClient>,
}

impl DocRoom {
    pub fn new() -> Self {
        Self {
            clients: HashMap::new(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.clients.is_empty()
    }
}

/// 全局房间管理器：document_id -> Arc<Mutex<DocRoom>>
pub type WsRooms = Arc<DashMap<Uuid, Arc<Mutex<DocRoom>>>>;

pub fn new_ws_rooms() -> WsRooms {
    Arc::new(DashMap::new())
}
