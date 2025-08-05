# Raft POC Development Plan in Rust

This document outlines a step-by-step plan to build a simplified, in-memory Raft consensus proof-of-concept. The goal is to understand the core mechanics of the algorithm without the complexity of disk persistence or a real network layer.

## Phase 1: The Foundations (Setting the Stage)

Before we can write any logic, we need to define the data structures that represent the state of a Raft node. This is our blueprint.

### Task 1.1: Define the Core Data Structures

* **Goal:** Create the Rust structs that will hold all the state for a single Raft node, as described in Figure 2 of the Raft paper.
* **Action:** In a new raft.rs file, define the following:
  * LogEntry: A struct to represent a single entry in the log. For this POC, it can just contain the term (a u64) and the command (a String).
  * NodeState: An enum to represent the node's current role: Follower, Candidate, or Leader.
  * PersistentState: A struct to hold the state that would normally be saved to disk.
    * current_term: u64: The latest term the server has seen.
    * voted_for: Option<NodeId>: The ID of the candidate that received this node's vote in the current term. NodeId can be a simple usize.
    * log: Vec<LogEntry>: The list of log entries.
  * VolatileState: A struct for state that is reset on startup.
    * commit_index: u64: Index of the highest log entry known to be committed.
    * last_applied: u64: Index of the highest log entry applied to the state machine.

### Task 1.2: Create the Main Node Struct

* **Goal:** Combine all the state into a single, unified Node struct.
* **Action:** In raft.rs, create the main Node struct. It will contain:
  * id: NodeId: The unique ID of this node.
  * state: NodeState: The current role of the node.
  * persistent_state: PersistentState: The node's persistent state.
  * volatile_state: VolatileState: The node's volatile state.
  * For the Leader, you will eventually add volatile leader-specific state here (next_index and match_index).

## Phase 2: The Follower & The Passage of Time

A Raft cluster starts with all nodes as Followers. The most important job of a Follower is to time out and start an election if it doesn't hear from a Leader.

### Task 2.1: Implement the Election Timer

* **Goal:** Make a Follower transition to a Candidate if it doesn't receive a heartbeat within a certain time.
* **Action:**
  1. In your Node struct, add a field for the election timeout, perhaps using std::time::Instant.
  2. When a node starts or becomes a Follower, reset this timer to a *randomized* duration (e.g., between 150ms and 300ms). This randomization is crucial to prevent split votes.
  3. Create a main loop for your node that constantly checks if the election timer has expired.

### Task 2.2: Implement the AppendEntries RPC Handler (Heartbeat only)

* **Goal:** Allow a Follower to receive heartbeats from a Leader, which resets its election timer.
* **Action:**
  1. Create a function on your Node like fn handle_append_entries(&mut self, term: u64, leader_id: NodeId).
  2. **Logic:** If the incoming term is greater than or equal to the node's current_term, it means the sender is a legitimate leader. The node should remain a Follower and, most importantly, **reset its election timer**.
  3. If the incoming term is *less than* the node's current_term, the "leader" is outdated. The Follower should reject the request.

## Phase 3: The Election & Becoming a Leader

This is the core of Raft's fault tolerance. When a Follower times out, it becomes a Candidate and tries to get elected.

### Task 3.1: Implement the RequestVote RPC Handler

* **Goal:** Allow a node to respond to a vote request from a Candidate.
* **Action:**
  1. Create a function fn handle_request_vote(&mut self, candidate_term: u64, candidate_id: NodeId) -> bool.
  2. **Logic:** The function should return true (granting the vote) only if:
     * The candidate_term is greater than the node's current_term.
     * OR the candidate_term is equal to the node's current_term AND the node has not already voted_for another candidate in this term.
  3. If a vote is granted, the node must update its current_term and voted_for fields and reset its election timer.

### Task 3.2: Implement the Candidate Logic

* **Goal:** When a node becomes a Candidate, it must start an election.
* **Action:**
  1. Create a function fn become_candidate(&mut self).
  2. **Logic:** Inside this function, the node must:
     * Change its state to Candidate.
     * Increment its current_term.
     * Vote for itself (voted_for = Some(self.id)).
     * Reset its election timer.
     * Send RequestVote RPCs to all other nodes in the cluster.

### Task 3.3: Tallying Votes

* **Goal:** A Candidate needs to track the votes it receives to see if it has won.
* **Action:**
  1. When a Candidate sends out RequestVote RPCs, it needs to collect the true or false responses.
  2. If the number of true responses constitutes a **majority** of the cluster (e.g., 2 out of 3, or 3 out of 5), the Candidate wins the election.
  3. Upon winning, it must transition to Leader.

## Phase 4: The Leader & Log Replication

The Leader's job is to accept commands from clients and replicate them to the Followers.

### Task 4.1: Implement the Leader Logic

* **Goal:** When a node becomes Leader, it must start acting like one.
* **Action:**
  1. Create a function fn become_leader(&mut self).
  2. **Logic:** The node must change its state to Leader. Immediately, it should start sending heartbeats (AppendEntries with no commands) to all Followers to assert its authority and prevent new elections.
  3. Initialize the leader-specific volatile state: next_index (the index of the next log entry to send to each follower) and match_index (the index of the highest log entry known to be replicated on each follower).

### Task 4.2: Implement Full AppendEntries

* **Goal:** Replicate a new command from a client to the Followers.
* **Action:**
  1. Create a method for the Leader to accept a new command (e.g., fn client_submit(&mut self, command: String)). The Leader appends this command to its own log.
  2. Enhance your handle_append_entries function to handle log entries, not just heartbeats. A Follower must reject an AppendEntries request if the term/index of the entry preceding the new ones doesn't match its own log.
  3. If it accepts, the Follower must append the new entries to its log.

### Task 4.3: Advancing the Commit Index

* **Goal:** The Leader must determine when a log entry is safely replicated on a majority of nodes.
* **Action:**
  1. After receiving a successful AppendEntries response from a Follower, the Leader updates the match_index for that Follower.
  2. The Leader then checks to see if there is a log index N that is greater than its current commit_index and has been replicated on a majority of servers (i.e., match_index for a majority of nodes is >= N).
  3. If so, the Leader updates its commit_index to N. This entry is now officially "committed."

## Phase 5: Simulation & Visualization

Now, let's put it all together and watch it run.

### Task 5.1: Create a Simulated Network

* **Goal:** Allow the nodes to send RPCs to each other without a real network.
* **Action:** In your main.rs, you can use tokio::sync::mpsc channels. Create a channel for each node. To send an RPC to Node 3, you just send a message on Node 3's channel.

### Task 5.2: Run the Cluster

* **Goal:** Launch multiple nodes and have them interact.
* **Action:** In main.rs, spawn a separate async task (tokio::spawn) for each node. Each task will run the node's main loop, checking its timer and processing incoming RPCs from its channel.

### Task 5.3: Add Lots of Logging!

* **Goal:** See what's happening inside the cluster.
* **Action:** Use the tracing crate or simple println! statements liberally. Log every state change, every RPC sent and received, every vote cast, and every log entry committed. This is the only way to debug what's happening.
  * Example: [Node 2][Term 3][Follower] Timer expired. Becoming Candidate.
  * Example: [Node 1][Term 4][Leader] Committing index 5.

## Phase 6: Real-time Visualization

To better understand the cluster dynamics, we'll add a web-based visualization system that shows real-time message flow and node states.

### Task 6.1: Event Emission System

* **Goal:** Make Rust nodes emit events that can be consumed by external systems.
* **Action:**
  1. Create an Event enum that captures all important cluster events:
     * StateChange(node_id, old_state, new_state)
     * MessageSent(from_node, to_node, message_type)
     * MessageReceived(node_id, from_node, message_type)
     * VoteGranted(voter_id, candidate_id, term)
     * LogAppended(node_id, index, term, command)
     * LogCommitted(node_id, index)
     * ElectionStarted(node_id, term)
     * LeaderElected(node_id, term)
  2. Add an event channel (tokio::sync::broadcast) that all nodes can write to.
  3. Instrument your code to emit events at key points.

### Task 6.2: WebSocket Server

* **Goal:** Expose cluster events via WebSocket for real-time consumption.
* **Action:**
  1. Add tokio-tungstenite or warp to your dependencies for WebSocket support.
  2. Create a WebSocket server that runs alongside your cluster.
  3. Subscribe to the event broadcast channel and forward events to all connected WebSocket clients.
  4. Serialize events as JSON for easy consumption by JavaScript.

### Task 6.3: Web Visualization Frontend

* **Goal:** Create an interactive web interface to visualize the cluster.
* **Action:**
  1. Create a simple HTML/CSS/JavaScript frontend (or use React/Vue if preferred).
  2. Connect to the WebSocket server.
  3. Create visual representations of:
     * Nodes as circles with their current state (color-coded: Follower=blue, Candidate=yellow, Leader=green)
     * Messages as animated arrows between nodes
     * Current term display for each node
     * Log entries as a list for each node
     * Commit index visualization
  4. Add controls to:
     * Pause/resume the cluster
     * Trigger client commands
     * Simulate node failures
     * Adjust message delays

### Task 6.4: Message Flow Animation

* **Goal:** Show messages traveling between nodes in real-time.
* **Action:**
  1. Use CSS animations or a library like D3.js to animate messages.
  2. Different message types should have different colors/styles:
     * RequestVote: Orange arrows
     * RequestVote Response: Orange dotted arrows
     * AppendEntries: Green arrows
     * AppendEntries Response: Green dotted arrows
  3. Show message content on hover.
  4. Display a message queue for each node.

### Task 6.5: Cluster State Dashboard

* **Goal:** Provide a comprehensive view of the cluster state.
* **Action:**
  1. Create a dashboard showing:
     * Current leader (if any)
     * Term history graph
     * Elections per minute
     * Messages per second
     * Log replication status across all nodes
     * Commit index progression
  2. Add a timeline view showing all events in chronological order.
  3. Allow filtering events by type or node.

## What's Next?

Once this in-memory POC with visualization is working, you'll have a deep understanding of Raft. The next steps to make it a real system would be:

* **Persistence:** Use std::fs to implement the Write-Ahead Log (Part 3) so state survives a restart.
* **Real Networking:** Replace the mpsc channels with a real networking library like tokio-serde or tonic (for gRPC).
* **State Machine:** Build a simple key-value store that "applies" the committed commands from the log.