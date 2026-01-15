//! Conversion between core types and ORM entities

use rustcloud_core::types::{Document, DocumentKey, Permission, ShareLink, User};

use crate::entities::{
    document::Model as DocumentModel,
    document_key::{Model as DocumentKeyModel, PermissionLevel},
    share_link::Model as ShareLinkModel,
    user::Model as UserModel,
};

// ========== User Conversions ==========

impl From<UserModel> for User {
    fn from(model: UserModel) -> Self {
        User {
            id: model.id,
            email: model.email,
            password_hash: model.password_hash,
            public_key: model.public_key,
            encrypted_private_key: model.encrypted_private_key,
            key_salt: model.salt,
            created_at: model.created_at,
            updated_at: model.updated_at,
        }
    }
}

// ========== Document Conversions ==========

impl From<DocumentModel> for Document {
    fn from(model: DocumentModel) -> Self {
        Document {
            id: model.id,
            owner_id: model.owner_id,
            name: String::new(), // Decrypted name not stored in DB
            encrypted_name: model.encrypted_name,
            mime_type: model.mime_type,
            size: model.size,
            storage_path: model.storage_path,
            checksum: model.content_hash,
            created_at: model.created_at,
            updated_at: model.updated_at,
        }
    }
}

// ========== Permission Conversions ==========

impl From<PermissionLevel> for Permission {
    fn from(level: PermissionLevel) -> Self {
        match level {
            PermissionLevel::Read => Permission::Read,
            PermissionLevel::Write => Permission::Write,
            PermissionLevel::Owner => Permission::Owner,
        }
    }
}

impl From<Permission> for PermissionLevel {
    fn from(perm: Permission) -> Self {
        match perm {
            Permission::Read => PermissionLevel::Read,
            Permission::Write => PermissionLevel::Write,
            Permission::Owner => PermissionLevel::Owner,
        }
    }
}

// ========== DocumentKey Conversions ==========

impl From<DocumentKeyModel> for DocumentKey {
    fn from(model: DocumentKeyModel) -> Self {
        DocumentKey {
            id: model.id,
            document_id: model.document_id,
            user_id: model.user_id,
            encrypted_key: model.encrypted_key,
            permission: model.permission_level.into(),
            created_at: model.created_at,
        }
    }
}

// ========== ShareLink Conversions ==========

impl From<ShareLinkModel> for ShareLink {
    fn from(model: ShareLinkModel) -> Self {
        ShareLink {
            id: model.id,
            document_id: model.document_id,
            creator_id: model.creator_id,
            token: model.access_token,
            encrypted_key: model.encrypted_key,
            password_hash: model.password_hash,
            expires_at: model.expires_at,
            max_downloads: model.max_access_count,
            download_count: model.access_count,
            created_at: model.created_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use uuid::Uuid;

    #[test]
    fn test_permission_level_to_permission() {
        assert_eq!(Permission::from(PermissionLevel::Read), Permission::Read);
        assert_eq!(Permission::from(PermissionLevel::Write), Permission::Write);
        assert_eq!(Permission::from(PermissionLevel::Owner), Permission::Owner);
    }

    #[test]
    fn test_permission_to_permission_level() {
        assert_eq!(PermissionLevel::from(Permission::Read), PermissionLevel::Read);
        assert_eq!(PermissionLevel::from(Permission::Write), PermissionLevel::Write);
        assert_eq!(PermissionLevel::from(Permission::Owner), PermissionLevel::Owner);
    }

    #[test]
    fn test_user_model_to_user() {
        let now = Utc::now();
        let model = UserModel {
            id: Uuid::new_v4(),
            email: "test@example.com".to_string(),
            password_hash: "hash".to_string(),
            salt: "salt123".to_string(),
            public_key: "pubkey".to_string(),
            encrypted_private_key: "encprivkey".to_string(),
            private_key_nonce: "nonce".to_string(),
            created_at: now,
            updated_at: now,
        };

        let user: User = model.clone().into();
        assert_eq!(user.id, model.id);
        assert_eq!(user.email, model.email);
        assert_eq!(user.key_salt, model.salt);
    }

    #[test]
    fn test_document_model_to_document() {
        let now = Utc::now();
        let model = DocumentModel {
            id: Uuid::new_v4(),
            owner_id: Uuid::new_v4(),
            encrypted_name: "encname".to_string(),
            name_nonce: "nonce".to_string(),
            content_hash: "hash123".to_string(),
            storage_path: "/path/to/file".to_string(),
            size: 1024,
            mime_type: "application/pdf".to_string(),
            created_at: now,
            updated_at: now,
        };

        let doc: Document = model.clone().into();
        assert_eq!(doc.id, model.id);
        assert_eq!(doc.checksum, model.content_hash);
        assert!(doc.name.is_empty()); // Decrypted name not stored
    }

    #[test]
    fn test_share_link_model_to_share_link() {
        let now = Utc::now();
        let model = ShareLinkModel {
            id: Uuid::new_v4(),
            document_id: Uuid::new_v4(),
            creator_id: Uuid::new_v4(),
            access_token: "token123".to_string(),
            encrypted_key: "enckey".to_string(),
            password_hash: Some("pwdhash".to_string()),
            expires_at: Some(now),
            max_access_count: Some(10),
            access_count: 5,
            created_at: now,
        };

        let link: ShareLink = model.clone().into();
        assert_eq!(link.id, model.id);
        assert_eq!(link.token, model.access_token);
        assert_eq!(link.max_downloads, model.max_access_count);
        assert_eq!(link.download_count, model.access_count);
    }
}
