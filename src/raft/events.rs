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
}

/// Event channel wrapper for broadcasting events to multiple subscribers
#[derive(Debug, Clone)]
pub struct EventBroadcaster {
    sender: tokio::sync::broadcast::Sender<RaftEvent>,
}

impl EventBroadcaster {
    /// Creates a new event broadcaster with specified channel capacity
    pub fn new(capacity: usize) -> (Self, tokio::sync::broadcast::Receiver<RaftEvent>) {
        let (sender, receiver) = tokio::sync::broadcast::channel(capacity);
        (Self { sender }, receiver)
    }

    /// Broadcasts an event to all subscribers
    pub fn emit(
        &self,
        event: RaftEvent,
    ) -> Result<usize, tokio::sync::broadcast::error::SendError<RaftEvent>> {
        self.sender.send(event)
    }

    /// Creates a new subscriber to the event stream
    pub fn subscribe(&self) -> tokio::sync::broadcast::Receiver<RaftEvent> {
        self.sender.subscribe()
    }

    /// Returns the number of active subscribers
    pub fn receiver_count(&self) -> usize {
        self.sender.receiver_count()
    }
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
}
