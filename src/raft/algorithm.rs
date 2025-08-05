use crate::raft::core::{LeaderVolatileState, Node, NodeId, NodeState};
use crate::raft::rpc::{
    AppendEntriesRequest, AppendEntriesResponse, RequestVoteRequest, RequestVoteResponse,
};
use tracing::{debug, info, trace};

impl Node {
    /// Handles an AppendEntries RPC request from a leader
    /// Returns the appropriate response and updates node state as needed
    pub fn handle_append_entries(
        &mut self,
        request: &AppendEntriesRequest,
    ) -> AppendEntriesResponse {
        trace!(
            node_id = self.id,
            "Received AppendEntries from leader {}: term={}, prev_log_index={}, entries={}",
            request.leader_id,
            request.term,
            request.prev_log_index,
            request.entries.len()
        );

        // If the incoming term is greater than our current term, we need to update
        if request.term > self.persistent_state.current_term {
            info!(
                node_id = self.id,
                "Updating term from {} to {} due to AppendEntries from leader {}",
                self.persistent_state.current_term,
                request.term,
                request.leader_id
            );
            self.persistent_state.current_term = request.term;
            self.persistent_state.voted_for = None;
            if !matches!(self.state, NodeState::Follower) {
                info!(
                    node_id = self.id,
                    "Stepping down to Follower from {:?}", self.state
                );
            }
            self.state = NodeState::Follower;
        }

        // If the incoming term is less than our current term, reject
        if request.term < self.persistent_state.current_term {
            debug!(
                node_id = self.id,
                "Rejecting stale AppendEntries: request term {} < current term {}",
                request.term,
                self.persistent_state.current_term
            );
            return AppendEntriesResponse::new(self.persistent_state.current_term, false);
        }

        // Valid leader contact - reset election timer and become follower if not already
        debug!(
            node_id = self.id,
            "Valid leader contact from {}, resetting election timer", request.leader_id
        );
        self.reset_election_timer();
        if !matches!(self.state, NodeState::Follower) {
            info!(
                node_id = self.id,
                "Stepping down to Follower from {:?} due to valid leader contact", self.state
            );
            self.state = NodeState::Follower;
        }

        // Check log consistency - if prev_log_index is beyond our log, reject
        if request.prev_log_index > 0 && request.prev_log_index > self.last_log_index() {
            return AppendEntriesResponse::new(self.persistent_state.current_term, false);
        }

        // Check if the term at prev_log_index matches
        if request.prev_log_index > 0 {
            if let Some(term) = self.get_log_term(request.prev_log_index) {
                if term != request.prev_log_term {
                    return AppendEntriesResponse::new(self.persistent_state.current_term, false);
                }
            } else {
                return AppendEntriesResponse::new(self.persistent_state.current_term, false);
            }
        }

        // If we have entries to append
        if !request.entries.is_empty() {
            // Remove conflicting entries (from prev_log_index + 1 onwards)
            let start_index = (request.prev_log_index + 1) as usize;
            if start_index <= self.persistent_state.log.len() {
                self.persistent_state.log.truncate(start_index - 1);
            }

            // Append new entries
            self.persistent_state.log.extend(request.entries.clone());
        }

        // Update commit index if leader's commit index is higher
        if request.leader_commit > self.volatile_state.commit_index {
            self.volatile_state.commit_index = request.leader_commit.min(self.last_log_index());
        }

        AppendEntriesResponse::new(self.persistent_state.current_term, true)
    }

    /// Handles a RequestVote RPC request from a candidate
    /// Returns the appropriate response and updates voting state
    pub fn handle_request_vote(&mut self, request: &RequestVoteRequest) -> RequestVoteResponse {
        // If the incoming term is greater than our current term, update and step down
        if request.term > self.persistent_state.current_term {
            self.persistent_state.current_term = request.term;
            self.persistent_state.voted_for = None;
            self.state = NodeState::Follower;
        }

        // If the incoming term is less than our current term, reject
        if request.term < self.persistent_state.current_term {
            return RequestVoteResponse::new(self.persistent_state.current_term, false);
        }

        // Check if we can vote for this candidate
        let can_vote = self.persistent_state.voted_for.is_none()
            || self.persistent_state.voted_for == Some(request.candidate_id);

        if !can_vote {
            return RequestVoteResponse::new(self.persistent_state.current_term, false);
        }

        // Check if candidate's log is at least as up-to-date as ours
        let candidate_log_up_to_date = if request.last_log_term > self.last_log_term() {
            true
        } else if request.last_log_term == self.last_log_term() {
            request.last_log_index >= self.last_log_index()
        } else {
            false
        };

        if candidate_log_up_to_date {
            // Grant vote
            self.persistent_state.voted_for = Some(request.candidate_id);
            self.reset_election_timer(); // Reset election timer when granting vote
            RequestVoteResponse::new(self.persistent_state.current_term, true)
        } else {
            // Reject vote due to stale log
            RequestVoteResponse::new(self.persistent_state.current_term, false)
        }
    }

    /// Transitions this node to candidate state and starts an election
    pub fn become_candidate(&mut self) {
        info!(
            node_id = self.id,
            "🗳️  Starting election for term {}",
            self.persistent_state.current_term + 1
        );
        self.state = NodeState::Candidate;
        self.persistent_state.current_term += 1;
        self.persistent_state.voted_for = Some(self.id);
        self.votes_received = 1; // Vote for self
        self.reset_election_timer();
        info!(
            node_id = self.id,
            "🎯 Became candidate for term {}, voted for self (1/{} votes)",
            self.persistent_state.current_term,
            (self.cluster_size / 2) + 1
        );
    }

    /// Processes a vote response and returns true if this node should become leader
    pub fn process_vote_response(&mut self, response: &RequestVoteResponse) -> bool {
        // Check if we're still a candidate and the response is for our current term
        if !matches!(self.state, NodeState::Candidate)
            || response.term != self.persistent_state.current_term
        {
            return false;
        }

        // If the response term is higher, step down
        if response.term > self.persistent_state.current_term {
            self.persistent_state.current_term = response.term;
            self.persistent_state.voted_for = None;
            self.state = NodeState::Follower;
            return false;
        }

        // If vote was granted, increment count
        if response.vote_granted {
            self.votes_received += 1;
            let majority = (self.cluster_size / 2) + 1;
            info!(
                node_id = self.id,
                "✅ Vote granted! Now have {}/{} votes for term {}",
                self.votes_received,
                majority,
                self.persistent_state.current_term
            );

            // Check if we have majority
            self.votes_received >= majority
        } else {
            debug!(
                node_id = self.id,
                "❌ Vote denied, still have {}/{} votes",
                self.votes_received,
                (self.cluster_size / 2) + 1
            );
            false
        }
    }

    /// Transitions this node to leader state
    pub fn become_leader(&mut self) {
        info!(
            node_id = self.id,
            "👑 Became LEADER for term {} with majority votes!", self.persistent_state.current_term
        );
        self.state = NodeState::Leader;
        self.leader_state = Some(LeaderVolatileState::new(
            self.cluster_size,
            self.last_log_index(),
        ));
        self.update_heartbeat_time();
        self.votes_received = 0;
        info!(
            node_id = self.id,
            "❤️  Starting to send heartbeats to {} followers",
            self.cluster_size - 1
        );
    }

    /// Handles client command submission (only leaders can accept commands)
    /// Returns the log index where the command was stored, or None if not leader
    pub fn client_submit(&mut self, command: String) -> Option<u64> {
        if !matches!(self.state, NodeState::Leader) {
            debug!(
                node_id = self.id,
                "Rejecting client command '{}' - not the leader", command
            );
            return None;
        }

        // Create new log entry
        let new_entry =
            crate::raft::core::LogEntry::new(self.persistent_state.current_term, command.clone());
        self.persistent_state.log.push(new_entry);
        let log_index = self.last_log_index();

        info!(
            node_id = self.id,
            "📝 Added command '{}' to log at index {} (term {})",
            command,
            log_index,
            self.persistent_state.current_term
        );

        Some(log_index)
    }

    /// Creates heartbeat AppendEntries requests for all followers
    pub fn create_heartbeats(&self) -> Vec<AppendEntriesRequest> {
        if !matches!(self.state, NodeState::Leader) {
            return Vec::new();
        }

        let mut heartbeats = Vec::new();

        for follower_id in 0..self.cluster_size {
            if follower_id != self.id {
                let heartbeat = AppendEntriesRequest::new(
                    self.persistent_state.current_term,
                    self.id,
                    self.last_log_index(),
                    self.last_log_term(),
                    self.volatile_state.commit_index,
                );
                heartbeats.push(heartbeat);
            }
        }

        heartbeats
    }

    /// Creates an AppendEntries request for a specific follower with appropriate log entries
    pub fn create_append_entries_for_follower(
        &self,
        follower_id: NodeId,
    ) -> Option<AppendEntriesRequest> {
        if !matches!(self.state, NodeState::Leader) || follower_id >= self.cluster_size {
            return None;
        }

        let leader_state = self.leader_state.as_ref()?;
        let next_index = leader_state.next_index[follower_id];

        // Previous log entry info
        let prev_log_index = next_index.saturating_sub(1);
        let prev_log_term = if prev_log_index == 0 {
            0
        } else {
            self.get_log_term(prev_log_index).unwrap_or(0)
        };

        // Entries to send (from next_index onwards)
        let entries = if next_index <= self.last_log_index() {
            self.persistent_state.log[(next_index - 1) as usize..].to_vec()
        } else {
            Vec::new()
        };

        Some(AppendEntriesRequest::with_entries(
            self.persistent_state.current_term,
            self.id,
            prev_log_index,
            prev_log_term,
            entries,
            self.volatile_state.commit_index,
        ))
    }

    /// Handles AppendEntries response from a follower (only relevant for leaders)
    pub fn handle_append_entries_response(
        &mut self,
        follower_id: NodeId,
        response: &AppendEntriesResponse,
    ) {
        if !matches!(self.state, NodeState::Leader) || follower_id >= self.cluster_size {
            return;
        }

        // If response term is higher, step down
        if response.term > self.persistent_state.current_term {
            self.persistent_state.current_term = response.term;
            self.persistent_state.voted_for = None;
            self.state = NodeState::Follower;
            self.leader_state = None;
            return;
        }

        // Ignore stale responses
        if response.term < self.persistent_state.current_term {
            return;
        }

        if response.success {
            // Success - update next_index and match_index
            let last_log_index = self.last_log_index();
            let leader_state = self.leader_state.as_mut().unwrap();
            let next_index = leader_state.next_index[follower_id];
            let entries_sent = if next_index <= last_log_index {
                (last_log_index - next_index + 1) as usize
            } else {
                0
            };

            if entries_sent > 0 {
                let new_match_index = next_index + entries_sent as u64 - 1;
                leader_state.match_index[follower_id] = new_match_index;
                leader_state.next_index[follower_id] = new_match_index + 1;
            }

            // Try to advance commit index
            self.try_advance_commit_index();
        } else {
            // Failure - decrement next_index and retry
            let leader_state = self.leader_state.as_mut().unwrap();
            leader_state.next_index[follower_id] =
                leader_state.next_index[follower_id].saturating_sub(1);
        }
    }

    /// Attempts to advance the commit index based on majority replication
    pub fn try_advance_commit_index(&mut self) {
        if !matches!(self.state, NodeState::Leader) {
            return;
        }

        let leader_state = self.leader_state.as_ref().unwrap();
        let majority = (self.cluster_size / 2) + 1;

        // Check each possible commit index from current + 1 to last log index
        for index in (self.volatile_state.commit_index + 1)..=self.last_log_index() {
            // Count how many nodes have this index replicated (including leader)
            let mut replication_count = 1; // Leader always has it

            for &match_index in &leader_state.match_index {
                if match_index >= index {
                    replication_count += 1;
                }
            }

            // If majority has replicated this index and it's from current term, commit it
            if replication_count >= majority {
                if let Some(term) = self.get_log_term(index) {
                    if term == self.persistent_state.current_term {
                        self.volatile_state.commit_index = index;
                    }
                }
            }
        }
    }

    /// Creates RequestVote requests for all other nodes in the cluster
    pub fn create_vote_requests(&self) -> Vec<RequestVoteRequest> {
        if !matches!(self.state, NodeState::Candidate) {
            return Vec::new();
        }

        let mut requests = Vec::new();

        for node_id in 0..self.cluster_size {
            if node_id != self.id {
                let request = RequestVoteRequest::new(
                    self.persistent_state.current_term,
                    self.id,
                    self.last_log_index(),
                    self.last_log_term(),
                );
                requests.push(request);
            }
        }

        requests
    }
}
