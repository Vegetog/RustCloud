//! WebSocket 消息协议定义
//!
//! 服务端不解密任何 payload，仅按 type 字段路由消息，保持 E2EE 特性。

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// 客户端 -> 服务端 的上行消息
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientWsMessage {
    /// Yjs 增量更新（AES-GCM 加密后 base64），仅 Write/Owner 有效
    YjsUpdate {
        payload: String,
        nonce: String,
    },
    /// 感知更新（光标位置等，AES-GCM 加密后 base64）
    Awareness {
        payload: String,
        nonce: String,
    },
    /// 新连接请求同步：发送本地 state vector（base64）
    SyncStep1 {
        state_vector: String,
    },
}

/// 服务端 -> 客户端 的下行消息
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerWsMessage {
    /// 通知：有用户加入房间
    UserJoined {
        user_id: Uuid,
        user_email: String,
        permission_level: String,
    },
    /// 通知：有用户离开房间
    UserLeft {
        user_id: Uuid,
        user_email: String,
    },
    /// 广播：Yjs 增量更新（透传密文）
    YjsUpdate {
        from_user_id: Uuid,
        payload: String,
        nonce: String,
    },
    /// 广播：感知更新（光标位置，透传密文）
    Awareness {
        from_user_id: Uuid,
        payload: String,
        nonce: String,
    },
    /// 响应 SyncStep1：返回 Redis 中存储的加密文档快照
    SyncStep2 {
        payload: String,
        nonce: String,
    },
    /// 当前在线用户列表（新用户加入时接收）
    Presence {
        users: Vec<PresenceUser>,
    },
    /// 错误通知
    Error {
        code: String,
        message: String,
    },
}

#[derive(Debug, Serialize)]
pub struct PresenceUser {
    pub user_id: Uuid,
    pub user_email: String,
    pub permission_level: String,
}
