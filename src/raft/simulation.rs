use std::time::Duration;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio::time::timeout;
use tracing::{debug, error, info, trace, warn};

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
            // Leaders send heartbeats at regular intervals
            Duration::from_millis(500) // 500ms heartbeat interval - more reasonable pace
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
            // Only log AppendEntries with actual entries (not heartbeats)
            if request.entries.len() > 0 {
                info!(
                    node_id = node.id,
                    "📥 RECEIVED: AppendEntries from leader {} with {} entries (term: {})",
                    from,
                    request.entries.len(),
                    request.term
                );
            }

            // Capture state before handling AppendEntries to detect changes
            let old_state = node.state.clone();

            let response = node.handle_append_entries(&request);

            // Check if state changed during AppendEntries handling and emit StateChange event
            if old_state != node.state {
                debug!(
                    node_id = node.id,
                    "🚨 STATE CHANGED: {} → {} due to AppendEntries from leader {}",
                    match old_state {
                        NodeState::Leader => "Leader",
                        NodeState::Candidate => "Candidate",
                        NodeState::Follower => "Follower",
                    },
                    match node.state {
                        NodeState::Leader => "Leader",
                        NodeState::Candidate => "Candidate",
                        NodeState::Follower => "Follower",
                    },
                    from
                );

                let state_change_event = crate::raft::events::RaftEvent::state_change(
                    node.id,
                    node.persistent_state.current_term,
                    old_state,
                    node.state.clone(),
                    "Stepped down due to AppendEntries from leader".to_string(),
                );
                let _ = event_broadcaster.emit(state_change_event);
            }
            let response_message =
                RpcMessage::append_entries_response(node.id, from, response.clone());

            // Only log responses for AppendEntries with actual entries (not heartbeat responses)
            if request.entries.len() > 0 {
                info!(
                    node_id = node.id,
                    "📤 RESPONDING: AppendEntries response to leader {} → {}",
                    from,
                    if response.success {
                        "SUCCESS (ACK)"
                    } else {
                        "FAILED (NACK)"
                    }
                );
            }

            // Emit MessageSent event for ACK/NACK response visualization
            let response_details = if response.success {
                "ACK - AppendEntries accepted"
            } else {
                "NACK - AppendEntries rejected"
            };
            let response_event = crate::raft::events::RaftEvent::message_sent(
                node.id,
                from,
                node.persistent_state.current_term,
                "AppendEntriesResponse".to_string(),
                response_details.to_string(),
            );
            let _ = event_broadcaster.emit(response_event);

            if let Err(e) = cluster_channels.send_to_node(from, response_message) {
                eprintln!("Failed to send AppendEntries response: {e:?}");
            }
        }
        RpcMessage::AppendEntriesResponse { from, response, .. } => {
            if matches!(node.state, NodeState::Leader) {
                // Before processing, capture current state for comparison
                let old_log_length = node.last_log_index();

                // Process the response first to determine if it was for actual replication
                let _old_match_index = if let Some(leader_state) = &node.leader_state {
                    leader_state.match_index.get(from).copied().unwrap_or(0)
                } else {
                    0
                };

                let consensus_acks = node.handle_append_entries_response(from, &response);

                // For the clean 3-type system, we emit ConsensusAckReceived or HeartbeatReceived
                // based on whether this was a heartbeat or actual proposal replication
                let has_consensus_acks = !consensus_acks.is_empty();

                if has_consensus_acks {
                    // This was a proposal ACK - emit ConsensusAckReceived events
                    for ack_info in &consensus_acks {
                        let consensus_ack_event = crate::raft::events::RaftEvent::consensus_ack_received(
                            from,
                            node.id,
                            node.persistent_state.current_term,
                            ack_info.proposal_index,
                            ack_info.proposal_term,
                            response.success,
                            ack_info.acks_received,
                            ack_info.acks_needed,
                            ack_info.consensus_achieved,
                        );
                        let _ = event_broadcaster.emit(consensus_ack_event);
                    }
                } else if response.success {
                    // This was a heartbeat ACK - emit HeartbeatReceived event
                    let heartbeat_ack_event = crate::raft::events::RaftEvent::heartbeat_received(
                        from,
                        node.id,
                        node.persistent_state.current_term,
                        node.volatile_state.commit_index,
                    );
                    let _ = event_broadcaster.emit(heartbeat_ack_event);
                }

                // Only log consensus ACKs if there are any to emit
                if consensus_acks.len() > 0 {
                    info!(
                        node_id = node.id,
                        "📊 Found {} consensus ACK(s) to emit for follower {}",
                        consensus_acks.len(),
                        from
                    );
                }
                for consensus_ack in consensus_acks {
                    let consensus_event = crate::raft::events::RaftEvent::consensus_ack_received(
                        consensus_ack.follower_id,
                        node.id,
                        node.persistent_state.current_term,
                        consensus_ack.proposal_index,
                        consensus_ack.proposal_term,
                        response.success,
                        consensus_ack.acks_received,
                        consensus_ack.acks_needed,
                        consensus_ack.consensus_achieved,
                    );
                    let _ = event_broadcaster.emit(consensus_event);
                    info!(
                        node_id = node.id,
                        "📡 EVENT EMITTED: ConsensusAckReceived from follower {} → leader {} for proposal {} ({}/{} acks, consensus: {})",
                        consensus_ack.follower_id,
                        node.id,
                        consensus_ack.proposal_index,
                        consensus_ack.acks_received,
                        consensus_ack.acks_needed,
                        consensus_ack.consensus_achieved
                    );
                }

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

                    // Collect newly committed indices and acknowledgments
                    let committed_indices: Vec<u64> =
                        ((old_log_length + 1)..=new_log_length).collect();

                    // Get list of nodes that acknowledged this consensus (including leader)
                    let mut acknowledged_by = vec![node.id]; // Leader always acknowledges
                    if let Some(leader_state) = &node.leader_state {
                        // Find nodes that have match_index >= committed entries
                        for (follower_id, &match_index) in
                            leader_state.match_index.iter().enumerate()
                        {
                            if follower_id != node.id && match_index >= new_log_length {
                                acknowledged_by.push(follower_id);
                            }
                        }
                    }

                    // Emit ReplicationCompleted event for the consensus achievement
                    if !committed_indices.is_empty() {
                        let replication_completed_event = RaftEvent::replication_completed(
                            node.id,
                            node.persistent_state.current_term,
                            committed_indices.clone(),
                            acknowledged_by,
                        );
                        let _ = event_broadcaster.emit(replication_completed_event);
                        info!(
                            node_id = node.id,
                            "📡 EVENT EMITTED: ReplicationCompleted for {} entries achieving consensus",
                            committed_indices.len()
                        );
                    }

                    // Emit LogEntryAdded events for newly committed entries (individual events)
                    for log_index in committed_indices {
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
                            debug!(
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
            
            // Emit VoteGranted or VoteDenied event based on the response
            if response.vote_granted {
                let vote_granted_event = RaftEvent::vote_granted(
                    node.id,
                    request.candidate_id,
                    response.term,
                );
                let _ = event_broadcaster.emit(vote_granted_event);
                
                info!(
                    node_id = node.id,
                    "✅ VOTE GRANTED: Node {} granted vote to candidate {} for term {}",
                    node.id,
                    request.candidate_id,
                    response.term
                );
            } else {
                let vote_denied_event = RaftEvent::vote_denied(
                    node.id,
                    request.candidate_id,
                    response.term,
                    "Vote denied - see algorithm logs for details".to_string(),
                );
                let _ = event_broadcaster.emit(vote_denied_event);
                
                info!(
                    node_id = node.id,
                    "❌ VOTE DENIED: Node {} denied vote to candidate {} for term {}",
                    node.id,
                    request.candidate_id,
                    response.term
                );
            }
            
            let response_message = RpcMessage::request_vote_response(node.id, from, response);

            if let Err(e) = cluster_channels.send_to_node(from, response_message) {
                eprintln!("Failed to send RequestVote response: {e:?}");
            }
        }
        RpcMessage::RequestVoteResponse { response, .. } => {
            if matches!(node.state, NodeState::Candidate) {
                // Capture state BEFORE processing response to get accurate transition
                let old_state = node.state.clone();
                let became_leader = node.process_vote_response(&response);
                if became_leader {

                    // Capture vote count BEFORE calling become_leader() (which resets votes_received to 0)
                    let final_votes_received = node.votes_received;
                    let total_votes = node.cluster_size;

                    node.become_leader();

                    info!(
                        node_id = node.id,
                        "🚨 LEADER ELECTION SUCCESS: Node {} transitioning {} → {} (term {})",
                        node.id,
                        match old_state {
                            NodeState::Leader => "Leader",
                            NodeState::Candidate => "Candidate",
                            NodeState::Follower => "Follower",
                        },
                        match node.state {
                            NodeState::Leader => "Leader",
                            NodeState::Candidate => "Candidate",
                            NodeState::Follower => "Follower",
                        },
                        node.persistent_state.current_term
                    );

                    // Emit leader elected event
                    let leader_event = RaftEvent::leader_elected(
                        node.id,
                        node.persistent_state.current_term,
                        final_votes_received,
                        total_votes,
                    );
                    let _ = event_broadcaster.emit(leader_event);

                    // Emit state change event so frontend updates node display correctly
                    let state_change_event = RaftEvent::state_change(
                        node.id,
                        node.persistent_state.current_term,
                        old_state,
                        NodeState::Leader,
                        "Won election and became leader".to_string(),
                    );
                    let _ = event_broadcaster.emit(state_change_event);

                    info!(
                        node_id = node.id,
                        "📡 EVENTS EMITTED: LeaderElected + StateChange events sent for new leader {}",
                        node.id
                    );

                    // Send initial heartbeats as new leader
                    send_heartbeats(node, cluster_channels, event_broadcaster).await;
                }
            }
        }
        RpcMessage::ClientCommand { command, .. } => {
            // Always emit ClientCommandReceived event for any command received
            // This shows that the node received the command, regardless of whether it's accepted
            let command_received_event = RaftEvent::client_command_received(
                node.id,
                node.persistent_state.current_term,
                command.clone(),
                matches!(node.state, NodeState::Leader), // Only leaders can accept commands
            );
            let _ = event_broadcaster.emit(command_received_event);
            info!(
                node_id = node.id,
                "📡 EVENT EMITTED: ClientCommandReceived '{}' by {} {} ({})",
                command,
                match node.state {
                    NodeState::Leader => "Leader",
                    NodeState::Candidate => "Candidate",
                    NodeState::Follower => "Follower",
                },
                node.id,
                if matches!(node.state, NodeState::Leader) {
                    "WILL PROCESS"
                } else {
                    "WILL REJECT"
                }
            );

            // Check for special simulation commands
            if command == "QUERY_STATUS" {
                // WebSocket client is querying cluster state - only leader should respond
                if matches!(node.state, NodeState::Leader) {
                    info!(
                        node_id = node.id,
                        "🔍 Responding to cluster status query - I am the leader (term {})",
                        node.persistent_state.current_term
                    );

                    // Emit a ClusterStatus event with real current state
                    let cluster_status_event = RaftEvent::new(
                        node.id,
                        node.persistent_state.current_term,
                        RaftEventType::ClusterStatus {
                            total_nodes: node.cluster_size,
                            active_nodes: node.cluster_size, // Assume all active for now
                            leader_id: Some(node.id),
                            current_term: node.persistent_state.current_term,
                        },
                    );
                    let _ = event_broadcaster.emit(cluster_status_event);

                    // Also emit current state for this leader node so frontend shows correct state
                    let leader_state_event = RaftEvent::state_change(
                        node.id,
                        node.persistent_state.current_term,
                        NodeState::Follower, // Dummy from state (not used by frontend)
                        node.state.clone(),
                        "Current leader state (from status query)".to_string(),
                    );
                    let _ = event_broadcaster.emit(leader_state_event);

                    info!(
                        node_id = node.id,
                        "📡 Emitted ClusterStatus + StateChange events: leader={}, term={}",
                        node.id,
                        node.persistent_state.current_term
                    );
                } else {
                    // Non-leaders should not respond to avoid multiple responses
                    debug!(
                        node_id = node.id,
                        "🔍 Received status query but I'm not the leader (state: {:?})", node.state
                    );
                }
                return; // Don't process as normal command
            } else if command == "TRIGGER_ELECTION" {
                info!(
                    node_id = node.id,
                    "🗳️ Received manual election trigger command, state: {:?}", node.state
                );

                // Force this node to timeout and become candidate
                if !matches!(node.state, NodeState::Leader) {
                    info!(
                        node_id = node.id,
                        "🗳️ Manually triggering election timeout on node {} (current state: {:?})",
                        node.id,
                        node.state
                    );

                    // Emit election timeout event
                    let timeout_event = RaftEvent::election_timeout(
                        node.id,
                        node.persistent_state.current_term,
                        node.state.clone(),
                        0, // Manual trigger, no actual timeout duration
                    );
                    let _ = event_broadcaster.emit(timeout_event);

                    // Force election by making this node a candidate
                    node.become_candidate();

                    // Emit state change event
                    let state_change_event = RaftEvent::state_change(
                        node.id,
                        node.persistent_state.current_term,
                        NodeState::Follower, // Previous state (approximation)
                        NodeState::Candidate,
                        "Manual election trigger".to_string(),
                    );
                    let _ = event_broadcaster.emit(state_change_event);

                    // Send vote requests to all other nodes
                    send_vote_requests(node, cluster_channels, event_broadcaster).await;
                } else {
                    info!(
                        node_id = node.id,
                        "🗳️ Manual election trigger ignored - node {} is already the leader",
                        node.id
                    );
                }

                return; // Don't process as normal command
            } else if command == "FORCE_LEADER_STEP_DOWN" {
                // Manual election trigger - force current leader to step down
                if matches!(node.state, NodeState::Leader) {
                    info!(
                        node_id = node.id,
                        "👑➡️👥 MANUAL ELECTION: Leader {} stepping down to trigger new election", 
                        node.id
                    );

                    // Emit state change event for leader stepping down
                    let step_down_event = RaftEvent::state_change(
                        node.id,
                        node.persistent_state.current_term,
                        NodeState::Leader,
                        NodeState::Follower,
                        "Manual election trigger - leader step down".to_string(),
                    );
                    let _ = event_broadcaster.emit(step_down_event);

                    // Leader steps down to follower
                    node.state = NodeState::Follower;
                    node.leader_state = None;
                    node.current_leader_id = None;

                    // Reset election timer to trigger election soon
                    node.reset_election_timer();
                    
                    info!(
                        node_id = node.id,
                        "✅ Leader {} stepped down - election will start soon", 
                        node.id
                    );
                } else {
                    debug!(
                        node_id = node.id,
                        "🗳️ Received leader step-down command but not the leader (state: {:?})", 
                        node.state
                    );
                }

                return; // Don't process as normal command
            } else if command == "SIMULATE_LEADER_FAILURE" {
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
                    command,
                    proposed_index,
                    node.persistent_state.current_term
                );

                // Client command already emitted above - no duplicate emission needed

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
                info!(
                    node_id = node.id,
                    "📡 EVENT EMITTED: LogEntryProposed for proposal {} (awaiting consensus) - STEP 2/4",
                    proposed_index
                );

                // Send AppendEntries to replicate the proposed entry
                if matches!(node.state, NodeState::Leader) {
                    info!(
                        node_id = node.id,
                        "📤 STEP 2/4 - REPLICATING: Broadcasting AppendEntries with proposal {} to {} followers",
                        proposed_index,
                        node.cluster_size - 1
                    );
                    send_append_entries_to_all_followers(node, cluster_channels, event_broadcaster)
                        .await;
                }
            } else {
                // This node is not the leader - attempt to forward to current leader
                if let Some(leader_id) = node.current_leader_id {
                    // Forward command to known leader
                    if leader_id != node.id {
                        // Don't forward to ourselves
                        info!(
                            node_id = node.id,
                            "📤 FORWARDING: Command '{}' from follower {} to leader {}",
                            command,
                            node.id,
                            leader_id
                        );

                        let forward_message =
                            RpcMessage::client_command(node.id, leader_id, command.clone());
                        if let Err(e) = cluster_channels.send_to_node(leader_id, forward_message) {
                            warn!(
                                node_id = node.id,
                                "❌ Failed to forward command to leader {}: {:?}", leader_id, e
                            );

                            // Emit rejection event since forwarding failed
                            let rejected_event = RaftEvent::new(
                                node.id,
                                node.persistent_state.current_term,
                                RaftEventType::ClientCommandRejected {
                                    command,
                                    reason: "Leader forwarding failed".to_string(),
                                },
                            );
                            let _ = event_broadcaster.emit(rejected_event);
                        }
                        // If forwarding succeeds, don't emit rejection - let leader handle it
                    } else {
                        // This shouldn't happen - if we think we're the leader but client_submit failed
                        debug!(
                            node_id = node.id,
                            "❌ Command '{}' rejected - inconsistent leader state", command
                        );

                        let rejected_event = RaftEvent::new(
                            node.id,
                            node.persistent_state.current_term,
                            RaftEventType::ClientCommandRejected {
                                command,
                                reason: "Inconsistent leader state".to_string(),
                            },
                        );
                        let _ = event_broadcaster.emit(rejected_event);
                    }
                } else {
                    // Don't know who the current leader is - reject command
                    debug!(
                        node_id = node.id,
                        "❌ Command '{}' rejected - unknown leader", command
                    );

                    let rejected_event = RaftEvent::new(
                        node.id,
                        node.persistent_state.current_term,
                        RaftEventType::ClientCommandRejected {
                            command,
                            reason: "Unknown leader".to_string(),
                        },
                    );
                    let _ = event_broadcaster.emit(rejected_event);
                }
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
    event_broadcaster: &EventBroadcaster,
) {
    let requests = node.create_vote_requests();

    if !requests.is_empty() {
        let request_count = requests.len();
        
        // Emit ElectionStarted event when candidate begins requesting votes
        let majority = (node.cluster_size / 2) + 1;
        let election_started_event = RaftEvent::election_started(
            node.id,
            node.persistent_state.current_term,
            majority,
        );
        let _ = event_broadcaster.emit(election_started_event);
        
        info!(
            node_id = node.id,
            "🗳️ ELECTION STARTED: Candidate {} requesting votes from {} nodes for term {} (need {}/{} votes)",
            node.id,
            request_count,
            node.persistent_state.current_term,
            majority,
            node.cluster_size
        );

        // Send vote requests and emit VoteRequested events
        for request in requests {
            // Emit VoteRequested event for each vote request
            let vote_requested_event = RaftEvent::vote_requested(
                node.id,
                request.term,
                request.last_log_index,
                request.last_log_term,
            );
            let _ = event_broadcaster.emit(vote_requested_event);

            let message = RpcMessage::request_vote_request(node.id, 0, request); // 'to' will be updated by broadcast
            cluster_channels.broadcast(message, node.id);
        }

        info!(
            node_id = node.id,
            "📤 VOTE REQUESTS SENT: {} RequestVote messages broadcasted for election term {}",
            request_count,
            node.persistent_state.current_term
        );
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

    // Send heartbeats and emit proper HeartbeatSent event (not MessageSent)
    if !heartbeats.is_empty() {
        // Emit a single HeartbeatSent event for all followers (cleaner than individual MessageSent)
        let heartbeat_event = RaftEvent::heartbeat_sent(
            node.id,
            node.persistent_state.current_term,
            follower_ids.clone(),
            node.get_commit_index(),
        );
        let _ = event_broadcaster.emit(heartbeat_event);

        // Send individual heartbeat RPCs to each follower
        for (i, heartbeat) in heartbeats.into_iter().enumerate() {
            let follower_id = follower_ids[i];
            let message = RpcMessage::append_entries_request(node.id, follower_id, heartbeat);
            if let Err(e) = cluster_channels.send_to_node(follower_id, message) {
                eprintln!("Failed to send heartbeat to node {follower_id}: {e:?}");
            }
        }
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
                info!(
                    node_id = node.id,
                    "📤 → Follower {}: Sending AppendEntries with {} entries ({} committed + {} pending)",
                    follower_id,
                    append_entries.entries.len(),
                    node.last_log_index(),
                    pending_count
                );

                // Emit log replication sent event (separate from heartbeats)
                if append_entries.entries.len() > 0 {
                    // For each entry being sent, emit a LogEntryProposed event
                    // This represents proposal broadcast (Leader → Followers)
                    for (entry_index, entry) in append_entries.entries.iter().enumerate() {
                        let log_index = append_entries.prev_log_index + 1 + entry_index as u64;
                        let required_acks = (cluster_channels.size() / 2) + 1;
                        let proposal_event = crate::raft::events::RaftEvent::log_entry_proposed(
                            node.id,
                            node.persistent_state.current_term,
                            log_index,
                            entry.command.clone(),
                            required_acks,
                        );
                        let _ = _event_broadcaster.emit(proposal_event);
                    }
                    
                    info!(
                        node_id = node.id,
                        "📡 EVENT EMITTED: {} LogEntryProposed events from leader {} → follower {} ({} entries)",
                        append_entries.entries.len(),
                        node.id,
                        follower_id,
                        append_entries.entries.len()
                    );
                }
                // Note: Empty AppendEntries (heartbeats) are now handled by HeartbeatSent events

                let message =
                    RpcMessage::append_entries_request(node.id, follower_id, append_entries);
                if let Err(e) = cluster_channels.send_to_node(follower_id, message) {
                    error!(
                        node_id = node.id,
                        "❌ Failed to send AppendEntries to node {}: {:?}", follower_id, e
                    );
                } else {
                    info!(
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
