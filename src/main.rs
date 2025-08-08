mod raft;

use raft::{RpcMessage, WebSocketConfig, spawn_cluster, spawn_websocket_server_with_channels};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::signal;
use tracing::{error, info, warn};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing subscriber with environment-based filtering
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("raft_poc=info".parse()?)
                .add_directive("raft=info".parse()?),
        )
        .init();

    info!("🚀 Raft POC starting...");

    // Create a 5-node Raft cluster
    let cluster_size = 5;
    info!("📡 Spawning cluster with {} nodes", cluster_size);
    let (cluster_channels, event_broadcaster, join_handles) = spawn_cluster(cluster_size).await;

    info!("✅ Cluster spawned successfully");

    // Start WebSocket and HTTP servers for real-time visualization
    let websocket_config = WebSocketConfig::default();
    info!(
        "🌐 Starting WebSocket server on {}:{}",
        websocket_config.host, websocket_config.port
    );
    info!(
        "🌐 Starting HTTP server on {}:{}",
        websocket_config.host, websocket_config.http_port
    );
    let (websocket_handle, http_handle) = spawn_websocket_server_with_channels(
        websocket_config,
        event_broadcaster,
        Some((*cluster_channels).clone()),
    )
    .await;

    info!("🔍 Cluster running with visualization:");
    info!("   WebSocket: ws://127.0.0.1:8082");
    info!("   Dashboard: http://127.0.0.1:8081");

    // Print usage instructions
    println!("\n=== Raft Cluster Interactive Console ===");
    println!("Dashboard: http://127.0.0.1:8081 (Web UI)");
    println!("WebSocket: ws://127.0.0.1:8082 (Direct API)");
    println!("Commands:");
    println!("  submit <command>  - Submit a command to the cluster");
    println!("  status           - Show cluster status");
    println!("  help             - Show this help message");
    println!("  quit             - Shutdown cluster and exit");
    println!("  Ctrl+C           - Force shutdown");
    println!("======================================\n");

    // Setup graceful shutdown handler
    let shutdown_signal = async {
        signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
        warn!("🛑 Received Ctrl+C, initiating graceful shutdown...");
    };

    // Setup command line interface
    let cli_handler = async {
        let stdin = tokio::io::stdin();
        let reader = BufReader::new(stdin);
        let mut lines = reader.lines();

        // Submit a test command after a delay for testing
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;
            // Auto-submit test commands for demonstration
            println!("🔄 Auto-submitting test commands...");
        });

        loop {
            print!("raft> ");
            // Note: We can't actually flush stdout in async context easily,
            // so the prompt might not appear immediately

            match lines.next_line().await {
                Ok(Some(line)) => {
                    let line = line.trim();
                    if line.is_empty() {
                        continue;
                    }

                    let parts: Vec<&str> = line.split_whitespace().collect();
                    match parts.first() {
                        Some(&"submit") => {
                            if parts.len() < 2 {
                                println!("Usage: submit <command>");
                                continue;
                            }
                            let command = parts[1..].join(" ");

                            // Try to submit to node 0 first, then try others as fallback
                            let mut submitted = false;
                            let message = RpcMessage::client_command(999, 0, command.clone());
                            if cluster_channels.send_to_node(0, message).is_ok() {
                                submitted = true;
                            } else {
                                // If node 0 fails, try other nodes as fallback
                                for node_id in 1..cluster_size {
                                    let message =
                                        RpcMessage::client_command(999, node_id, command.clone());
                                    if cluster_channels.send_to_node(node_id, message).is_ok() {
                                        submitted = true;
                                        break; // Only submit to one node
                                    }
                                }
                            }

                            if submitted {
                                info!("📤 Submitted command: '{}'", command);
                            } else {
                                error!("❌ Failed to submit command to any node");
                            }
                        }
                        Some(&"status") => {
                            println!("📊 Cluster Status:");
                            println!("   Nodes: {cluster_size}");
                            println!("   Channel capacity: {}", cluster_channels.size());
                            println!("   Use RUST_LOG=debug for detailed node states");
                        }
                        Some(&"help") => {
                            println!("Commands:");
                            println!("  submit <command>  - Submit a command to the cluster");
                            println!("  status           - Show cluster status");
                            println!("  help             - Show this help message");
                            println!("  quit             - Shutdown cluster and exit");
                        }
                        Some(&"exit") | Some(&"quit") => {
                            warn!("🔚 Exiting...");
                            break;
                        }
                        Some(cmd) => {
                            println!(
                                "Unknown command: '{cmd}'. Type 'help' for available commands."
                            );
                        }
                        None => continue,
                    }
                }
                Ok(None) => {
                    // EOF reached - but continue running for visualization
                    warn!("📜 EOF reached, continuing in background mode for visualization...");
                    warn!("💡 Access the web dashboard at http://127.0.0.1:8081");
                    warn!("💡 Use Ctrl+C to shutdown");

                    // Keep running indefinitely for visualization
                    loop {
                        tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                    }
                }
                Err(e) => {
                    error!("Error reading input: {}", e);
                    break;
                }
            }
        }
    };

    // Run either until shutdown signal or CLI exit
    tokio::select! {
        _ = shutdown_signal => {
            warn!("🚨 Shutdown signal received");
        }
        _ = cli_handler => {
            warn!("🏁 CLI handler completed");
        }
    }

    warn!("⏹️  Shutting down cluster...");

    // Clean up - abort WebSocket and HTTP servers
    websocket_handle.abort();
    http_handle.abort();
    info!("🌐 WebSocket and HTTP servers shut down");

    // Clean up - abort all node tasks
    for (i, handle) in join_handles.into_iter().enumerate() {
        handle.abort();
        info!("🛑 Node {} shut down", i);
    }

    info!("✅ Raft POC completed");
    Ok(())
}
