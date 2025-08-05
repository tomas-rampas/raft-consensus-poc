use rand::Rng;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::time::{Duration, Instant};

/// Type alias for node identifiers in the cluster
pub type NodeId = usize;

/// Represents a single entry in the Raft log containing a term and command
#[derive(Debug, Clone, PartialEq)]
pub struct LogEntry {
    /// The term when this entry was created by a leader
    pub term: u64,
    /// The command/data to be applied to the state machine
    pub command: String,
}

impl LogEntry {
    /// Creates a new log entry with the specified term and command
    pub fn new(term: u64, command: String) -> Self {
        Self { term, command }
    }
}

/// Represents the three possible states a Raft node can be in
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum NodeState {
    /// Node is following a leader and responding to RPCs
    Follower,
    /// Node is seeking election to become leader
    Candidate,
    /// Node is the leader, handling client requests and replicating log
    Leader,
}

impl fmt::Display for NodeState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            NodeState::Follower => write!(f, "Follower"),
            NodeState::Candidate => write!(f, "Candidate"),
            NodeState::Leader => write!(f, "Leader"),
        }
    }
}

/// Persistent state that must survive server restarts (would be saved to disk in production)
#[derive(Debug, Clone)]
pub struct PersistentState {
    /// Latest term server has seen (initialized to 0, increases monotonically)
    pub current_term: u64,
    /// Candidate ID that received vote in current term (or None if none)
    pub voted_for: Option<NodeId>,
    /// Log entries; each entry contains command for state machine and term when received by leader
    pub log: Vec<LogEntry>,
}

impl PersistentState {
    /// Creates new persistent state with initial values
    pub fn new() -> Self {
        Self {
            current_term: 0,
            voted_for: None,
            log: Vec::new(),
        }
    }
}

impl Default for PersistentState {
    fn default() -> Self {
        Self::new()
    }
}

/// Volatile state maintained by all servers (lost on restart)
#[derive(Debug, Clone)]
pub struct VolatileState {
    /// Index of highest log entry known to be committed (initialized to 0, increases monotonically)
    pub commit_index: u64,
    /// Index of highest log entry applied to state machine (initialized to 0, increases monotonically)
    pub last_applied: u64,
}

impl VolatileState {
    /// Creates new volatile state with initial values
    pub fn new() -> Self {
        Self {
            commit_index: 0,
            last_applied: 0,
        }
    }
}

impl Default for VolatileState {
    fn default() -> Self {
        Self::new()
    }
}

/// Volatile state maintained only by leaders (reinitialized after election)
#[derive(Debug, Clone)]
pub struct LeaderVolatileState {
    /// For each server, index of the next log entry to send to that server (initialized to leader last log index + 1)
    pub next_index: Vec<u64>,
    /// For each server, index of highest log entry known to be replicated on server (initialized to 0, increases monotonically)
    pub match_index: Vec<u64>,
}

impl LeaderVolatileState {
    /// Creates new leader volatile state for the specified cluster size
    pub fn new(cluster_size: usize, last_log_index: u64) -> Self {
        Self {
            next_index: vec![last_log_index + 1; cluster_size],
            match_index: vec![0; cluster_size],
        }
    }
}

/// Main Raft node structure that combines all state and implements the Raft algorithm
#[derive(Debug)]
pub struct Node {
    /// Unique identifier for this node
    pub id: NodeId,
    /// Current state of this node (Follower, Candidate, or Leader)
    pub state: NodeState,
    /// Persistent state that survives restarts
    pub persistent_state: PersistentState,
    /// Volatile state maintained by all nodes
    pub volatile_state: VolatileState,
    /// Volatile state maintained only by leaders (None if not leader)
    pub leader_state: Option<LeaderVolatileState>,
    /// Number of nodes in the cluster
    pub cluster_size: usize,
    /// Deadline for election timeout
    pub election_timeout: Instant,
    /// Duration for election timeouts
    pub election_timeout_duration: Duration,
    /// Time of last heartbeat sent (for leaders) or received (for followers)
    pub last_heartbeat_time: Instant,
    /// Interval between heartbeats
    pub heartbeat_interval: Duration,
    /// Current term for candidate vote tracking
    pub votes_received: usize,
    /// Temporary failure simulation - when Some, node is "failed" until this time
    pub simulated_failure_until: Option<Instant>,
}

impl Node {
    /// Creates a new Raft node with the specified ID and cluster size
    pub fn new(id: NodeId, cluster_size: usize) -> Self {
        let mut node = Self {
            id,
            state: NodeState::Follower,
            persistent_state: PersistentState::new(),
            volatile_state: VolatileState::new(),
            leader_state: None,
            cluster_size,
            election_timeout: Instant::now(),
            election_timeout_duration: Duration::from_millis(0),
            last_heartbeat_time: Instant::now(),
            heartbeat_interval: Duration::from_millis(50), // 50ms heartbeat interval
            votes_received: 0,
            simulated_failure_until: None,
        };

        // Set initial random election timeout
        node.reset_election_timer();
        node
    }

    /// Resets the election timeout to a random value between 150-300ms
    pub fn reset_election_timer(&mut self) {
        let mut rng = rand::thread_rng();
        let timeout_ms = rng.gen_range(150..=300);
        self.election_timeout_duration = Duration::from_millis(timeout_ms);
        self.election_timeout = Instant::now() + self.election_timeout_duration;
    }
    
    /// Sets the election timeout to a specific duration in milliseconds
    /// Used for testing and simulation purposes
    pub fn set_election_timeout(&mut self, timeout_ms: u64) {
        self.election_timeout_duration = Duration::from_millis(timeout_ms);
        self.election_timeout = Instant::now() + self.election_timeout_duration;
    }
    
    /// Simulates a temporary failure for the specified duration
    /// During this time, the node won't send heartbeats or respond to requests
    pub fn simulate_failure(&mut self, duration_ms: u64) {
        self.simulated_failure_until = Some(Instant::now() + Duration::from_millis(duration_ms));
    }
    
    /// Checks if the node is currently in a simulated failure state
    pub fn is_failed(&self) -> bool {
        if let Some(failure_end) = self.simulated_failure_until {
            Instant::now() < failure_end
        } else {
            false
        }
    }
    
    /// Recovers from simulated failure
    pub fn recover_from_failure(&mut self) {
        self.simulated_failure_until = None;
    }

    /// Checks if the election timeout has expired
    pub fn is_election_timeout(&self) -> bool {
        Instant::now() >= self.election_timeout
    }

    /// Gets the term of a log entry at the specified index (1-based)
    /// Returns None if the index is out of bounds
    pub fn get_log_term(&self, index: u64) -> Option<u64> {
        if index == 0 {
            return Some(0); // Term 0 for the conceptual entry before the first real entry
        }
        self.persistent_state
            .log
            .get((index - 1) as usize)
            .map(|entry| entry.term)
    }

    /// Gets the index of the last log entry (1-based, 0 if log is empty)
    pub fn last_log_index(&self) -> u64 {
        self.persistent_state.log.len() as u64
    }

    /// Gets the term of the last log entry (0 if log is empty)
    pub fn last_log_term(&self) -> u64 {
        self.persistent_state
            .log
            .last()
            .map(|entry| entry.term)
            .unwrap_or(0)
    }

    /// Checks if it's time to send heartbeats (only relevant for leaders)
    pub fn should_send_heartbeat(&self) -> bool {
        matches!(self.state, NodeState::Leader)
            && Instant::now() >= self.last_heartbeat_time + self.heartbeat_interval
    }

    /// Updates the last heartbeat time to now
    pub fn update_heartbeat_time(&mut self) {
        self.last_heartbeat_time = Instant::now();
    }

    /// Gets the current commit index
    pub fn get_commit_index(&self) -> u64 {
        self.volatile_state.commit_index
    }
}

impl fmt::Display for Node {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Node{} [{}] T:{} Log:{} C:{}",
            self.id,
            self.state,
            self.persistent_state.current_term,
            self.last_log_index(),
            self.volatile_state.commit_index
        )
    }
}
