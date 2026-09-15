//! AI CAD Platform Shared Rust Crate

pub mod errors {
    use thiserror::Error;

    #[derive(Error, Debug)]
    pub enum CommonError {
        #[error("Invalid geometric parameter: {0}")]
        InvalidGeometry(String),

        #[error("IO error: {0}")]
        Io(#[from] std::io::Error),

        #[error("Serialization error: {0}")]
        Serialization(#[from] serde_json::Error),
    }
}
