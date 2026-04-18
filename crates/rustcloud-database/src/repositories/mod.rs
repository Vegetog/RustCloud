//! 仓储实现

pub mod document;
pub mod document_key;
pub mod folder;
pub mod identity;
pub mod identity_user;
pub mod share_link;
pub mod user;

pub use document::{DocumentRepository, DocumentRepositoryTrait};
pub use document_key::{DocumentKeyRepository, DocumentKeyRepositoryTrait};
pub use folder::{FolderKeyRepository, FolderKeyRepositoryTrait, FolderRepository, FolderRepositoryTrait};
pub use identity::{IdentityRepository, IdentityRepositoryTrait};
pub use identity_user::{IdentityUserRepository, IdentityUserRepositoryTrait};
pub use share_link::{ShareLinkRepository, ShareLinkRepositoryTrait};
pub use user::{UserRepository, UserRepositoryTrait};
