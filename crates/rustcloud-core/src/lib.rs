//! RustCloud Core Module
//!
//! Core types, error handling, and configuration management.

pub mod config;
pub mod error;
pub mod types;
pub mod utils;

pub use config::AppConfig;
pub use error::{Error, Result};
