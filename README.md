# Raft Consensus Algorithm - Proof of Concept

A comprehensive implementation of the Raft consensus algorithm in Rust, featuring real-time logging, interactive CLI, and extensive testing. This project demonstrates the core mechanics of distributed consensus without disk persistence or real networking.

## 🎯 Project Overview

This implementation showcases the Raft consensus protocol through:
- **Leader Election**: Automated leader selection with randomized timeouts
- **Log Replication**: Consistent command distribution across cluster nodes  
- **Interactive Simulation**: Real-time cluster observation with emoji-enhanced logging
- **Comprehensive Testing**: 26 tests covering unit and integration scenarios

## 🚀 Quick Start

```bash
# Clone and build
git clone <repository-url>
cd raft-poc
cargo build --workspace

# Run the interactive cluster
cargo run

# Run tests
cargo test --workspace
```

## 🏗️ Architecture

### Core Components

```
src/
├── main.rs                    # Interactive CLI and cluster coordination
├── raft.rs                    # Module coordinator with re-exports  
└── raft/
    ├── core.rs               # Data structures (Node, LogEntry, NodeState)
    ├── algorithm.rs          # Raft algorithm implementation
    ├── rpc.rs               # Inter-node communication messages
    ├── simulation.rs        # Async cluster simulation infrastructure
    ├── tests.rs             # Unit tests (20 tests)
    └── integration_tests.rs # Integration tests (6 tests)
```

### Key Data Structures

```rust
pub enum NodeState {
    Follower,   // Following a leader, responding to RPCs
    Candidate,  // Seeking election to become leader  
    Leader,     // Handling client requests, replicating log
}

pub struct Node {
    pub id: NodeId,
    pub state: NodeState,
    pub persistent_state: PersistentState,  // Term, vote, log
    pub volatile_state: VolatileState,      // Commit/apply indices
    pub leader_state: Option<LeaderVolatileState>, // Leader-only state
    // ... timing and cluster management fields
}
```

## 🗳️ The Raft Consensus Protocol

### 1. Leader Election Process

Raft uses **randomized election timeouts** to ensure robust leader selection:

#### Initial Cluster Startup
```bash
# All nodes start as Followers with random timeouts (150-300ms)
INFO raft_poc::raft::simulation: 🟢 Node 0 started as Follower node_id=0
INFO raft_poc::raft::simulation: 🟢 Node 1 started as Follower node_id=1  
INFO raft_poc::raft::simulation: 🟢 Node 2 started as Follower node_id=2

# First timeout triggers election (Node 2 times out first)
WARN raft_poc::raft::simulation: ⏰ Election timeout! Current state: Follower, term: 0 node_id=2
INFO raft_poc::raft::algorithm: 🗳️  Starting election for term 1 node_id=2
INFO raft_poc::raft::algorithm: 🎯 Became candidate for term 1, voted for self (1/2 votes) node_id=2
```

#### Vote Collection
```bash
# Other nodes grant votes to the candidate
INFO raft_poc::raft::algorithm: ✅ Vote granted! Now have 2/2 votes for term 1 node_id=2

# Candidate becomes leader with majority
INFO raft_poc::raft::algorithm: 👑 Became LEADER for term 1 with majority votes! node_id=2
INFO raft_poc::raft::algorithm: ❤️  Starting to send heartbeats to 2 followers node_id=2
```

#### Why Election Timeouts?

**Problem**: In a new cluster, no leader exists. Who should start the first election?

**Solution**: Election timeouts with randomization:

1. **All nodes start as Followers** waiting for a leader
2. **Random timeouts (150-300ms)** prevent simultaneous candidacy  
3. **First timeout triggers election** - usually only one node
4. **Majority vote required** for leadership
5. **Heartbeats prevent future timeouts** once leader is established

```rust
// Randomized timeout implementation
pub fn reset_election_timer(&mut self) {
    let mut rng = rand::thread_rng();
    let timeout_ms = rng.gen_range(150..=300);  // Prevents split votes
    self.election_timeout_duration = Duration::from_millis(timeout_ms);
    self.election_timeout = Instant::now() + self.election_timeout_duration;
}
```

### 2. Log Replication

Once a leader is established, it handles client commands and replicates them across the cluster:

#### Command Submission
```bash
# Client submits command via CLI
raft> submit "transfer $100 from Alice to Bob"
INFO raft_poc::main: 📤 Submitted command: 'transfer $100 from Alice to Bob'

# Leader accepts and logs the command
INFO raft_poc::raft::algorithm: 📝 Added command 'transfer $100 from Alice to Bob' to log at index 1 (term 1) node_id=2
INFO raft_poc::raft::simulation: ✅ Command 'transfer $100 from Alice to Bob' accepted at log index 1 node_id=2
```

#### Replication Process

The leader replicates log entries to followers through `AppendEntries` RPCs:

```rust
// Leader creates AppendEntries for each follower
pub fn create_append_entries_for_follower(&self, follower_id: NodeId) -> Option<AppendEntriesRequest> {
    let next_index = leader_state.next_index[follower_id];
    let prev_log_index = next_index.saturating_sub(1);
    let prev_log_term = self.get_log_term(prev_log_index).unwrap_or(0);
    
    // Send entries from next_index onwards
    let entries = if next_index <= self.last_log_index() {
        self.persistent_state.log[(next_index - 1) as usize..].to_vec()
    } else {
        Vec::new() // Heartbeat only
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
```

#### Log Consistency

Raft ensures log consistency through **log matching property**:

```bash
# Follower receives AppendEntries
TRACE raft_poc::raft::algorithm: Received AppendEntries from leader 2: term=1, prev_log_index=0, entries=1 node_id=0

# Consistency check passes
DEBUG raft_poc::raft::algorithm: Valid leader contact from 2, resetting election timer node_id=0

# Entry is appended to follower's log
INFO raft_poc::raft::algorithm: Log consistency check passed, appending 1 entries node_id=0
```

### 3. Commit Process

Commands are considered **committed** when replicated to a majority of nodes:

```rust
// Leader checks for majority replication
pub fn try_advance_commit_index(&mut self) {
    let majority = (self.cluster_size / 2) + 1;
    
    for index in (self.volatile_state.commit_index + 1)..=self.last_log_index() {
        let mut replication_count = 1; // Leader always has it
        
        for &match_index in &leader_state.match_index {
            if match_index >= index {
                replication_count += 1;
            }
        }
        
        // Commit if majority replicated and from current term
        if replication_count >= majority {
            if let Some(term) = self.get_log_term(index) {
                if term == self.persistent_state.current_term {
                    self.volatile_state.commit_index = index;
                }
            }
        }
    }
}
```

### 4. Failure Scenarios

#### Leader Failure
```bash
# Followers stop receiving heartbeats
WARN raft_poc::raft::simulation: ⏰ Election timeout! Current state: Follower, term: 1 node_id=0
INFO raft_poc::raft::algorithm: 🗳️  Starting election for term 2 node_id=0

# New leader elected
INFO raft_poc::raft::algorithm: 👑 Became LEADER for term 2 with majority votes! node_id=0
```

#### Split Vote Resolution
```bash
# In 4-node cluster, potential 2-2 split
INFO raft_poc::raft::algorithm: 🎯 Became candidate for term 3, voted for self (1/3 votes) node_id=1
INFO raft_poc::raft::algorithm: 🎯 Became candidate for term 3, voted for self (1/3 votes) node_id=3

# Random timeouts eventually resolve the split
WARN raft_poc::raft::simulation: ⏰ Election timeout! Current state: Candidate, term: 3 node_id=1
INFO raft_poc::raft::algorithm: 🗳️  Starting election for term 4 node_id=1
```

## ⏰ Election Timeout Deep Dive

### What is Election Timeout?

Election timeout is the **core failure detection mechanism** in Raft - a randomized timer that each node maintains to detect when there's no active leader.

```rust
// From src/raft/core.rs - Randomized timeout implementation
pub fn reset_election_timer(&mut self) {
    let mut rng = rand::thread_rng();
    let timeout_ms = rng.gen_range(150..=300);  // Random 150-300ms
    self.election_timeout_duration = Duration::from_millis(timeout_ms);
    self.election_timeout = Instant::now() + self.election_timeout_duration;
}

pub fn is_election_timeout(&self) -> bool {
    Instant::now() >= self.election_timeout  // Has timeout expired?
}
```

### Why Randomized Timeouts?

```bash
# Without randomization - BAD:
Node 0: timeout at 200ms → becomes candidate
Node 1: timeout at 200ms → becomes candidate  ← SIMULTANEOUS!
Node 2: timeout at 200ms → becomes candidate  ← SPLIT VOTE!

# With randomization (150-300ms) - GOOD:
Node 0: timeout at 187ms → becomes candidate, gets votes ✅
Node 1: timeout at 243ms → but N0 already leader, resets timer
Node 2: timeout at 291ms → but N0 already leader, resets timer
```

### Election Timeout Event Loop

The core event loop in `src/raft/simulation.rs` continuously monitors for election timeouts:

```rust
pub async fn run_node(/* ... */) {
    loop {
        // Calculate timeout based on node state
        let timeout_duration = if matches!(node.state, NodeState::Leader) {
            Duration::from_millis(50)  // Leaders check every 50ms for heartbeats
        } else {
            // Followers/Candidates: remaining election timeout (min 1ms)
            let remaining = node.election_timeout.duration_since(std::time::Instant::now());
            remaining.max(Duration::from_millis(1))
        };

        // Wait for message OR timeout
        match timeout(timeout_duration, receiver.recv()).await {
            Ok(Some(message)) => { /* Handle incoming message */ }
            Ok(None) => break, // Channel closed
            Err(_) => {
                // TIMEOUT OCCURRED - Check for election timeout!
                handle_timeout(&mut node, &cluster_channels).await;
            }
        }
    }
}
```

### All Scenarios Triggering Election Timeout

#### 1. 🚀 **Cluster Startup** (Most Common)
```bash
# All nodes start as followers, no leader exists
INFO: 🟢 Node 0 started as Follower node_id=0
INFO: 🟢 Node 1 started as Follower node_id=1  
INFO: 🟢 Node 2 started as Follower node_id=2

# First node to timeout starts election (random timing)
WARN: ⏰ Election timeout! Current state: Follower, term: 0 node_id=1
INFO: 🗳️  Starting election for term 1 node_id=1

# Frequency: Once per cluster startup (~150-300ms after start)
```

#### 2. 💥 **Leader Failure/Crash**
```bash
# Leader was sending heartbeats normally
INFO: ❤️ Sending heartbeats to 4 followers node_id=2

# Leader crashes/becomes unreachable
💥 Node 2 crashes or network isolates it

# Followers stop receiving heartbeats, timeout after 150-300ms
WARN: ⏰ Election timeout! Current state: Follower, term: 3 node_id=0
INFO: 🗳️  Starting election for term 4 node_id=0

# Frequency: Within 150-300ms of leader becoming unreachable
```

#### 3. 🌐 **Network Partition**
```bash
# Minority partition loses contact with majority
[👥N0] [👥N1] ═══╬═══ [👑N2] [👥N3] [👥N4]

# Minority side nodes timeout waiting for leader
WARN: ⏰ Election timeout! Current state: Follower, term: 2 node_id=0
INFO: 🗳️  Starting election for term 3 node_id=0

# But can't get majority, so keeps timing out
WARN: ⏰ Election timeout! Current state: Candidate, term: 3 node_id=0
INFO: 🗳️  Starting election for term 4 node_id=0

# Frequency: Every 150-300ms until partition heals
```

#### 4. 🗳️ **Split Vote Scenarios**
```bash
# Multiple candidates start simultaneously (rare but possible)
INFO: 🗳️  Starting election for term 1 node_id=0
INFO: 🗳️  Starting election for term 1 node_id=2

# Neither gets majority, both return to follower
# Then timeout again with different randomized delays
WARN: ⏰ Election timeout! Current state: Follower, term: 1 node_id=1
INFO: 🗳️  Starting election for term 2 node_id=1

# Frequency: Multiple rounds until someone wins (usually resolves quickly)
```

#### 5. 📡 **High Network Latency**
```bash
# Leader's heartbeats are delayed beyond election timeout (>300ms)
# Followers assume leader is dead and start election
WARN: ⏰ Election timeout! Current state: Follower, term: 5 node_id=3
INFO: 🗳️  Starting election for term 6 node_id=3

# Old leader receives election message and steps down
INFO: Stepping down to Follower from Leader node_id=2

# Frequency: Whenever network delay > 150-300ms consistently
```

### Election Timeout Frequency Analysis

#### **Normal Operation:**
- 🟢 **Stable cluster**: Election timeout **never expires** (reset by heartbeats every 50ms)
- ❤️ **Heartbeat frequency**: Every 50ms from leader
- 🔄 **Timeout reset**: Every heartbeat received

#### **During Failures:**
```bash
# Timeline of election timeouts during leader failure:
T0: Leader crashes
T0+180ms: First follower times out, starts election
T0+200ms: Gets majority, becomes leader  
T0+250ms: Other followers would timeout, but receive heartbeats instead

# Result: ~1 election timeout per failure, resolved in ~200ms
```

#### **During Network Issues:**
```bash
# Partitioned minority side continuously retries:
T0: Partition occurs
T0+200ms: Timeout, election (fails - no majority)
T0+400ms: Timeout, election (fails - no majority)  
T0+600ms: Timeout, election (fails - no majority)
...continues every 150-300ms until partition heals

# Frequency: Continuous every 150-300ms until network heals
```

### Timeout Reset Conditions

Election timeouts are **reset** (preventing elections) when:

```rust
// 1. Receiving valid AppendEntries from current/higher term leader
if request.term >= self.persistent_state.current_term {
    self.reset_election_timer(); // Reset - leader is alive!
}

// 2. Granting a vote to a candidate  
if candidate_log_up_to_date {
    self.persistent_state.voted_for = Some(request.candidate_id);
    self.reset_election_timer(); // Reset when granting vote
}

// 3. Becoming a candidate yourself
pub fn become_candidate(&mut self) {
    // ... election logic ...
    self.reset_election_timer(); // Reset when starting election
}
```

### Observing Election Timeouts

#### **In Integration Tests:**
```bash
RUST_LOG=info cargo test test_leader_election_3_nodes

# Output shows election timeout triggering first election:
WARN: ⏰ Election timeout! Current state: Follower, term: 0 node_id=2
INFO: 🗳️  Starting election for term 1 node_id=2
INFO: ✅ Vote granted! Now have 2/2 votes for term 1 node_id=2  
INFO: 👑 Became LEADER for term 1 with majority votes! node_id=2
```

#### **In Interactive Mode:**
```bash
cargo run

# You'll see the initial election timeout during startup:
INFO: 🟢 Node 0 started as Follower node_id=0
# ... ~200ms later ...
WARN: ⏰ Election timeout! Current state: Follower, term: 0 node_id=3
INFO: 👑 Became LEADER for term 1 with majority votes! node_id=3
```

### Key Insights

**Election timeout is Raft's fundamental building block for:**
- 🚨 **Failure detection** - how nodes know the leader is gone
- ⚡ **Fast recovery** - new leader elected in ~200ms
- 🎲 **Split vote prevention** - randomization avoids simultaneous candidacy
- 🔄 **Automatic retry** - keeps trying until cluster has a leader
- 💪 **Fault tolerance** - works even during network partitions

**The genius of election timeout: it turns distributed consensus into a simple timing problem with randomization for conflict resolution!** ⏰🎯

## 🎮 Interactive Usage

### CLI Commands

Start the cluster and interact with it:

```bash
cargo run
```

```
=== Raft Cluster Interactive Console ===
Commands:
  submit <command>  - Submit a command to the cluster
  status           - Show cluster status  
  help             - Show this help message
  quit             - Shutdown cluster and exit
======================================

raft> submit "CREATE TABLE users"
📤 Submitted command: 'CREATE TABLE users'

raft> submit "INSERT INTO users VALUES (1, 'Alice')"  
📤 Submitted command: 'INSERT INTO users VALUES (1, 'Alice')'

raft> status
📊 Cluster Status:
   Nodes: 5
   Channel capacity: 5
   Use RUST_LOG=debug for detailed node states

raft> quit
⏹️  Shutting down cluster...
```

### Advanced Logging

Enable detailed logging to observe protocol internals:

```bash
# See all cluster activity
RUST_LOG=debug cargo run

# Focus on specific modules  
RUST_LOG=raft_poc::raft::algorithm=trace cargo run

# Integration test with logging
RUST_LOG=info cargo test test_leader_election_3_nodes
```

## 🧪 Testing

### Test Categories

**Unit Tests (20 tests)**:
```bash
cargo test raft::tests
```

- Core data structure validation
- RPC message creation and handling
- Algorithm logic verification
- Simulation infrastructure testing

**Integration Tests (6 tests)**:
```bash
cargo test raft::integration_tests
```

- Leader election in 3, 5-node clusters
- Split vote scenario (4-node cluster)
- Log replication and command submission
- Commit index advancement
- Normal cluster operation

### Sample Test Output

```bash
running 6 tests
INFO raft_poc::raft::integration_tests: 🧪 Starting leader election test with 3 nodes
INFO raft_poc::raft::simulation: 🎆 Creating cluster with 3 nodes
WARN raft_poc::raft::simulation: ⏰ Election timeout! Current state: Follower, term: 0 node_id=1
INFO raft_poc::raft::algorithm: 🗳️  Starting election for term 1 node_id=1
INFO raft_poc::raft::algorithm: ✅ Vote granted! Now have 2/2 votes for term 1 node_id=1
INFO raft_poc::raft::algorithm: 👑 Became LEADER for term 1 with majority votes! node_id=1
INFO raft_poc::raft::integration_tests: ✅ Leader election test completed
test raft::integration_tests::integration_tests::test_leader_election_3_nodes ... ok
```

## 🔬 Protocol Deep Dive

### Raft State Machine Diagram

```
                    🔄 RAFT NODE STATE TRANSITIONS 🔄

                              START
                                │
                                ▼
                        ┌───────────────┐
                        │   FOLLOWER    │◄─────────────────┐
                        │  👥 Following  │                  │
                        │   📨 Responds  │                  │
                        │   to RPCs     │                  │
                        └───────┬───────┘                  │
                                │                          │
                     ⏰ Election timeout                    │
                      (150-300ms random)                   │
                                │                          │
                                ▼                          │
                        ┌───────────────┐                  │
                        │   CANDIDATE   │                  │
                        │  🗳️  Seeking   │                  │
                        │    election   │                  │
                        │  📢 Requests   │                  │
                        │     votes     │                  │
                        └───────┬───────┘                  │
                                │                          │
                   ✅ Receive majority votes               │
                                │                          │
                                ▼                          │
                        ┌───────────────┐                  │
                        │    LEADER     │                  │
                        │  👑 Handles    │                  │
                        │   commands    │                  │
                        │  ❤️  Sends     │                  │
                        │  heartbeats   │                  │
                        └───────────────┘                  │
                                │                          │
                📨 Discover higher term                    │
                   OR network partition                     │
                                │                          │
                                └──────────────────────────┘

    🔄 State Transition Triggers:
    • Follower → Candidate: Election timeout expires
    • Candidate → Leader: Receive majority votes  
    • Candidate → Follower: Discover higher term
    • Leader → Follower: Discover higher term
    • Any → Follower: Receive AppendEntries with higher term
```

### Node Roles and Responsibilities

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         🎭 NODE ROLES & BEHAVIORS                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  👥 FOLLOWER STATE                                                      │
│  ├─ 📥 Responds to AppendEntries from leader                           │
│  ├─ 🗳️  Responds to RequestVote from candidates                        │
│  ├─ ⏰ Maintains election timeout (150-300ms)                          │
│  ├─ 🔄 Resets timeout on valid leader contact                         │
│  └─ ❌ Rejects client commands (not the leader)                       │
│                                                                         │
│  🗳️  CANDIDATE STATE                                                    │
│  ├─ 📈 Increments term and votes for self                             │
│  ├─ 📤 Sends RequestVote to all other nodes                           │
│  ├─ 🔢 Counts votes and checks for majority                           │
│  ├─ 👑 Becomes leader if majority achieved                            │
│  ├─ 👥 Returns to follower if higher term discovered                  │
│  └─ ⏰ Restarts election if timeout (split vote)                       │
│                                                                         │
│  👑 LEADER STATE                                                        │
│  ├─ ✅ Accepts client commands and appends to log                      │
│  ├─ 📤 Sends AppendEntries to all followers (heartbeats)              │
│  ├─ 🔁 Replicates log entries to followers                            │
│  ├─ 📊 Tracks follower progress (next_index, match_index)             │
│  ├─ ✅ Commits entries when majority replicated                        │
│  └─ 👥 Steps down if higher term discovered                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Cluster Operation Flow

```
                    🏛️  RAFT CLUSTER OPERATION FLOW 🏛️

    Time: T0        T1         T2         T3         T4         T5
     │              │          │          │          │          │
     ▼              ▼          ▼          ▼          ▼          ▼

┌─────────┐   ⏰ Timeout  🗳️ Election  ✅ Majority  👑 Leader   ❤️ Heartbeats
│ Node 0  │   Follower ──► Candidate ──► Leader ───► Leader ──► Leader
│         │      👥           🗳️          👑         👑          👑
└─────────┘

┌─────────┐   👥 Waiting   📥 Vote      👥 Follower 📥 Receives ❤️ Heartbeat
│ Node 1  │   Follower ──► Response ──► Follower ──► AppendEntries Response
│         │      👥        ✅ Grant       👥         📥          👥
└─────────┘

┌─────────┐   👥 Waiting   📥 Vote      👥 Follower 📥 Receives ❤️ Heartbeat  
│ Node 2  │   Follower ──► Response ──► Follower ──► AppendEntries Response
│         │      👥        ✅ Grant       👥         📥          👥
└─────────┘

    Messages:      RequestVote    AppendEntries    AppendEntries
    Flow:          N0 → N1,N2     N0 → N1,N2       N0 → N1,N2
                      ↖ Votes        ↖ Success        ↖ Success
```

### Client Command Processing

```
                    📝 CLIENT COMMAND PROCESSING FLOW 📝

Client                Leader (Node 0)         Follower (Node 1)    Follower (Node 2)
  │                        │                        │                    │
  │ submit "transfer $100" │                        │                    │
  ├─────────────────────► │                        │                    │
  │                        │ 📝 Append to log       │                    │
  │                        │    [1]: "transfer"     │                    │
  │                        │                        │                    │
  │                        │ AppendEntries(entry)   │                    │
  │                        ├──────────────────────► │ 📝 Append to log   │
  │                        │                        │    [1]: "transfer" │
  │                        │                        │                    │
  │                        │       AppendEntries(entry)                  │
  │                        ├─────────────────────────────────────────► │
  │                        │                        │                    │ 📝 Append to log
  │                        │                        │                    │    [1]: "transfer"
  │                        │                        │                    │
  │                        │ ◄──────── Success ──── │                    │
  │                        │                        │                    │
  │                        │ ◄──────────────────── Success ──────────── │
  │                        │                        │                    │
  │                        │ ✅ Majority achieved    │                    │
  │                        │    Commit index = 1    │                    │
  │                        │                        │                    │
  │ ✅ "Command committed" │                        │                    │
  │ ◄─────────────────────│                        │                    │
  │                        │                        │                    │
  │                        │ AppendEntries(commit=1)                     │
  │                        ├──────────────────────► │ ✅ Update commit   │
  │                        │                        │    index = 1      │
  │                        │                        │                    │
  │                        │       AppendEntries(commit=1)               │
  │                        ├─────────────────────────────────────────► │
  │                        │                        │                    │ ✅ Update commit
  │                        │                        │                    │    index = 1
```

### Failure Recovery Scenarios

```
                    🚨 FAILURE RECOVERY SCENARIOS 🚨

Scenario 1: Leader Failure
───────────────────────────
T0: [👑N0] [👥N1] [👥N2]  ◄─ N0 is leader
T1:  💥N0  [👥N1] [👥N2]  ◄─ N0 crashes
T2:  💥N0  [⏰N1] [👥N2]  ◄─ N1 election timeout
T3:  💥N0  [🗳️N1] [👥N2]  ◄─ N1 becomes candidate
T4:  💥N0  [👑N1] [👥N2]  ◄─ N1 elected new leader

Scenario 2: Network Partition
─────────────────────────────
Initial: [👑N0] [👥N1] [👥N2] [👥N3] [👥N4]  ◄─ 5-node cluster

Partition: [👑N0] [👥N1] ═══╬═══ [👥N2] [👥N3] [👥N4]
          Minority side           Majority side

Result:   [👥N0] [👥N1]         [👑N2] [👥N3] [👥N4]
          No leader              New leader elected
          (can't commit)         (continues operation)

Scenario 3: Split Vote Resolution
─────────────────────────────────
T0: [👥N0] [👥N1] [👥N2] [👥N3]    ◄─ 4-node cluster
T1: [🗳️N0] [🗳️N1] [👥N2] [👥N3]   ◄─ Simultaneous candidacy
T2: [🗳️N0] [🗳️N1] [👥N2] [👥N3]   ◄─ Split vote: N0(1), N1(1), N2(?), N3(?)
T3: [👥N0] [👥N1] [👥N2] [👥N3]    ◄─ Return to follower, wait for timeout
T4: [🗳️N2] [👥N1] [👥N2] [👥N3]   ◄─ N2 times out first (random delay)
T5: [👥N0] [👥N1] [👑N2] [👥N3]    ◄─ N2 elected leader
```

### RPC Message Types

```rust
pub enum RpcMessage {
    // Leader election
    RequestVoteRequest { from: NodeId, to: NodeId, request: RequestVoteRequest },
    RequestVoteResponse { from: NodeId, to: NodeId, response: RequestVoteResponse },
    
    // Log replication & heartbeats
    AppendEntriesRequest { from: NodeId, to: NodeId, request: AppendEntriesRequest },
    AppendEntriesResponse { from: NodeId, to: NodeId, response: AppendEntriesResponse },
    
    // Client interaction
    ClientCommand { from: NodeId, to: NodeId, command: String },
}
```

### Timing Parameters

```rust
// Election timeouts: randomized to prevent split votes
let timeout_ms = rng.gen_range(150..=300);

// Heartbeat interval: much smaller than election timeout
pub heartbeat_interval: Duration = Duration::from_millis(50);

// Leadership maintenance
if node.should_send_heartbeat() {
    send_heartbeats(node, cluster_channels).await;
}
```

## 🛡️ Safety Properties

Raft guarantees several critical safety properties:

### 1. **Election Safety**
- At most one leader can be elected in a given term
- Enforced by majority vote requirement

### 2. **Leader Append-Only** 
- Leaders never overwrite or delete entries in their log
- Only append new entries

### 3. **Log Matching**
- If two logs contain an entry with same index and term, then logs are identical in all entries up through the given index

### 4. **Leader Completeness**
- If a log entry is committed in a given term, then that entry will be present in the logs of the leaders for all higher-numbered terms

### 5. **State Machine Safety**
- If a server has applied a log entry at a given index to its state machine, no other server will ever apply a different log entry for the same index

## 📈 Performance Characteristics  

Current implementation performance (in-memory simulation):

- **Leader Election**: ~200ms average (randomized 150-300ms timeouts)
- **Command Replication**: ~50ms for 5-node cluster  
- **Heartbeat Interval**: 50ms (prevents unnecessary elections)
- **Test Suite**: 26 tests complete in ~8 seconds

## 🔄 Next Steps

The implementation is ready for **Phase 6: Real-time Visualization**:

- [ ] Event broadcasting system
- [ ] WebSocket server for real-time updates
- [ ] Web-based visualization dashboard
- [ ] Interactive cluster manipulation
- [ ] Timeline and statistics display

## 📚 References

- [Raft Paper](https://raft.github.io/raft.pdf) - "In Search of an Understandable Consensus Algorithm"
- [Raft Visualization](http://thesecretlivesofdata.com/raft/) - Interactive Raft explanation
- [Students' Guide to Raft](https://thesquareplanet.com/blog/students-guide-to-raft/) - Implementation guidance

## 🤝 Contributing

This is an educational proof-of-concept. The code prioritizes clarity and understanding over production optimization. Feel free to:

- Add more test scenarios
- Implement Phase 6 visualization
- Optimize performance characteristics  
- Add persistence layer simulation
- Enhance failure injection testing

---

**Built with ❤️ and 🗳️ for understanding distributed consensus**