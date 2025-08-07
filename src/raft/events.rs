use serde::{Deserialize, Serialize};
/// Real-time event system for Raft cluster visualization
/// This module defines events that capture all significant Raft algorithm activities
/// for real-time monitoring and visualization purposes.
use std::time::{SystemTime, UNIX_EPOCH};

use crate::raft::core::{NodeId, NodeState};

/// Comprehensive event type capturing all Raft algorithm activities
/// Each event includes timestamp and context for real-time visualization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RaftEvent {
    /// Unique event identifier for tracking
    pub id: u64,
    /// Unix timestamp in milliseconds when event occurred
    pub timestamp: u64,
    /// Node that originated this event
    pub node_id: NodeId,
    /// Current term when event occurred
    pub term: u64,
    /// The specific event data
    pub event_type: RaftEventType,
}

impl RaftEvent {
    /// Creates a new RaftEvent with current timestamp
    pub fn new(node_id: NodeId, term: u64, event_type: RaftEventType) -> Self {
        static mut EVENT_COUNTER: u64 = 0;
        let id = unsafe {
            EVENT_COUNTER += 1;
            EVENT_COUNTER
        };

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        Self {
            id,
            timestamp,
            node_id,
            term,
            event_type,
        }
    }
}

/// All possible Raft algorithm events for comprehensive monitoring
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum RaftEventType {
    /// Node changed state (Follower/Candidate/Leader)
    StateChange {
        from_state: NodeState,
        to_state: NodeState,
        reason: String,
    },

    /// Leader election events
    ElectionTimeout {
        current_state: NodeState,
        timeout_duration_ms: u64,
    },

    ElectionStarted {
        candidate_term: u64,
        votes_needed: usize,
    },

    VoteRequested {
        candidate_id: NodeId,
        candidate_term: u64,
        last_log_index: u64,
        last_log_term: u64,
    },

    VoteGranted {
        voter_id: NodeId,
        candidate_id: NodeId,
        term: u64,
    },

    VoteDenied {
        voter_id: NodeId,
        candidate_id: NodeId,
        term: u64,
        reason: String,
    },

    LeaderElected {
        leader_id: NodeId,
        term: u64,
        votes_received: usize,
        total_votes: usize,
    },

    /// Log replication events
    LogEntryProposed {
        proposed_index: u64,
        term: u64,
        command: String,
        required_acks: usize,
    },

    LogEntryAdded {
        log_index: u64,
        term: u64,
        command: String,
    },

    LogEntryReplicated {
        follower_id: NodeId,
        log_index: u64,
        term: u64,
    },

    LogEntryCommitted {
        log_index: u64,
        term: u64,
        command: String,
    },

    /// Message passing events
    MessageSent {
        from: NodeId,
        to: NodeId,
        message_type: String,
        message_details: String,
    },

    MessageReceived {
        from: NodeId,
        to: NodeId,
        message_type: String,
        success: bool,
        response_details: Option<String>,
    },

    /// Heartbeat and timing events
    HeartbeatSent {
        leader_id: NodeId,
        followers: Vec<NodeId>,
        commit_index: u64,
    },

    HeartbeatReceived {
        follower_id: NodeId,
        leader_id: NodeId,
        leader_term: u64,
        commit_index: u64,
    },



    ReplicationCompleted {
        leader_id: NodeId,
        committed_indices: Vec<u64>,
        acknowledged_by: Vec<NodeId>,
        consensus_term: u64,
    },

    /// Consensus-specific ACK events (distinct from heartbeat ACKs)
    ConsensusAckReceived {
        from_follower: NodeId,
        to_leader: NodeId,
        proposal_index: u64,
        proposal_term: u64,
        success: bool,
        acks_received: usize,
        acks_needed: usize,
        consensus_achieved: bool,
    },

    /// Client interaction events
    ClientCommandReceived {
        command: String,
        accepted_by_leader: bool,
    },

    ClientCommandRejected {
        command: String,
        reason: String,
    },

    /// Network and failure events
    NetworkPartition {
        partitioned_nodes: Vec<NodeId>,
        remaining_nodes: Vec<NodeId>,
    },

    NodeFailure {
        failed_node_id: NodeId,
        failure_type: String,
    },

    NodeRecovery {
        recovered_node_id: NodeId,
        recovery_term: u64,
    },

    /// Cluster status events
    ClusterStatus {
        total_nodes: usize,
        active_nodes: usize,
        leader_id: Option<NodeId>,
        current_term: u64,
    },
}

/// Helper functions for creating common events
impl RaftEvent {
    /// Creates a state change event
    pub fn state_change(
        node_id: NodeId,
        term: u64,
        from_state: NodeState,
        to_state: NodeState,
        reason: String,
    ) -> Self {
        Self::new(
            node_id,
            term,
            RaftEventType::StateChange {
                from_state,
                to_state,
                reason,
            },
        )
    }

    /// Creates an election timeout event
    pub fn election_timeout(
        node_id: NodeId,
        term: u64,
        current_state: NodeState,
        timeout_duration_ms: u64,
    ) -> Self {
        Self::new(
            node_id,
            term,
            RaftEventType::ElectionTimeout {
                current_state,
                timeout_duration_ms,
            },
        )
    }

    /// Creates a leader elected event
    pub fn leader_elected(
        leader_id: NodeId,
        term: u64,
        votes_received: usize,
        total_votes: usize,
    ) -> Self {
        Self::new(
            leader_id,
            term,
            RaftEventType::LeaderElected {
                leader_id,
                term,
                votes_received,
                total_votes,
            },
        )
    }

    /// Creates an election started event
    pub fn election_started(
        candidate_id: NodeId,
        candidate_term: u64,
        votes_needed: usize,
    ) -> Self {
        Self::new(
            candidate_id,
            candidate_term,
            RaftEventType::ElectionStarted {
                candidate_term,
                votes_needed,
            },
        )
    }

    /// Creates a vote requested event
    pub fn vote_requested(
        candidate_id: NodeId,
        candidate_term: u64,
        last_log_index: u64,
        last_log_term: u64,
    ) -> Self {
        Self::new(
            candidate_id,
            candidate_term,
            RaftEventType::VoteRequested {
                candidate_id,
                candidate_term,
                last_log_index,
                last_log_term,
            },
        )
    }

    /// Creates a vote granted event
    pub fn vote_granted(
        voter_id: NodeId,
        candidate_id: NodeId,
        term: u64,
    ) -> Self {
        Self::new(
            voter_id,
            term,
            RaftEventType::VoteGranted {
                voter_id,
                candidate_id,
                term,
            },
        )
    }

    /// Creates a vote denied event
    pub fn vote_denied(
        voter_id: NodeId,
        candidate_id: NodeId,
        term: u64,
        reason: String,
    ) -> Self {
        Self::new(
            voter_id,
            term,
            RaftEventType::VoteDenied {
                voter_id,
                candidate_id,
                term,
                reason,
            },
        )
    }

    /// Creates a log entry proposed event
    pub fn log_entry_proposed(
        node_id: NodeId,
        term: u64,
        proposed_index: u64,
        command: String,
        required_acks: usize,
    ) -> Self {
        Self::new(
            node_id,
            term,
            RaftEventType::LogEntryProposed {
                proposed_index,
                term,
                command,
                required_acks,
            },
        )
    }

    /// Creates a log entry added event
    pub fn log_entry_added(node_id: NodeId, term: u64, log_index: u64, command: String) -> Self {
        Self::new(
            node_id,
            term,
            RaftEventType::LogEntryAdded {
                log_index,
                term,
                command,
            },
        )
    }

    /// Creates a message sent event
    pub fn message_sent(
        from: NodeId,
        to: NodeId,
        term: u64,
        message_type: String,
        message_details: String,
    ) -> Self {
        Self::new(
            from,
            term,
            RaftEventType::MessageSent {
                from,
                to,
                message_type,
                message_details,
            },
        )
    }

    /// Creates a heartbeat sent event
    pub fn heartbeat_sent(
        leader_id: NodeId,
        term: u64,
        followers: Vec<NodeId>,
        commit_index: u64,
    ) -> Self {
        Self::new(
            leader_id,
            term,
            RaftEventType::HeartbeatSent {
                leader_id,
                followers,
                commit_index,
            },
        )
    }

    /// Creates a heartbeat received event
    pub fn heartbeat_received(
        follower_id: NodeId,
        leader_id: NodeId,
        leader_term: u64,
        commit_index: u64,
    ) -> Self {
        Self::new(
            leader_id,
            leader_term,
            RaftEventType::HeartbeatReceived {
                follower_id,
                leader_id,
                leader_term,
                commit_index,
            },
        )
    }

    /// Creates a client command received event
    pub fn client_command_received(
        node_id: NodeId,
        term: u64,
        command: String,
        accepted_by_leader: bool,
    ) -> Self {
        Self::new(
            node_id,
            term,
            RaftEventType::ClientCommandReceived {
                command,
                accepted_by_leader,
            },
        )
    }

    /// Creates a log replication sent event

    /// Creates a replication ACK received event

    /// Creates a replication completed event
    pub fn replication_completed(
        leader_id: NodeId,
        consensus_term: u64,
        committed_indices: Vec<u64>,
        acknowledged_by: Vec<NodeId>,
    ) -> Self {
        Self::new(
            leader_id,
            consensus_term,
            RaftEventType::ReplicationCompleted {
                leader_id,
                committed_indices,
                acknowledged_by,
                consensus_term,
            },
        )
    }

    /// Creates a consensus ACK received event
    pub fn consensus_ack_received(
        from_follower: NodeId,
        to_leader: NodeId,
        term: u64,
        proposal_index: u64,
        proposal_term: u64,
        success: bool,
        acks_received: usize,
        acks_needed: usize,
        consensus_achieved: bool,
    ) -> Self {
        Self::new(
            to_leader,
            term,
            RaftEventType::ConsensusAckReceived {
                from_follower,
                to_leader,
                proposal_index,
                proposal_term,
                success,
                acks_received,
                acks_needed,
                consensus_achieved,
            },
        )
    }
}

/// Event channel wrapper for broadcasting events to multiple subscribers
#[derive(Debug, Clone)]
pub struct EventBroadcaster {
    sender: tokio::sync::broadcast::Sender<RaftEvent>,
    /// Recent events for deduplication (event_key -> timestamp)
    recent_events: std::sync::Arc<std::sync::RwLock<std::collections::HashMap<String, u64>>>,
}

impl EventBroadcaster {
    /// Creates a new event broadcaster with specified channel capacity
    pub fn new(capacity: usize) -> (Self, tokio::sync::broadcast::Receiver<RaftEvent>) {
        let (sender, receiver) = tokio::sync::broadcast::channel(capacity);
        (
            Self {
                sender,
                recent_events: std::sync::Arc::new(std::sync::RwLock::new(
                    std::collections::HashMap::new(),
                )),
            },
            receiver,
        )
    }

    /// Broadcasts an event to all subscribers with deduplication
    pub fn emit(
        &self,
        event: RaftEvent,
    ) -> Result<usize, tokio::sync::broadcast::error::SendError<RaftEvent>> {
        // Create deduplication key based on event type, node, and timing
        let event_key = self.create_event_key(&event);
        let now = event.timestamp;

        // Check for recent duplicates (within 100ms window)
        if let Ok(recent_events) = self.recent_events.read() {
            if let Some(&last_timestamp) = recent_events.get(&event_key) {
                if now.saturating_sub(last_timestamp) < 100 {
                    // Skip duplicate event within time window
                    return Ok(0); // Return 0 to indicate no emission
                }
            }
        }

        // Update recent events tracking
        if let Ok(mut recent_events) = self.recent_events.write() {
            // Clean old events (older than 1 second)
            recent_events.retain(|_, &mut timestamp| now.saturating_sub(timestamp) < 1000);
            recent_events.insert(event_key, now);
        }

        // Emit the event
        self.sender.send(event)
    }

    /// Creates a deduplication key for an event
    fn create_event_key(&self, event: &RaftEvent) -> String {
        use std::fmt::Write;
        let mut key = String::new();

        // Include event type in key
        match &event.event_type {
            RaftEventType::MessageSent {
                from,
                to,
                message_type,
                ..
            } => {
                write!(&mut key, "MessageSent:{}:{}:{}", from, to, message_type).ok();
            }
            RaftEventType::HeartbeatSent { leader_id, .. } => {
                write!(&mut key, "HeartbeatSent:{}", leader_id).ok();
            }
            RaftEventType::StateChange {
                from_state,
                to_state,
                ..
            } => {
                write!(
                    &mut key,
                    "StateChange:{}:{:?}:{:?}",
                    event.node_id, from_state, to_state
                )
                .ok();
            }
            RaftEventType::LeaderElected { leader_id, .. } => {
                write!(&mut key, "LeaderElected:{}", leader_id).ok();
            }
            RaftEventType::ReplicationCompleted {
                leader_id,
                consensus_term,
                ..
            } => {
                write!(
                    &mut key,
                    "ReplicationCompleted:{}:{}",
                    leader_id, consensus_term
                )
                .ok();
            }
            RaftEventType::ConsensusAckReceived {
                from_follower,
                to_leader,
                proposal_index,
                success,
                ..
            } => {
                write!(
                    &mut key,
                    "ConsensusAck:{}:{}:{}:{}",
                    from_follower, to_leader, proposal_index, success
                )
                .ok();
            }
            _ => {
                // For other events, use simple node_id + event type
                write!(&mut key, "{:?}:{}", event.event_type, event.node_id).ok();
            }
        }

        key
    }

    /// Creates a new subscriber to the event stream
    pub fn subscribe(&self) -> tokio::sync::broadcast::Receiver<RaftEvent> {
        self.sender.subscribe()
    }

    /// Returns the number of active subscribers
    pub fn receiver_count(&self) -> usize {
        self.sender.receiver_count()
    }

    /// Returns statistics about event emission and deduplication
    pub fn get_stats(&self) -> EventBroadcasterStats {
        if let Ok(recent_events) = self.recent_events.read() {
            EventBroadcasterStats {
                active_event_types: recent_events.len(),
                subscribers: self.receiver_count(),
            }
        } else {
            EventBroadcasterStats {
                active_event_types: 0,
                subscribers: self.receiver_count(),
            }
        }
    }
}

/// Statistics for the EventBroadcaster
#[derive(Debug, Clone)]
pub struct EventBroadcasterStats {
    pub active_event_types: usize,
    pub subscribers: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_creation() {
        let event = RaftEvent::state_change(
            0,
            1,
            NodeState::Follower,
            NodeState::Candidate,
            "Election timeout".to_string(),
        );

        assert_eq!(event.node_id, 0);
        assert_eq!(event.term, 1);
        match event.event_type {
            RaftEventType::StateChange {
                from_state,
                to_state,
                reason,
            } => {
                assert!(matches!(from_state, NodeState::Follower));
                assert!(matches!(to_state, NodeState::Candidate));
                assert_eq!(reason, "Election timeout");
            }
            _ => panic!("Wrong event type"),
        }
    }

    #[test]
    fn test_event_broadcaster() {
        let (broadcaster, mut receiver) = EventBroadcaster::new(100);

        let event = RaftEvent::leader_elected(1, 2, 3, 5);
        broadcaster.emit(event.clone()).unwrap();

        let received_event = receiver.blocking_recv().unwrap();
        assert_eq!(received_event.id, event.id);
        assert_eq!(received_event.node_id, 1);
        assert_eq!(received_event.term, 2);
    }

    #[test]
    fn test_event_serialization() {
        let event = RaftEvent::election_timeout(0, 1, NodeState::Follower, 250);

        let json = serde_json::to_string(&event).unwrap();
        let deserialized: RaftEvent = serde_json::from_str(&json).unwrap();

        assert_eq!(event.node_id, deserialized.node_id);
        assert_eq!(event.term, deserialized.term);
    }

    #[test]
    fn test_event_deduplication() {
        let (broadcaster, mut receiver) = EventBroadcaster::new(100);

        // Create identical events with same timestamp
        let timestamp = 123456789;
        let event1 = RaftEvent {
            id: 1,
            timestamp,
            node_id: 0,
            term: 1,
            event_type: RaftEventType::MessageSent {
                from: 0,
                to: 1,
                message_type: "AppendEntriesRequest".to_string(),
                message_details: "Test".to_string(),
            },
        };

        let event2 = RaftEvent {
            id: 2,
            timestamp, // Same timestamp
            node_id: 0,
            term: 1,
            event_type: RaftEventType::MessageSent {
                from: 0,
                to: 1,
                message_type: "AppendEntriesRequest".to_string(),
                message_details: "Test".to_string(),
            },
        };

        // First event should be emitted
        let result1 = broadcaster.emit(event1);
        assert!(result1.is_ok());
        assert_eq!(result1.unwrap(), 1); // 1 receiver got the event

        // Second identical event should be deduplicated
        let result2 = broadcaster.emit(event2);
        assert!(result2.is_ok());
        assert_eq!(result2.unwrap(), 0); // 0 receivers (deduplicated)

        // Only one event should be received
        let received_event = receiver.try_recv().unwrap();
        assert_eq!(received_event.id, 1);

        // No more events should be available
        assert!(receiver.try_recv().is_err());
    }

    #[test]
    fn test_event_deduplication_time_window() {
        let (broadcaster, mut receiver) = EventBroadcaster::new(100);

        // Create events with different timestamps (outside dedup window)
        let timestamp1 = 123456789;
        let timestamp2 = timestamp1 + 200; // 200ms later (outside 100ms window)

        let event1 = RaftEvent {
            id: 1,
            timestamp: timestamp1,
            node_id: 0,
            term: 1,
            event_type: RaftEventType::MessageSent {
                from: 0,
                to: 1,
                message_type: "AppendEntriesRequest".to_string(),
                message_details: "Test".to_string(),
            },
        };

        let event2 = RaftEvent {
            id: 2,
            timestamp: timestamp2,
            node_id: 0,
            term: 1,
            event_type: RaftEventType::MessageSent {
                from: 0,
                to: 1,
                message_type: "AppendEntriesRequest".to_string(),
                message_details: "Test".to_string(),
            },
        };

        // Both events should be emitted (outside dedup window)
        let result1 = broadcaster.emit(event1);
        assert!(result1.is_ok());
        assert_eq!(result1.unwrap(), 1);

        let result2 = broadcaster.emit(event2);
        assert!(result2.is_ok());
        assert_eq!(result2.unwrap(), 1);

        // Both events should be received
        let received_event1 = receiver.try_recv().unwrap();
        assert_eq!(received_event1.id, 1);

        let received_event2 = receiver.try_recv().unwrap();
        assert_eq!(received_event2.id, 2);

        // No more events should be available
        assert!(receiver.try_recv().is_err());
    }
}
