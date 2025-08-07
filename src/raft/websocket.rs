use futures_util::{SinkExt, StreamExt};
use serde_json;
/// WebSocket and HTTP server for real-time Raft cluster visualization
/// This module provides both a WebSocket server that streams Raft events to web clients
/// and an HTTP server that serves the static web dashboard files.
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::broadcast;
use tokio_tungstenite::tungstenite::protocol::Message;
use tokio_tungstenite::{WebSocketStream, accept_async};
use tracing::{debug, error, info, warn};
use warp::Filter;

use crate::raft::events::{EventBroadcaster, RaftEvent};
use crate::raft::rpc::RpcMessage;
use crate::raft::simulation::ClusterChannels;

/// Configuration for both WebSocket and HTTP servers
#[derive(Debug, Clone)]
pub struct WebSocketConfig {
    /// Host to bind the WebSocket server to
    pub host: String,
    /// Port to bind the WebSocket server to  
    pub port: u16,
    /// Port to bind the HTTP server to (for serving static files)
    pub http_port: u16,
    /// Directory path containing static web files
    pub static_dir: String,
}

impl Default for WebSocketConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 8082,
            http_port: 8081,
            static_dir: "web".to_string(),
        }
    }
}

/// WebSocket server for streaming Raft events to web clients
#[derive(Debug)]
pub struct WebSocketServer {
    /// Server configuration
    config: WebSocketConfig,
    /// Event broadcaster to subscribe to Raft events
    event_broadcaster: EventBroadcaster,
    /// Cluster channels for sending commands to nodes
    cluster_channels: Option<ClusterChannels>,
}

impl WebSocketServer {
    /// Creates a new WebSocket server with the given configuration and event broadcaster
    pub fn new(config: WebSocketConfig, event_broadcaster: EventBroadcaster) -> Self {
        Self {
            config,
            event_broadcaster,
            cluster_channels: None,
        }
    }

    /// Creates a new WebSocket server with cluster channels for command submission
    pub fn with_cluster_channels(
        config: WebSocketConfig,
        event_broadcaster: EventBroadcaster,
        cluster_channels: ClusterChannels,
    ) -> Self {
        Self {
            config,
            event_broadcaster,
            cluster_channels: Some(cluster_channels),
        }
    }

    /// Starts the WebSocket server and begins accepting connections
    pub async fn start(self) -> Result<(), Box<dyn std::error::Error>> {
        let addr = format!("{}:{}", self.config.host, self.config.port);
        let listener = TcpListener::bind(&addr).await?;

        info!("🌐 WebSocket server starting on {}", addr);

        while let Ok((stream, peer_addr)) = listener.accept().await {
            info!("🔗 New WebSocket connection from {}", peer_addr);

            let event_broadcaster = self.event_broadcaster.clone();
            let cluster_channels = self.cluster_channels.clone();

            // Spawn a task to handle each WebSocket connection
            tokio::spawn(async move {
                if let Err(e) =
                    handle_websocket_connection(stream, event_broadcaster, cluster_channels).await
                {
                    error!("WebSocket connection error for {}: {}", peer_addr, e);
                }
                info!("🔌 WebSocket connection closed for {}", peer_addr);
            });
        }

        Ok(())
    }
}

/// Handles a single WebSocket connection
async fn handle_websocket_connection(
    stream: TcpStream,
    event_broadcaster: EventBroadcaster,
    cluster_channels: Option<ClusterChannels>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Upgrade the TCP connection to a WebSocket
    let ws_stream = accept_async(stream).await?;
    info!("✅ WebSocket connection established");

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    // Subscribe to the event stream
    let mut event_receiver = event_broadcaster.subscribe();

    // Send a welcome message
    let welcome_msg = serde_json::json!({
        "type": "connected",
        "message": "Connected to Raft cluster visualization",
        "timestamp": chrono::Utc::now().timestamp_millis()
    });

    if let Err(e) = ws_sender.send(Message::Text(welcome_msg.to_string())).await {
        warn!("Failed to send welcome message: {}", e);
    }

    // Send initial cluster status event
    let cluster_status_event = crate::raft::events::RaftEvent::new(
        0, // Use node 0 as sender
        1, // Use current term (will be updated by real events)
        crate::raft::events::RaftEventType::ClusterStatus {
            total_nodes: 5,
            active_nodes: 5,
            leader_id: None, // Will be determined from real events
            current_term: 1,
        },
    );

    if let Ok(json_event) = serde_json::to_string(&cluster_status_event) {
        if let Err(e) = ws_sender.send(Message::Text(json_event)).await {
            warn!("Failed to send cluster status: {}", e);
        }
    }

    // WebSocket connected - real events from the cluster will be processed normally
    info!("🔍 WebSocket client connected - will receive real cluster events");

    // Handle incoming messages and outgoing events concurrently
    loop {
        tokio::select! {
            // Handle incoming WebSocket messages from client
            ws_msg = ws_receiver.next() => {
                match ws_msg {
                    Some(Ok(msg)) => {
                        if let Err(e) = handle_client_message(msg, &mut ws_sender, &cluster_channels).await {
                            error!("Error handling client message: {}", e);
                            break;
                        }
                    }
                    Some(Err(e)) => {
                        error!("WebSocket message error: {}", e);
                        break;
                    }
                    None => {
                        debug!("WebSocket connection closed by client");
                        break;
                    }
                }
            }

            // Handle outgoing Raft events to client
            event = event_receiver.recv() => {
                match event {
                    Ok(raft_event) => {
                        debug!("📡 Forwarding event to WebSocket client: {:?}", raft_event);
                        if let Err(e) = send_event_to_client(&raft_event, &mut ws_sender).await {
                            error!("Error sending event to client: {}", e);
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        info!("Event broadcast channel closed");
                        break;
                    }
                    Err(broadcast::error::RecvError::Lagged(missed)) => {
                        warn!("Client lagged behind, missed {} events", missed);
                        // Continue processing, client will catch up with newer events
                    }
                }
            }
        }
    }

    Ok(())
}

/// Handles incoming messages from WebSocket clients
async fn handle_client_message(
    message: Message,
    ws_sender: &mut futures_util::stream::SplitSink<WebSocketStream<TcpStream>, Message>,
    cluster_channels: &Option<ClusterChannels>,
) -> Result<(), Box<dyn std::error::Error>> {
    match message {
        Message::Text(text) => {
            debug!("Received text message from client: {}", text);

            // Try to parse as JSON command
            if let Ok(command) = serde_json::from_str::<serde_json::Value>(&text) {
                handle_client_command(command, ws_sender, cluster_channels).await?;
            } else {
                warn!("Invalid JSON received from client: {}", text);
            }
        }
        Message::Binary(data) => {
            debug!("Received binary message from client: {} bytes", data.len());
            // Binary messages not currently supported
        }
        Message::Ping(data) => {
            debug!("Received ping from client");
            ws_sender.send(Message::Pong(data)).await?;
        }
        Message::Pong(_) => {
            debug!("Received pong from client");
        }
        Message::Close(_) => {
            info!("Received close message from client");
            return Err("Client requested close".into());
        }
        Message::Frame(_) => {
            // Raw frames are handled by the library
        }
    }

    Ok(())
}

/// Handles structured commands from WebSocket clients
async fn handle_client_command(
    command: serde_json::Value,
    ws_sender: &mut futures_util::stream::SplitSink<WebSocketStream<TcpStream>, Message>,
    cluster_channels: &Option<ClusterChannels>,
) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(cmd_type) = command.get("type").and_then(|v| v.as_str()) {
        match cmd_type {
            "ping" => {
                let response = serde_json::json!({
                    "type": "pong",
                    "timestamp": chrono::Utc::now().timestamp_millis()
                });
                ws_sender.send(Message::Text(response.to_string())).await?;
            }
            "subscribe" => {
                // Client wants to subscribe to specific event types
                let response = serde_json::json!({
                    "type": "subscribed",
                    "message": "Subscribed to all events",
                    "timestamp": chrono::Utc::now().timestamp_millis()
                });
                ws_sender.send(Message::Text(response.to_string())).await?;
            }
            "get_status" => {
                // Client requests current cluster status
                let response = serde_json::json!({
                    "type": "status",
                    "cluster_active": true,
                    "timestamp": chrono::Utc::now().timestamp_millis()
                });
                ws_sender.send(Message::Text(response.to_string())).await?;
            }
            "submit_command" => {
                // Client wants to submit a command to the cluster
                if let Some(command_text) = command.get("command").and_then(|v| v.as_str()) {
                    if let Some(cluster_channels) = cluster_channels {
                        // Try to send to any available node - let Raft forwarding handle leader detection
                        let mut submitted = false;

                        // Try all nodes in order (no randomization needed to avoid thread safety issues)
                        for node_id in 0..cluster_channels.cluster_size {
                            let message =
                                RpcMessage::client_command(999, node_id, command_text.to_string());
                            if cluster_channels.send_to_node(node_id, message).is_ok() {
                                submitted = true;
                                break; // Stop after first successful submission
                            }
                        }

                        let response = if submitted {
                            serde_json::json!({
                                "type": "command_submitted",
                                "command": command_text,
                                "success": true,
                                "timestamp": chrono::Utc::now().timestamp_millis()
                            })
                        } else {
                            serde_json::json!({
                                "type": "command_submitted",
                                "command": command_text,
                                "success": false,
                                "error": "Failed to submit to any node",
                                "timestamp": chrono::Utc::now().timestamp_millis()
                            })
                        };

                        ws_sender.send(Message::Text(response.to_string())).await?;
                        info!("📤 WebSocket client submitted command: '{}'", command_text);
                    } else {
                        let response = serde_json::json!({
                            "type": "command_submitted",
                            "command": command_text,
                            "success": false,
                            "error": "Cluster channels not available",
                            "timestamp": chrono::Utc::now().timestamp_millis()
                        });
                        ws_sender.send(Message::Text(response.to_string())).await?;
                    }
                } else {
                    let response = serde_json::json!({
                        "type": "command_submitted",
                        "success": false,
                        "error": "Missing command parameter",
                        "timestamp": chrono::Utc::now().timestamp_millis()
                    });
                    ws_sender.send(Message::Text(response.to_string())).await?;
                }
            }
            "trigger_election" => {
                // Client wants to manually trigger an election
                info!("🗳️ WebSocket client requested manual election trigger");

                if let Some(cluster_channels) = cluster_channels {
                    // For a proper manual election:
                    // 1. First force the current leader to step down 
                    // 2. Then trigger election on a different node
                    
                    // Send leader step-down command to ALL nodes (leader will respond)
                    let step_down_message = RpcMessage::client_command(
                        999,
                        0, // Doesn't matter which node, we'll broadcast
                        "FORCE_LEADER_STEP_DOWN".to_string(),
                    );
                    
                    let mut step_down_sent = false;
                    for node_id in 0..cluster_channels.cluster_size {
                        if cluster_channels.send_to_node(node_id, step_down_message.clone()).is_ok() {
                            step_down_sent = true;
                        }
                    }

                    if step_down_sent {
                        let response = serde_json::json!({
                            "type": "election_triggered",
                            "success": true,
                            "message": "Manual election triggered - leader stepping down",
                            "method": "leader_step_down",
                            "timestamp": chrono::Utc::now().timestamp_millis()
                        });
                        ws_sender.send(Message::Text(response.to_string())).await?;
                        info!("✅ Manual election triggered - sent leader step-down to cluster");
                    } else {
                        let response = serde_json::json!({
                            "type": "election_triggered",
                            "success": false,
                            "error": "Failed to send trigger to node",
                            "timestamp": chrono::Utc::now().timestamp_millis()
                        });
                        ws_sender.send(Message::Text(response.to_string())).await?;
                    }
                } else {
                    let response = serde_json::json!({
                        "type": "election_triggered",
                        "success": false,
                        "error": "Cluster channels not available",
                        "timestamp": chrono::Utc::now().timestamp_millis()
                    });
                    ws_sender.send(Message::Text(response.to_string())).await?;
                }
            }
            "simulate_leader_failure" => {
                // Client wants to simulate a leader failure for demonstration
                info!("👑 WebSocket client requested leader failure simulation");

                // For now, we'll broadcast a special message to trigger leadership change
                // The actual implementation would temporarily disable the current leader
                if let Some(cluster_channels) = cluster_channels {
                    // Send a special failure simulation message to all nodes
                    for node_id in 0..cluster_channels.cluster_size {
                        let message = RpcMessage::client_command(
                            999,
                            node_id,
                            "SIMULATE_LEADER_FAILURE".to_string(),
                        );
                        let _ = cluster_channels.send_to_node(node_id, message);
                    }

                    let response = serde_json::json!({
                        "type": "leader_failure_simulated",
                        "success": true,
                        "message": "Leader failure simulation triggered",
                        "timestamp": chrono::Utc::now().timestamp_millis()
                    });
                    ws_sender.send(Message::Text(response.to_string())).await?;
                    info!("✅ Leader failure simulation message sent to cluster");
                } else {
                    let response = serde_json::json!({
                        "type": "leader_failure_simulated",
                        "success": false,
                        "error": "Cluster channels not available",
                        "timestamp": chrono::Utc::now().timestamp_millis()
                    });
                    ws_sender.send(Message::Text(response.to_string())).await?;
                }
            }
            "query_cluster_state" => {
                // Client wants to query current cluster state
                // This is used to determine the current leader when connecting late
                info!("🔍 Client requesting current cluster state");

                if let Some(cluster_channels) = cluster_channels {
                    // Send query to all nodes - the leader will respond with proper status
                    let mut query_sent = false;
                    for node_id in 0..cluster_channels.cluster_size {
                        let query_msg =
                            RpcMessage::client_command(999, node_id, "QUERY_STATUS".to_string());
                        if cluster_channels.send_to_node(node_id, query_msg).is_ok() {
                            query_sent = true;
                        }
                    }

                    if query_sent {
                        info!(
                            "📤 Sent status queries to cluster nodes - leader will emit current status"
                        );

                        // Send acknowledgment that query was initiated
                        let response = serde_json::json!({
                            "type": "cluster_state_query_initiated",
                            "message": "Querying cluster for current state - leader status will follow",
                            "timestamp": chrono::Utc::now().timestamp_millis()
                        });
                        ws_sender.send(Message::Text(response.to_string())).await?;
                    } else {
                        // Fallback: send basic cluster info without leader
                        let cluster_status = serde_json::json!({
                            "type": "ClusterStatus",
                            "total_nodes": cluster_channels.cluster_size,
                            "active_nodes": cluster_channels.cluster_size,
                            "leader_id": null,
                            "current_term": 0,
                            "message": "Cluster not responding to status query",
                            "timestamp": chrono::Utc::now().timestamp_millis()
                        });
                        ws_sender
                            .send(Message::Text(cluster_status.to_string()))
                            .await?;
                    }
                } else {
                    // No cluster available
                    let response = serde_json::json!({
                        "type": "error",
                        "message": "Cluster not available",
                        "timestamp": chrono::Utc::now().timestamp_millis()
                    });
                    ws_sender.send(Message::Text(response.to_string())).await?;
                }
            }
            _ => {
                warn!("Unknown command type: {}", cmd_type);
            }
        }
    }

    Ok(())
}

/// Sends a Raft event to a WebSocket client
async fn send_event_to_client(
    event: &RaftEvent,
    ws_sender: &mut futures_util::stream::SplitSink<WebSocketStream<TcpStream>, Message>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Serialize the event to JSON
    let json_event = serde_json::to_string(event)?;

    // Debug log for important events
    if json_event.contains("LogEntryProposed")
        || json_event.contains("ConsensusAckReceived")
        || json_event.contains("ClientCommandReceived")
    {
        info!("📤 WS Sending key event: {}", json_event);
    }

    // Send as WebSocket text message
    ws_sender.send(Message::Text(json_event)).await?;

    Ok(())
}

/// HTTP server for serving static web dashboard files
#[derive(Debug)]
pub struct HttpServer {
    /// Server configuration
    config: WebSocketConfig,
}

impl HttpServer {
    /// Creates a new HTTP server with the given configuration
    pub fn new(config: WebSocketConfig) -> Self {
        Self { config }
    }

    /// Starts the HTTP server for serving static files
    pub async fn start(self) -> Result<(), Box<dyn std::error::Error>> {
        let static_dir = self.config.static_dir.clone();
        let http_port = self.config.http_port;
        let host = self.config.host.clone();

        info!("🌐 HTTP server starting on {}:{}", host, http_port);
        info!("📁 Serving static files from: {}", static_dir);

        // Create index route that serves index.html for root path
        let index_path = format!("{}/index.html", static_dir);
        let index = warp::path::end().and(warp::fs::file(index_path));

        // Create static file serving route
        let static_files = warp::fs::dir(static_dir).with(warp::log("http"));

        // Create API route for cluster status
        let websocket_port = self.config.port;
        let api_status = warp::path!("api" / "status").and(warp::get()).map(move || {
            warp::reply::json(&serde_json::json!({
                "status": "running",
                "cluster_active": true,
                "websocket_port": websocket_port,
                "timestamp": chrono::Utc::now().timestamp_millis()
            }))
        });

        // Combine all routes with CORS
        let routes = index.or(static_files).or(api_status).with(
            warp::cors()
                .allow_any_origin()
                .allow_headers(vec!["content-type"])
                .allow_methods(vec!["GET", "POST"]),
        );

        // Parse the address
        let addr: std::net::SocketAddr = format!("{}:{}", host, http_port).parse()?;

        // Start the server
        warp::serve(routes).run(addr).await;

        Ok(())
    }
}

/// Spawns both WebSocket and HTTP servers that run concurrently with the Raft cluster
pub async fn spawn_websocket_server(
    config: WebSocketConfig,
    event_broadcaster: EventBroadcaster,
) -> (tokio::task::JoinHandle<()>, tokio::task::JoinHandle<()>) {
    spawn_websocket_server_with_channels(config, event_broadcaster, None).await
}

/// Spawns both WebSocket and HTTP servers with cluster channels for command submission
pub async fn spawn_websocket_server_with_channels(
    config: WebSocketConfig,
    event_broadcaster: EventBroadcaster,
    cluster_channels: Option<ClusterChannels>,
) -> (tokio::task::JoinHandle<()>, tokio::task::JoinHandle<()>) {
    let ws_config = config.clone();
    let http_config = config.clone();

    // Spawn WebSocket server
    let ws_handle = tokio::spawn(async move {
        let server = if let Some(channels) = cluster_channels {
            WebSocketServer::with_cluster_channels(ws_config, event_broadcaster, channels)
        } else {
            WebSocketServer::new(ws_config, event_broadcaster)
        };

        if let Err(e) = server.start().await {
            error!("WebSocket server error: {}", e);
        }
    });

    // Spawn HTTP server for static files
    let http_handle = tokio::spawn(async move {
        let http_server = HttpServer::new(http_config);

        if let Err(e) = http_server.start().await {
            error!("HTTP server error: {}", e);
        }
    });

    (ws_handle, http_handle)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::raft::core::NodeState;
    use crate::raft::events::{EventBroadcaster, RaftEventType};

    #[tokio::test]
    async fn test_event_serialization() {
        let event = RaftEvent::state_change(
            0,
            1,
            NodeState::Follower,
            NodeState::Candidate,
            "Election timeout".to_string(),
        );

        let json = serde_json::to_string(&event).unwrap();
        let deserialized: RaftEvent = serde_json::from_str(&json).unwrap();

        assert_eq!(event.node_id, deserialized.node_id);
        assert_eq!(event.term, deserialized.term);
    }

    #[tokio::test]
    async fn test_websocket_config() {
        let config = WebSocketConfig::default();
        assert_eq!(config.host, "127.0.0.1");
        assert_eq!(config.port, 8082);
        assert_eq!(config.http_port, 8081);
        assert_eq!(config.static_dir, "web");

        let custom_config = WebSocketConfig {
            host: "0.0.0.0".to_string(),
            port: 9090,
            http_port: 9091,
            static_dir: "static".to_string(),
        };
        assert_eq!(custom_config.host, "0.0.0.0");
        assert_eq!(custom_config.port, 9090);
        assert_eq!(custom_config.http_port, 9091);
        assert_eq!(custom_config.static_dir, "static");
    }
}
