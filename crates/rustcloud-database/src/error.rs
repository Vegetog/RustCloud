//! 数据库专用错误类型

use thiserror::Error;

/// 数据库操作结果类型
pub type DbResult<T> = std::result::Result<T, DatabaseError>;

/// 数据库专用错误
#[derive(Debug, Error)]
pub enum DatabaseError {
    #[error("Record not found")]
    NotFound,

    #[error("Duplicate entry: {0}")]
    DuplicateEntry(String),

    #[error("Foreign key violation: {0}")]
    ForeignKeyViolation(String),

    #[error("Connection failed: {0}")]
    ConnectionFailed(String),

    #[error("Transaction failed: {0}")]
    TransactionFailed(String),

    #[error("Query failed: {0}")]
    QueryFailed(String),

    #[error("Migration failed: {0}")]
    MigrationFailed(String),
}

impl From<sea_orm::DbErr> for DatabaseError {
    fn from(err: sea_orm::DbErr) -> Self {
        match err {
            sea_orm::DbErr::RecordNotFound(_) => DatabaseError::NotFound,
            sea_orm::DbErr::Conn(e) => DatabaseError::ConnectionFailed(e.to_string()),
            sea_orm::DbErr::Query(e) => {
                let msg = e.to_string();
                if msg.contains("duplicate key") || msg.contains("unique constraint") {
                    DatabaseError::DuplicateEntry(msg)
                } else if msg.contains("foreign key") {
                    DatabaseError::ForeignKeyViolation(msg)
                } else {
                    DatabaseError::QueryFailed(msg)
                }
            }
            _ => DatabaseError::QueryFailed(err.to_string()),
        }
    }
}

impl From<DatabaseError> for rustcloud_core::Error {
    fn from(err: DatabaseError) -> Self {
        match err {
            DatabaseError::NotFound => rustcloud_core::Error::DocumentNotFound,
            DatabaseError::DuplicateEntry(msg) => {
                if msg.contains("email") {
                    rustcloud_core::Error::UserAlreadyExists
                } else {
                    rustcloud_core::Error::DatabaseError(msg)
                }
            }
            _ => rustcloud_core::Error::DatabaseError(err.to_string()),
        }
    }
}
