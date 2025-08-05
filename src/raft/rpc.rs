use crate::raft::core::{LogEntry, NodeId};

/// AppendEntries RPC request sent by leaders to replicate log entries and provide heartbeats
#[derive(Debug, Clone, PartialEq)]
pub struct AppendEntriesRequest {
    /// Leader's current term
    pub term: u64,
    /// ID of the leader sending this request
    pub leader_id: NodeId,
    /// Index of log entry immediately preceding new ones
    pub prev_log_index: u64,
    /// Term of prev_log_index entry
    pub prev_log_term: u64,
    /// Log entries to store (empty for heartbeat; may send more than one for efficiency)
    pub entries: Vec<LogEntry>,
    /// Leader's commit index
    pub leader_commit: u64,
}

impl AppendEntriesRequest {
    /// Creates a new AppendEntries request (typically used for heartbeats)
    pub fn new(
        term: u64,
        leader_id: NodeId,
        prev_log_index: u64,
        prev_log_term: u64,
        leader_commit: u64,
    ) -> Self {
        Self {
            term,
            leader_id,
            prev_log_index,
            prev_log_term,
            entries: Vec::new(),
            leader_commit,
        }
    }

    /// Creates a new AppendEntries request with log entries
    pub fn with_entries(
        term: u64,
        leader_id: NodeId,
        prev_log_index: u64,
        prev_log_term: u64,
        entries: Vec<LogEntry>,
        leader_commit: u64,
    ) -> Self {
        Self {
            term,
            leader_id,
            prev_log_index,
            prev_log_term,
            entries,
            leader_commit,
        }
    }
}

/// AppendEntries RPC response sent by followers back to the leader
#[derive(Debug, Clone, PartialEq)]
pub struct AppendEntriesResponse {
    /// Current term of the responding node (for leader to update itself)
    pub term: u64,
    /// True if follower contained entry matching prev_log_index and prev_log_term
    pub success: bool,
}

impl AppendEntriesResponse {
    /// Creates a new AppendEntries response
    pub fn new(term: u64, success: bool) -> Self {
        Self { term, success }
    }
}

/// RequestVote RPC request sent by candidates to gather votes
#[derive(Debug, Clone, PartialEq)]
pub struct RequestVoteRequest {
    /// Candidate's current term
    pub term: u64,
    /// ID of the candidate requesting vote
    pub candidate_id: NodeId,
    /// Index of candidate's last log entry
    pub last_log_index: u64,
    /// Term of candidate's last log entry
    pub last_log_term: u64,
}

impl RequestVoteRequest {
    /// Creates a new RequestVote request
    pub fn new(term: u64, candidate_id: NodeId, last_log_index: u64, last_log_term: u64) -> Self {
        Self {
            term,
            candidate_id,
            last_log_index,
            last_log_term,
        }
    }
}

/// RequestVote RPC response sent by nodes back to the candidate
#[derive(Debug, Clone, PartialEq)]
pub struct RequestVoteResponse {
    /// Current term of the responding node (for candidate to update itself)
    pub term: u64,
    /// True if candidate received vote
    pub vote_granted: bool,
}

impl RequestVoteResponse {
    /// Creates a new RequestVote response
    pub fn new(term: u64, vote_granted: bool) -> Self {
        Self { term, vote_granted }
    }
}

/// Messages that can be sent between nodes in the Raft cluster
/// This enum represents all possible inter-node communications in the simulation
#[derive(Debug, Clone)]
pub enum RpcMessage {
    /// AppendEntries RPC request from leader to followers
    AppendEntriesRequest {
        /// ID of the node sending this request
        from: NodeId,
        /// ID of the node this request is sent to
        to: NodeId,
        /// The actual AppendEntries request data
        request: AppendEntriesRequest,
    },
    /// AppendEntries RPC response from follower back to leader
    AppendEntriesResponse {
        /// ID of the node sending this response
        from: NodeId,
        /// ID of the node this response is sent to
        to: NodeId,
        /// The actual AppendEntries response data
        response: AppendEntriesResponse,
    },
    /// RequestVote RPC request from candidate to other nodes
    RequestVoteRequest {
        /// ID of the node sending this request
        from: NodeId,
        /// ID of the node this request is sent to
        to: NodeId,
        /// The actual RequestVote request data
        request: RequestVoteRequest,
    },
    /// RequestVote RPC response from node back to candidate
    RequestVoteResponse {
        /// ID of the node sending this response
        from: NodeId,
        /// ID of the node this response is sent to
        to: NodeId,
        /// The actual RequestVote response data
        response: RequestVoteResponse,
    },
    /// Client command submission to the cluster
    ClientCommand {
        /// ID of the client (or simulation controller)
        from: NodeId,
        /// ID of the node receiving the command
        to: NodeId,
        /// The command to be executed
        command: String,
    },
}

impl RpcMessage {
    /// Creates a new AppendEntries request message
    pub fn append_entries_request(from: NodeId, to: NodeId, request: AppendEntriesRequest) -> Self {
        Self::AppendEntriesRequest { from, to, request }
    }

    /// Creates a new AppendEntries response message
    pub fn append_entries_response(
        from: NodeId,
        to: NodeId,
        response: AppendEntriesResponse,
    ) -> Self {
        Self::AppendEntriesResponse { from, to, response }
    }

    /// Creates a new RequestVote request message
    pub fn request_vote_request(from: NodeId, to: NodeId, request: RequestVoteRequest) -> Self {
        Self::RequestVoteRequest { from, to, request }
    }

    /// Creates a new RequestVote response message
    pub fn request_vote_response(from: NodeId, to: NodeId, response: RequestVoteResponse) -> Self {
        Self::RequestVoteResponse { from, to, response }
    }

    /// Creates a new client command message
    pub fn client_command(from: NodeId, to: NodeId, command: String) -> Self {
        Self::ClientCommand { from, to, command }
    }

    /// Gets the sender node ID for this message
    pub fn from(&self) -> NodeId {
        match self {
            Self::AppendEntriesRequest { from, .. } => *from,
            Self::AppendEntriesResponse { from, .. } => *from,
            Self::RequestVoteRequest { from, .. } => *from,
            Self::RequestVoteResponse { from, .. } => *from,
            Self::ClientCommand { from, .. } => *from,
        }
    }

    /// Gets the recipient node ID for this message
    pub fn to(&self) -> NodeId {
        match self {
            Self::AppendEntriesRequest { to, .. } => *to,
            Self::AppendEntriesResponse { to, .. } => *to,
            Self::RequestVoteRequest { to, .. } => *to,
            Self::RequestVoteResponse { to, .. } => *to,
            Self::ClientCommand { to, .. } => *to,
        }
    }

    /// Returns the message type as a string for debugging/logging
    pub fn message_type(&self) -> &'static str {
        match self {
            Self::AppendEntriesRequest { .. } => "AppendEntriesRequest",
            Self::AppendEntriesResponse { .. } => "AppendEntriesResponse",
            Self::RequestVoteRequest { .. } => "RequestVoteRequest",
            Self::RequestVoteResponse { .. } => "RequestVoteResponse",
            Self::ClientCommand { .. } => "ClientCommand",
        }
    }
}
