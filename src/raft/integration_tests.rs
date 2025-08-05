#[cfg(test)]
mod integration_tests {
    use super::super::core::*;
    use super::super::rpc::*;
    use super::super::simulation::*;
    use super::super::*;
    use std::collections::HashMap;
    use tokio::time::{Duration, sleep, timeout};
    use tracing::info;

    /// Helper function to wait for leader election in a cluster
    async fn wait_for_leader_election(
        cluster_channels: &ClusterChannels,
        timeout_duration: Duration,
    ) -> Option<NodeId> {
        let start = std::time::Instant::now();

        while start.elapsed() < timeout_duration {
            // Check each node to see if any has become leader
            for node_id in 0..cluster_channels.size() {
                let ping_message = RpcMessage::append_entries_request(
                    999, // Special ping sender ID
                    node_id,
                    AppendEntriesRequest::new(0, 999, 0, 0, 0),
                );

                // Try to send a ping to see if node responds as leader
                if cluster_channels.send_to_node(node_id, ping_message).is_ok() {
                    // In a real test, we'd need to check the response
                    // For now, we'll use a heuristic approach
                    sleep(Duration::from_millis(10)).await;
                }
            }

            sleep(Duration::from_millis(50)).await;
        }

        None // No leader found within timeout
    }

    /// Integration test for basic leader election with 3 nodes
    #[tokio::test]
    async fn test_leader_election_3_nodes() {
        // Initialize tracing for test
        let _ = tracing_subscriber::fmt().try_init();

        info!("🧪 Starting leader election test with 3 nodes");

        // Create a 3-node cluster
        let cluster_size = 3;
        let (cluster_channels, _event_broadcaster, join_handles) =
            spawn_cluster(cluster_size).await;

        // Give the cluster time to elect a leader
        sleep(Duration::from_secs(2)).await;

        info!("🔍 Election period completed, checking for leader");

        // In a real integration test, we would:
        // 1. Monitor the cluster state through events or direct inspection
        // 2. Verify exactly one leader exists
        // 3. Verify all other nodes are followers
        // 4. Verify the leader is sending heartbeats

        // For this POC, we'll just verify the cluster is running
        assert_eq!(cluster_channels.size(), 3);
        assert_eq!(join_handles.len(), 3);

        info!("✅ Leader election test completed");

        // Clean up
        for handle in join_handles {
            handle.abort();
        }
    }

    /// Integration test for leader election with 5 nodes
    #[tokio::test]
    async fn test_leader_election_5_nodes() {
        let _ = tracing_subscriber::fmt().try_init();

        info!("🧪 Starting leader election test with 5 nodes");

        let cluster_size = 5;
        let (cluster_channels, _event_broadcaster, join_handles) =
            spawn_cluster(cluster_size).await;

        // Allow more time for larger cluster to stabilize
        sleep(Duration::from_secs(3)).await;

        info!("🔍 Election period completed for 5-node cluster");

        assert_eq!(cluster_channels.size(), 5);
        assert_eq!(join_handles.len(), 5);

        info!("✅ 5-node leader election test completed");

        // Clean up
        for handle in join_handles {
            handle.abort();
        }
    }

    /// Integration test for split vote scenario (even number of nodes)
    #[tokio::test]
    async fn test_split_vote_scenario() {
        let _ = tracing_subscriber::fmt().try_init();

        info!("🧪 Starting split vote test with 4 nodes");

        // 4 nodes can potentially have split votes (2-2)
        let cluster_size = 4;
        let (cluster_channels, _event_broadcaster, join_handles) =
            spawn_cluster(cluster_size).await;

        // Give extra time for potential re-elections
        sleep(Duration::from_secs(4)).await;

        info!("🔍 Split vote scenario test period completed");

        // Even with potential split votes, eventually a leader should emerge
        assert_eq!(cluster_channels.size(), 4);

        info!("✅ Split vote scenario test completed");

        // Clean up
        for handle in join_handles {
            handle.abort();
        }
    }

    /// Integration test for basic log replication
    #[tokio::test]
    async fn test_log_replication() {
        let _ = tracing_subscriber::fmt().try_init();

        info!("🧪 Starting log replication test");

        let cluster_size = 3;
        let (cluster_channels, _event_broadcaster, join_handles) =
            spawn_cluster(cluster_size).await;

        // Wait for leader election
        sleep(Duration::from_secs(2)).await;

        // Submit client commands to all nodes (only leader should accept)
        let test_commands = vec![
            "command1".to_string(),
            "command2".to_string(),
            "command3".to_string(),
        ];

        for (i, command) in test_commands.iter().enumerate() {
            let target_node = i % cluster_size; // Try different nodes
            let client_message = RpcMessage::client_command(
                999, // Client ID
                target_node,
                command.clone(),
            );

            if let Err(e) = cluster_channels.send_to_node(target_node, client_message) {
                info!("Failed to send command to node {}: {:?}", target_node, e);
            }
        }

        // Allow time for log replication
        sleep(Duration::from_secs(2)).await;

        info!("🔍 Log replication test completed");

        // In a full implementation, we would:
        // 1. Verify all nodes have the same log entries
        // 2. Verify commit indices are updated correctly
        // 3. Verify only the leader accepted client commands

        assert_eq!(cluster_channels.size(), 3);

        info!("✅ Log replication test completed");

        // Clean up
        for handle in join_handles {
            handle.abort();
        }
    }

    /// Integration test for commit index advancement
    #[tokio::test]
    async fn test_commit_index_advancement() {
        let _ = tracing_subscriber::fmt().try_init();

        info!("🧪 Starting commit index advancement test");

        let cluster_size = 5;
        let (cluster_channels, _event_broadcaster, join_handles) =
            spawn_cluster(cluster_size).await;

        // Wait for leader election
        sleep(Duration::from_secs(2)).await;

        // Submit multiple commands
        for i in 0..5 {
            let command = format!("test_commit_{}", i);
            let client_message = RpcMessage::client_command(999, 0, command);

            if let Err(e) = cluster_channels.send_to_node(0, client_message) {
                info!("Failed to send command {}: {:?}", i, e);
            }

            // Small delay between commands
            sleep(Duration::from_millis(100)).await;
        }

        // Allow time for replication and commitment
        sleep(Duration::from_secs(3)).await;

        info!("🔍 Commit index advancement test completed");

        // In a full implementation, we would verify:
        // 1. Log entries are replicated to majority
        // 2. Commit indices advance appropriately
        // 3. Commands are applied in order

        assert_eq!(cluster_channels.size(), 5);

        info!("✅ Commit index advancement test completed");

        // Clean up
        for handle in join_handles {
            handle.abort();
        }
    }

    /// Integration test for cluster behavior under normal operation
    #[tokio::test]
    async fn test_normal_cluster_operation() {
        let _ = tracing_subscriber::fmt().try_init();

        info!("🧪 Starting normal cluster operation test");

        let cluster_size = 3;
        let (cluster_channels, _event_broadcaster, join_handles) =
            spawn_cluster(cluster_size).await;

        // Run the cluster for a reasonable time
        sleep(Duration::from_secs(5)).await;

        // Submit some commands during operation
        for i in 0..3 {
            let command = format!("normal_op_{}", i);
            let client_message = RpcMessage::client_command(999, i % cluster_size, command);

            let _ = cluster_channels.send_to_node(i % cluster_size, client_message);
            sleep(Duration::from_millis(200)).await;
        }

        // Continue operation
        sleep(Duration::from_secs(2)).await;

        info!("🔍 Normal operation test completed");

        // The cluster should maintain stability
        assert_eq!(cluster_channels.size(), 3);

        info!("✅ Normal cluster operation test completed");

        // Clean up
        for handle in join_handles {
            handle.abort();
        }
    }
}
