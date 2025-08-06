#[cfg(test)]
mod core_tests {
    use super::super::core::*;

    #[test]
    fn test_log_entry_creation() {
        let entry = LogEntry::new(1, "test command".to_string());
        assert_eq!(entry.term, 1);
        assert_eq!(entry.command, "test command");
    }

    #[test]
    fn test_persistent_state_default() {
        let state = PersistentState::new();
        assert_eq!(state.current_term, 0);
        assert_eq!(state.voted_for, None);
        assert!(state.log.is_empty());
    }

    #[test]
    fn test_volatile_state_default() {
        let state = VolatileState::new();
        assert_eq!(state.commit_index, 0);
        assert_eq!(state.last_applied, 0);
    }

    #[test]
    fn test_leader_volatile_state_initialization() {
        let state = LeaderVolatileState::new(3, 5);
        assert_eq!(state.next_index, vec![6, 6, 6]);
        assert_eq!(state.match_index, vec![0, 0, 0]);
        assert!(state.pending_proposals.is_empty());
    }

    #[test]
    fn test_pending_proposal_creation() {
        let proposal = PendingProposal::new(1, 2, "test command".to_string(), 0);
        assert_eq!(proposal.proposed_index, 1);
        assert_eq!(proposal.term, 2);
        assert_eq!(proposal.command, "test command");
        assert_eq!(proposal.acknowledgments, vec![0]); // Leader acknowledges by default
        assert!(!proposal.has_majority(5)); // Should need 3 acks for majority in cluster of 5
    }

    #[test]
    fn test_pending_proposal_acknowledgments() {
        let mut proposal = PendingProposal::new(1, 2, "test command".to_string(), 0);

        // Add acknowledgments
        proposal.add_acknowledgment(1);
        proposal.add_acknowledgment(2);
        assert_eq!(proposal.acknowledgments.len(), 3);

        // Check majority
        assert!(proposal.has_majority(5)); // 3 out of 5 is majority

        // Adding same acknowledgment again should not duplicate
        proposal.add_acknowledgment(1);
        assert_eq!(proposal.acknowledgments.len(), 3);
    }

    #[test]
    fn test_node_creation() {
        let node = Node::new(1, 5);
        assert_eq!(node.id, 1);
        assert_eq!(node.cluster_size, 5);
        assert_eq!(node.state, NodeState::Follower);
        assert!(node.leader_state.is_none());
        assert_eq!(node.votes_received, 0);
    }

    #[test]
    fn test_log_term_retrieval() {
        let mut node = Node::new(0, 3);

        // Initially empty log
        assert_eq!(node.get_log_term(0), Some(0));
        assert_eq!(node.get_log_term(1), None);

        // Add some entries
        node.persistent_state
            .log
            .push(LogEntry::new(1, "cmd1".to_string()));
        node.persistent_state
            .log
            .push(LogEntry::new(2, "cmd2".to_string()));

        assert_eq!(node.get_log_term(0), Some(0));
        assert_eq!(node.get_log_term(1), Some(1));
        assert_eq!(node.get_log_term(2), Some(2));
        assert_eq!(node.get_log_term(3), None);
    }

    #[test]
    fn test_last_log_index_and_term() {
        let mut node = Node::new(0, 3);

        // Initially empty
        assert_eq!(node.last_log_index(), 0);
        assert_eq!(node.last_log_term(), 0);

        // Add entries
        node.persistent_state
            .log
            .push(LogEntry::new(1, "cmd1".to_string()));
        assert_eq!(node.last_log_index(), 1);
        assert_eq!(node.last_log_term(), 1);

        node.persistent_state
            .log
            .push(LogEntry::new(3, "cmd2".to_string()));
        assert_eq!(node.last_log_index(), 2);
        assert_eq!(node.last_log_term(), 3);
    }

    #[test]
    fn test_election_timeout() {
        let mut node = Node::new(0, 3);

        // Should not timeout immediately
        assert!(!node.is_election_timeout());

        // Force a very short timeout
        node.election_timeout_duration = std::time::Duration::from_millis(1);
        node.election_timeout = std::time::Instant::now() + node.election_timeout_duration;

        // Wait a bit
        std::thread::sleep(std::time::Duration::from_millis(5));
        assert!(node.is_election_timeout());

        // Reset should clear timeout
        node.reset_election_timer();
        assert!(!node.is_election_timeout());
    }

    #[test]
    fn test_heartbeat_timing() {
        let mut node = Node::new(0, 3);

        // Follower should not send heartbeats
        assert!(!node.should_send_heartbeat());

        // Simulate becoming leader (proper initialization)
        node.become_leader();

        // Should not need heartbeat immediately
        assert!(!node.should_send_heartbeat());

        // Force heartbeat interval to pass (heartbeat_interval is 200ms)
        node.last_heartbeat_time =
            std::time::Instant::now() - std::time::Duration::from_millis(250);
        assert!(node.should_send_heartbeat());
    }

    #[test]
    fn test_client_submit_as_follower() {
        let mut node = Node::new(0, 3);
        assert_eq!(node.state, NodeState::Follower);

        // Follower should reject client commands
        let result = node.client_submit("test command".to_string());
        assert!(result.is_none());

        // Log should still be empty
        assert_eq!(node.last_log_index(), 0);
    }

    #[test]
    fn test_client_submit_as_leader() {
        let mut node = Node::new(0, 3);
        node.state = NodeState::Leader;
        node.leader_state = Some(LeaderVolatileState::new(3, 0));

        // Leader should create pending proposal
        let result = node.client_submit("test command".to_string());
        assert_eq!(result, Some(1)); // Should return proposed index 1

        // Log should still be empty (proposal not yet committed)
        assert_eq!(node.last_log_index(), 0);

        // Should have pending proposal
        let leader_state = node.leader_state.as_ref().unwrap();
        assert_eq!(leader_state.pending_proposals.len(), 1);
        assert!(leader_state.pending_proposals.contains_key(&1));
    }

    #[test]
    fn test_commit_proposal() {
        let mut node = Node::new(0, 3);
        node.state = NodeState::Leader;
        node.leader_state = Some(LeaderVolatileState::new(3, 0));
        node.persistent_state.current_term = 1;

        // Create a proposal first
        let proposed_index = node.client_submit("test command".to_string()).unwrap();

        // Commit the proposal
        let committed = node.commit_proposal(proposed_index);
        assert!(committed);

        // Now log should have the entry
        assert_eq!(node.last_log_index(), 1);
        assert_eq!(node.persistent_state.log[0].command, "test command");
        assert_eq!(node.persistent_state.log[0].term, 1);

        // Pending proposal should be removed
        let leader_state = node.leader_state.as_ref().unwrap();
        assert!(leader_state.pending_proposals.is_empty());
    }
}

#[cfg(test)]
mod rpc_tests {
    use super::super::core::{LogEntry, NodeId};
    use super::super::rpc::*;

    #[test]
    fn test_append_entries_request_creation() {
        let request = AppendEntriesRequest::new(1, 0, 0, 0, 0);
        assert_eq!(request.term, 1);
        assert_eq!(request.leader_id, 0);
        assert_eq!(request.prev_log_index, 0);
        assert_eq!(request.prev_log_term, 0);
        assert!(request.entries.is_empty());
        assert_eq!(request.leader_commit, 0);
    }

    #[test]
    fn test_request_vote_request_creation() {
        let request = RequestVoteRequest::new(2, 1, 5, 1);
        assert_eq!(request.term, 2);
        assert_eq!(request.candidate_id, 1);
        assert_eq!(request.last_log_index, 5);
        assert_eq!(request.last_log_term, 1);
    }

    #[test]
    fn test_rpc_message_append_entries_request() {
        let request = AppendEntriesRequest::new(1, 0, 0, 0, 0);
        let message = RpcMessage::append_entries_request(0, 1, request.clone());

        assert_eq!(message.from(), 0);
        assert_eq!(message.to(), 1);
        assert_eq!(message.message_type(), "AppendEntriesRequest");

        if let RpcMessage::AppendEntriesRequest {
            from,
            to,
            request: inner_request,
        } = message
        {
            assert_eq!(from, 0);
            assert_eq!(to, 1);
            assert_eq!(inner_request, request);
        } else {
            panic!("Expected AppendEntriesRequest variant");
        }
    }

    #[test]
    fn test_rpc_message_client_command() {
        let command = "test command".to_string();
        let message = RpcMessage::client_command(99, 0, command.clone());

        assert_eq!(message.from(), 99);
        assert_eq!(message.to(), 0);
        assert_eq!(message.message_type(), "ClientCommand");

        if let RpcMessage::ClientCommand {
            from,
            to,
            command: inner_command,
        } = message
        {
            assert_eq!(from, 99);
            assert_eq!(to, 0);
            assert_eq!(inner_command, command);
        } else {
            panic!("Expected ClientCommand variant");
        }
    }
}

#[cfg(test)]
mod algorithm_tests {
    use super::super::core::*;
    use super::super::rpc::*;

    #[test]
    fn test_handle_append_entries_basic() {
        let mut node = Node::new(1, 3);

        let request = AppendEntriesRequest::new(1, 0, 0, 0, 0);
        let response = node.handle_append_entries(&request);

        assert!(response.success);
        assert_eq!(response.term, 1);
        assert_eq!(node.persistent_state.current_term, 1);
        assert_eq!(node.state, NodeState::Follower);
    }

    #[test]
    fn test_handle_request_vote_basic() {
        let mut node = Node::new(1, 3);

        let request = RequestVoteRequest::new(1, 0, 0, 0);
        let response = node.handle_request_vote(&request);

        assert!(response.vote_granted);
        assert_eq!(response.term, 1);
        assert_eq!(node.persistent_state.voted_for, Some(0));
        assert_eq!(node.persistent_state.current_term, 1);
    }

    #[test]
    fn test_become_candidate() {
        let mut node = Node::new(1, 3);
        let initial_term = node.persistent_state.current_term;

        node.become_candidate();

        assert_eq!(node.state, NodeState::Candidate);
        assert_eq!(node.persistent_state.current_term, initial_term + 1);
        assert_eq!(node.persistent_state.voted_for, Some(1));
        assert_eq!(node.votes_received, 1);
    }

    #[test]
    fn test_become_leader() {
        let mut node = Node::new(1, 3);

        node.become_leader();

        assert_eq!(node.state, NodeState::Leader);
        assert!(node.leader_state.is_some());
        assert_eq!(node.votes_received, 0);

        let leader_state = node.leader_state.as_ref().unwrap();
        assert_eq!(leader_state.next_index.len(), 3);
        assert_eq!(leader_state.match_index.len(), 3);
    }

    #[test]
    fn test_client_submit() {
        let mut node = Node::new(1, 3);

        // Follower can't accept commands
        assert_eq!(node.client_submit("cmd1".to_string()), None);

        // Leader can accept commands as proposals (not immediately in log)
        node.become_leader();
        let proposed_index = node.client_submit("cmd1".to_string());
        assert_eq!(proposed_index, Some(1));

        // With new consensus implementation, log should be empty until proposal is committed
        assert_eq!(node.persistent_state.log.len(), 0);

        // Should have pending proposal
        let leader_state = node.leader_state.as_ref().unwrap();
        assert_eq!(leader_state.pending_proposals.len(), 1);
        assert!(leader_state.pending_proposals.contains_key(&1));

        // Manually commit the proposal to test commit behavior
        node.commit_proposal(1);
        assert_eq!(node.persistent_state.log.len(), 1);
        assert_eq!(node.persistent_state.log[0].command, "cmd1");
        assert_eq!(
            node.persistent_state.log[0].term,
            node.persistent_state.current_term
        );
    }
}

#[cfg(test)]
mod simulation_tests {
    use super::super::rpc::*;
    use super::super::simulation::*;
    use tokio::time::Duration;

    #[test]
    fn test_cluster_channels_creation() {
        let (channels, receivers) = ClusterChannels::new(3);

        assert_eq!(channels.size(), 3);
        assert_eq!(channels.senders.len(), 3);
        assert_eq!(receivers.len(), 3);

        // Check that all node IDs are present
        let node_ids = channels.all_node_ids();
        assert_eq!(node_ids, vec![0, 1, 2]);

        // Test that we have senders for all nodes
        assert!(channels.senders.contains_key(&0));
        assert!(channels.senders.contains_key(&1));
        assert!(channels.senders.contains_key(&2));
    }

    #[tokio::test]
    async fn test_spawn_cluster() {
        let cluster_size = 3;
        let (cluster_channels, _event_broadcaster, join_handles) =
            spawn_cluster(cluster_size).await;

        // Verify cluster setup
        assert_eq!(cluster_channels.size(), cluster_size);
        assert_eq!(join_handles.len(), cluster_size);

        // Clean up - abort all tasks
        for handle in join_handles {
            handle.abort();
        }
    }
}
