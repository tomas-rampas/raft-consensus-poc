/// Core Raft data structures and basic node functionality
pub mod core;

/// Raft algorithm implementation including RPC handling and state transitions
pub mod algorithm;

/// RPC message types for inter-node communication
pub mod rpc;

/// Async simulation infrastructure for running Raft clusters
pub mod simulation;

/// Real-time event system for visualization
pub mod events;

/// WebSocket server for real-time visualization
pub mod websocket;

/// Comprehensive test suite for all modules
#[cfg(test)]
pub mod tests;

/// Integration tests for cluster behavior
#[cfg(test)]
pub mod integration_tests;

// Re-export commonly used types for convenience
pub use rpc::RpcMessage;
pub use simulation::spawn_cluster;
pub use websocket::{WebSocketConfig, spawn_websocket_server_with_channels};
