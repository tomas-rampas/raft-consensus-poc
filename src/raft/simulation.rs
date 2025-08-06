use std::time::Duration;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio::time::timeout;
use tracing::{debug, info, trace, warn};

use crate::raft::core::{Node, NodeId, NodeState};
use crate::raft::events::{EventBroadcaster, RaftEvent, RaftEventType};
use crate::raft::rpc::RpcMessage;

/// Handle for communicating with a node in the cluster
/// Provides channels for sending messages to and receiving responses from a node
#[derive(Debug)]
pub struct NodeHandle {
    /// Node ID this handle represents
    pub node_id: NodeId,
    /// Channel sender for sending messages to this node
    pub sender: mpsc::UnboundedSender<RpcMessage>,
    /// Channel receiver for receiving messages sent to this node
    pub receiver: mpsc::UnboundedReceiver<RpcMessage>,
}

impl NodeHandle {
    /// Creates a new NodeHandle with unbounded channels
    pub fn new(node_id: NodeId) -> Self {
        let (sender, receiver) = mpsc::unbounded_channel();
        Self {
            node_id,
            sender,
            receiver,
        }
    }

    /// Sends a message to this node (non-blocking)
    pub fn send(&self, message: RpcMessage) -> Result<(), mpsc::error::SendError<RpcMessage>> {
        self.sender.send(message)
    }

    /// Creates a pair of NodeHandles for bidirectional communication
    pub fn create_pair(node_id1: NodeId, node_id2: NodeId) -> (Self, Self) {
        let handle1 = Self::new(node_id1);
        let handle2 = Self::new(node_id2);
        (handle1, handle2)
    }
}

/// Routing table that manages communication channels between all nodes in the cluster
#[derive(Debug, Clone)]
pub struct ClusterChannels {
    /// Map from node ID to its message channel sender
    pub senders: std::collections::HashMap<NodeId, mpsc::UnboundedSender<RpcMessage>>,
    /// Size of the cluster
    pub cluster_size: usize,
}

impl ClusterChannels {
    /// Creates a new cluster channels routing table
    pub fn new(cluster_size: usize) -> (Self, Vec<mpsc::UnboundedReceiver<RpcMessage>>) {
        let mut senders = std::collections::HashMap::new();
        let mut receivers = Vec::new();

        // Create a channel for each node
        for node_id in 0..cluster_size {
            let (sender, receiver) = mpsc::unbounded_channel();
            senders.insert(node_id, sender);
            receivers.push(receiver);
        }

        let routing_table = Self {
            senders,
            cluster_size,
        };

        (routing_table, receivers)
    }

    /// Sends a message to a specific node
    pub fn send_to_node(
        &self,
        node_id: NodeId,
        message: RpcMessage,
    ) -> Result<(), mpsc::error::SendError<RpcMessage>> {
        if let Some(sender) = self.senders.get(&node_id) {
            sender.send(message)
        } else {
            Err(mpsc::error::SendError(message))
        }
    }

    /// Broadcasts a message to all nodes except the sender
    pub fn broadcast(
        &self,
        message: RpcMessage,
        exclude_node: NodeId,
    ) -> Vec<Result<(), mpsc::error::SendError<RpcMessage>>> {
        let mut results = Vec::new();

        for (&node_id, sender) in &self.senders {
            if node_id != exclude_node {
                let mut msg = message.clone();
                // Update the 'to' field of the message for each recipient
                match &mut msg {
                    RpcMessage::AppendEntriesRequest { to, .. } => *to = node_id,
                    RpcMessage::RequestVoteRequest { to, .. } => *to = node_id,
                    RpcMessage::ClientCommand { to, .. } => *to = node_id,
                    _ => {} // Responses are already targeted
                }
                results.push(sender.send(msg));
            }
        }

        results
    }

    /// Gets the list of all node IDs in the cluster
    pub fn all_node_ids(&self) -> Vec<NodeId> {
        (0..self.cluster_size).collect()
    }

    /// Gets the number of nodes in the cluster
    pub fn size(&self) -> usize {
        self.cluster_size
    }
}

/// Runs a single Raft node asynchronously, handling incoming messages and timeouts
/// This is the main event loop for each node in the cluster simulation
pub async fn run_node(
    mut node: Node,
    mut receiver: mpsc::UnboundedReceiver<RpcMessage>,
    cluster_channels: std::sync::Arc<ClusterChannels>,
    event_broadcaster: EventBroadcaster,
) {
    loop {
        // Calculate the current timeout based on node state
        let timeout_duration = if matches!(node.state, NodeState::Leader) {
            // Leaders send heartbeats more frequently
            Duration::from_millis(50) // 50ms heartbeat interval
        } else {
            // Followers and candidates check for election timeout
            let remaining = node
                .election_timeout
                .duration_since(std::time::Instant::now());
            remaining.max(Duration::from_millis(1)) // Minimum 1ms to avoid busy-waiting
        };

        // Wait for either a message or timeout
        let message_result = timeout(timeout_duration, receiver.recv()).await;

        match message_result {
            Ok(Some(message)) => {
                // Check if node is in simulated failure state
                if node.is_failed() {
                    trace!(
                        node_id = node.id,
                        "🚫 Node is in failure state, ignoring message: {:?}", message
                    );
                    continue; // Ignore all messages during failure
                }

                handle_incoming_message(&mut node, message, &cluster_channels, &event_broadcaster)
                    .await;
            }
            Ok(None) => {
                // Channel closed, node should shut down
                break;
            }
            Err(_) => {
                // Timeout occurred, handle based on node state
                handle_timeout(&mut node, &cluster_channels, &event_broadcaster).await;
            }
        }
    }
}

/// Handles an incoming RPC message for a node
async fn handle_incoming_message(
    node: &mut Node,
    message: RpcMessage,
    cluster_channels: &ClusterChannels,
    event_broadcaster: &EventBroadcaster,
) {
    match message {
        RpcMessage::AppendEntriesRequest { from, request, .. } => {
            debug!(
                node_id = node.id,
                "📥 RECEIVED: AppendEntries from leader {} with {} entries (term: {})",
                from, request.entries.len(), request.term
            );
            
            let response = node.handle_append_entries(&request);
            let response_message = RpcMessage::append_entries_response(node.id, from, response.clone());

            debug!(
                node_id = node.id,
                "📤 RESPONDING: AppendEntries response to leader {} → {}",
                from, if response.success { "SUCCESS (ACK)" } else { "FAILED (NACK)" }
            );

            if let Err(e) = cluster_channels.send_to_node(from, response_message) {
                eprintln!("Failed to send AppendEntries response: {e:?}");
            }
        }
        RpcMessage::AppendEntriesResponse { from, response, .. } => {
            if matches!(node.state, NodeState::Leader) {
                // Before processing, capture current state for comparison
                let old_log_length = node.last_log_index();

                node.handle_append_entries_response(from, &response);

                // Check if any proposals were committed during this response processing
                let new_log_length = node.last_log_index();
                if new_log_length > old_log_length {
                    info!(
                        node_id = node.id,
                        "🎉 PROPOSALS COMMITTED: {} new entries added to committed log (index {} → {})",
                        new_log_length - old_log_length,
                        old_log_length + 1,
                        new_log_length
                    );
                    
                    // Emit LogEntryAdded events for newly committed entries
                    for log_index in (old_log_length + 1)..=new_log_length {
                        if let Some(log_entry) =
                            node.persistent_state.log.get((log_index - 1) as usize)
                        {
                            let log_added_event = RaftEvent::log_entry_added(
                                node.id,
                                log_entry.term,
                                log_index,
                                log_entry.command.clone(),
                            );
                            let _ = event_broadcaster.emit(log_added_event);
                            info!(
                                node_id = node.id,
                                "📡 EVENT EMITTED: LogEntryAdded for committed command '{}' at index {}",
                                log_entry.command,
                                log_index
                            );
                        }
                    }
                }
            }
        }
        RpcMessage::RequestVoteRequest { from, request, .. } => {
            let response = node.handle_request_vote(&request);
            let response_message = RpcMessage::request_vote_response(node.id, from, response);

            if let Err(e) = cluster_channels.send_to_node(from, response_message) {
                eprintln!("Failed to send RequestVote response: {e:?}");
            }
        }
        RpcMessage::RequestVoteResponse { response, .. } => {
            if matches!(node.state, NodeState::Candidate) {
                let became_leader = node.process_vote_response(&response);
                if became_leader {
                    let old_state = node.state.clone();
                    node.become_leader();

                    // Emit leader elected event
                    let leader_event = RaftEvent::leader_elected(
                        node.id,
                        node.persistent_state.current_term,
                        node.votes_received,
                        node.cluster_size,
                    );
                    let _ = event_broadcaster.emit(leader_event);

                    // Emit state change event
                    let state_change_event = RaftEvent::state_change(
                        node.id,
                        node.persistent_state.current_term,
                        old_state,
                        node.state.clone(),
                        "Won election with majority votes".to_string(),
                    );
                    let _ = event_broadcaster.emit(state_change_event);

                    // Send initial heartbeats as new leader
                    send_heartbeats(node, cluster_channels, event_broadcaster).await;
                }
            }
        }
        RpcMessage::ClientCommand { command, .. } => {
            // Check for special simulation commands
            if command == "SIMULATE_LEADER_FAILURE" {
                info!(
                    node_id = node.id,
                    "👑 Received leader failure simulation command, state: {:?}", node.state
                );

                // Only the current leader should simulate failure
                if matches!(node.state, NodeState::Leader) {
                    warn!(
                        node_id = node.id,
                        "💥 Simulating leader failure - node will be unresponsive for 2 seconds"
                    );

                    // Simulate failure for 2 seconds (node becomes unresponsive)
                    node.simulate_failure(2000); // 2 seconds

                    // Step down from leadership by becoming a follower
                    let old_state = node.state.clone();
                    node.state = NodeState::Follower;

                    // Emit state change event
                    let state_change_event = RaftEvent::state_change(
                        node.id,
                        node.persistent_state.current_term,
                        old_state,
                        node.state.clone(),
                        "Simulated leader failure - node unresponsive".to_string(),
                    );
                    let _ = event_broadcaster.emit(state_change_event);

                    info!(
                        node_id = node.id,
                        "🔄 Former leader is now unresponsive, other nodes will timeout and elect new leader"
                    );
                }

                return; // Don't process as normal command
            }

            if let Some(proposed_index) = node.client_submit(command.clone()) {
                // Command accepted by leader as a pending proposal
                info!(
                    node_id = node.id,
                    "🔄 CONSENSUS FLOW START: Client command '{}' accepted as pending proposal at index {} (term {})",
                    command, proposed_index, node.persistent_state.current_term
                );

                // Emit client command received event
                let command_event = RaftEvent::client_command_received(
                    node.id,
                    node.persistent_state.current_term,
                    command.clone(),
                    true,
                );
                let _ = event_broadcaster.emit(command_event);

                // Emit log entry proposed event (not yet committed)
                let required_acks = (node.cluster_size / 2) + 1;
                let proposal_event = RaftEvent::log_entry_proposed(
                    node.id,
                    node.persistent_state.current_term,
                    proposed_index,
                    command,
                    required_acks,
                );
                let _ = event_broadcaster.emit(proposal_event);
                debug!(
                    node_id = node.id,
                    "📡 EVENT EMITTED: LogEntryProposed for proposal {} (awaiting consensus)",
                    proposed_index
                );

                // Send AppendEntries to replicate the proposed entry
                if matches!(node.state, NodeState::Leader) {
                    info!(
                        node_id = node.id,
                        "📤 STEP 2/4 - REPLICATING: Broadcasting AppendEntries with proposal {} to {} followers",
                        proposed_index, node.cluster_size - 1
                    );
                    send_append_entries_to_all_followers(node, cluster_channels, event_broadcaster)
                        .await;
                }
            } else {
                debug!(
                    node_id = node.id,
                    "❌ Command '{}' rejected - not the leader", command
                );

                // Emit client command rejected event
                let rejected_event = RaftEvent::new(
                    node.id,
                    node.persistent_state.current_term,
                    RaftEventType::ClientCommandRejected {
                        command,
                        reason: "Not the leader".to_string(),
                    },
                );
                let _ = event_broadcaster.emit(rejected_event);
            }
        }
    }
}

/// Handles timeout events based on the current node state
async fn handle_timeout(
    node: &mut Node,
    cluster_channels: &ClusterChannels,
    event_broadcaster: &EventBroadcaster,
) {
    // Check if node is recovering from failure
    if node.is_failed() {
        // Node is still in failure state, don't do anything
        return;
    }

    // If node was previously failed but is no longer, it may need to reset its election timeout
    if node.simulated_failure_until.is_some() {
        node.recover_from_failure();
        node.reset_election_timer(); // Reset election timer after recovery
        info!(
            node_id = node.id,
            "🔄 Node recovered from simulated failure, resetting election timer"
        );
    }

    match node.state {
        NodeState::Follower | NodeState::Candidate => {
            if node.is_election_timeout() {
                warn!(
                    node_id = node.id,
                    "⏰ Election timeout! Current state: {:?}, term: {}",
                    node.state,
                    node.persistent_state.current_term
                );

                // Emit election timeout event
                let timeout_event = RaftEvent::election_timeout(
                    node.id,
                    node.persistent_state.current_term,
                    node.state.clone(),
                    node.election_timeout_duration.as_millis() as u64,
                );
                let _ = event_broadcaster.emit(timeout_event);

                let old_state = node.state.clone();
                // Start or continue election
                node.become_candidate();

                // Emit state change event
                if old_state != node.state {
                    let state_change_event = RaftEvent::state_change(
                        node.id,
                        node.persistent_state.current_term,
                        old_state,
                        node.state.clone(),
                        "Election timeout".to_string(),
                    );
                    let _ = event_broadcaster.emit(state_change_event);
                }

                send_vote_requests(node, cluster_channels, event_broadcaster).await;
            }
        }
        NodeState::Leader => {
            // Check if leader is in simulated failure state
            if node.is_failed() {
                trace!(
                    node_id = node.id,
                    "🚫 Leader is in failure state, not sending heartbeats"
                );
                return; // Don't send heartbeats during failure
            }

            // Send heartbeats to maintain leadership
            if node.should_send_heartbeat() {
                trace!(
                    node_id = node.id,
                    "❤️  Sending heartbeats to maintain leadership"
                );
                send_heartbeats(node, cluster_channels, event_broadcaster).await;
                node.update_heartbeat_time();
            }
        }
    }
}

/// Sends RequestVote RPCs to all other nodes in the cluster
async fn send_vote_requests(
    node: &Node,
    cluster_channels: &ClusterChannels,
    _event_broadcaster: &EventBroadcaster,
) {
    let requests = node.create_vote_requests();

    for request in requests {
        let message = RpcMessage::request_vote_request(node.id, 0, request); // 'to' will be updated by broadcast
        cluster_channels.broadcast(message, node.id);
    }
}

/// Sends heartbeat AppendEntries RPCs to all followers
async fn send_heartbeats(
    node: &Node,
    cluster_channels: &ClusterChannels,
    event_broadcaster: &EventBroadcaster,
) {
    if !matches!(node.state, NodeState::Leader) {
        return;
    }

    let heartbeats = node.create_heartbeats();
    let follower_ids: Vec<NodeId> = (0..cluster_channels.size())
        .filter(|&id| id != node.id)
        .collect();

    // Emit heartbeat sent event
    let heartbeat_event = RaftEvent::heartbeat_sent(
        node.id,
        node.persistent_state.current_term,
        follower_ids.clone(),
        node.volatile_state.commit_index,
    );
    let _ = event_broadcaster.emit(heartbeat_event);

    for heartbeat in heartbeats {
        let message = RpcMessage::append_entries_request(node.id, 0, heartbeat); // 'to' will be updated by broadcast
        cluster_channels.broadcast(message, node.id);
    }
}

/// Sends AppendEntries RPCs with log entries to all followers
async fn send_append_entries_to_all_followers(
    node: &Node,
    cluster_channels: &ClusterChannels,
    _event_broadcaster: &EventBroadcaster,
) {
    if !matches!(node.state, NodeState::Leader) {
        return;
    }

    let leader_state = node.leader_state.as_ref().unwrap();
    let pending_count = leader_state.pending_proposals.len();
    
    // Send tailored AppendEntries to each follower
    for follower_id in 0..cluster_channels.size() {
        if follower_id != node.id {
            if let Some(append_entries) = node.create_append_entries_for_follower(follower_id) {
                debug!(
                    node_id = node.id,
                    "📤 → Follower {}: Sending AppendEntries with {} entries ({} committed + {} pending)",
                    follower_id, append_entries.entries.len(), node.last_log_index(), pending_count
                );
                
                let message =
                    RpcMessage::append_entries_request(node.id, follower_id, append_entries);
                if let Err(e) = cluster_channels.send_to_node(follower_id, message) {
                    eprintln!("Failed to send AppendEntries to node {follower_id}: {e:?}");
                } else {
                    trace!(
                        node_id = node.id,
                        "✅ AppendEntries sent to follower {} successfully", follower_id
                    );
                }
            }
        }
    }
}

/// Spawns a cluster of Raft nodes and returns handles for management
pub async fn spawn_cluster(
    cluster_size: usize,
) -> (
    std::sync::Arc<ClusterChannels>,
    EventBroadcaster,
    Vec<JoinHandle<()>>,
) {
    info!("🎆 Creating cluster with {} nodes", cluster_size);
    let (cluster_channels, receivers) = ClusterChannels::new(cluster_size);
    let cluster_channels = std::sync::Arc::new(cluster_channels);
    let mut join_handles = Vec::new();

    // Create event broadcaster for visualization
    let (event_broadcaster, _) = EventBroadcaster::new(1000); // Buffer up to 1000 events

    // Spawn a task for each node
    for (node_id, receiver) in receivers.into_iter().enumerate() {
        let node = Node::new(node_id, cluster_size);
        let channels_clone = cluster_channels.clone();
        let event_broadcaster_clone = event_broadcaster.clone();

        info!("🚀 Spawning node {}", node_id);

        let handle = tokio::spawn(async move {
            info!(node_id = node_id, "🟢 Node {} started as Follower", node_id);

            // Emit initial node state event for visualization
            let initial_state_event = RaftEvent::state_change(
                node_id,
                0,                   // Initial term
                NodeState::Follower, // Technically no previous state, but using Follower as placeholder
                NodeState::Follower,
                "Node initialized".to_string(),
            );
            let _ = event_broadcaster_clone.emit(initial_state_event);

            run_node(node, receiver, channels_clone, event_broadcaster_clone).await;
            info!(node_id = node_id, "🔴 Node {} shutting down", node_id);
        });

        join_handles.push(handle);
    }

    info!("✅ All {} nodes spawned successfully", cluster_size);
    (cluster_channels, event_broadcaster, join_handles)
}
