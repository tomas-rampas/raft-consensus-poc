# Raft Consensus Algorithm - Web Visualization

**✨ Complete Election Process Visualization Now Available! ✨**

This web-based visualization provides a real-time, interactive dashboard for observing the Raft consensus algorithm in action, featuring **breakthrough election negotiation visibility** that shows the complete democratic process previously hidden during leader elections.

## 🎯 Overview

The web dashboard demonstrates **all three core Raft communication types**:

### 🗳️ **Election Process (NEWLY ENHANCED!)**
- **Complete Candidate Journey**: Watch nodes become candidates and request votes in real-time
- **Vote Negotiations**: See every vote request and response flowing between nodes
- **Democratic Process**: No more "invisible seconds" during leader elections
- **Manual Election Triggers**: Test election scenarios with interactive button controls

### 📝 **Proposal Process**  
- **Client Command Submission**: Submit commands through the web interface
- **Consensus Tracking**: Watch commands flow from proposal to commitment
- **Log Replication**: Observe how commands are replicated across the cluster

### ❤️ **Heartbeat Process**
- **Leader Authority**: See leaders maintaining authority through periodic heartbeats  
- **Timeout Detection**: Watch followers detect leader failures
- **Real-time Statistics**: Track message counts, elections, and cluster health

## Quick Start

### Prerequisites

- Rust (with Cargo) installed on your system
- Modern web browser (Chrome, Firefox, Safari, or Edge)

### 1. Start the Backend (Raft Cluster)

From the project root directory:

```bash
# Build and run the Raft cluster simulation
cargo run
```

This starts:
- **Raft Cluster**: 5-node in-memory simulation on various internal channels
- **WebSocket Server**: Real-time event streaming on `ws://127.0.0.1:8082`
- **HTTP Server**: Static file serving on `http://127.0.0.1:8081`

You should see output like:
```
🎆 Creating cluster with 5 nodes
🚀 Spawning node 0
🚀 Spawning node 1
...
🌐 WebSocket server listening on 127.0.0.1:8082
🌐 HTTP server serving web files on 127.0.0.1:8081
```

### 2. Open the Web Dashboard

Open your browser and navigate to:
```
http://127.0.0.1:8081
```

The dashboard will automatically connect to the backend via WebSocket and start displaying real-time cluster activity.

## 🎛️ Dashboard Components

### 🖼️ **Cluster Visualization (Main Canvas)**
- **5-Node Live Cluster Display**: Real-time canvas-based visualization
- **Node State Indicators**: 
  - 👥 **Followers** (blue): Following current leader
  - 🗳️ **Candidates** (yellow): Requesting votes during elections  
  - 👑 **Leaders** (green): Managing cluster and handling requests
- **Complete Message Flow Animations**:
  - 💙 **Heartbeat Messages**: Leader maintaining authority
  - 🗳️ **Election Messages**: Vote requests and responses (NEW!)
  - 📝 **Proposal Messages**: Command replication and consensus
- **Enhanced Visual Feedback**: Different colors and speeds for different message types

### 🎮 **Interactive Controls**
- **Command Submission**: Test proposal consensus with custom commands
- **Manual Election Trigger**: Force leader elections with one click (NEW!)
- **Communication Type Filters**: 
  - Show/hide Elections (NEW!)
  - Show/hide Proposals  
  - Show/hide Heartbeats
- **Visualization Controls**: Pause/Resume, Clear animations

### 📊 **Real-Time Statistics Dashboard**
**Three Core Communication Types** (NEW: Clean 3-Type Model):

- **🗳️ Elections**: Count of election processes and vote negotiations
- **📝 Proposals**: Client commands and consensus achievements  
- **❤️ Heartbeats**: Leader maintenance messages
- **Current Cluster State**: Term, Leader, Active Nodes

### 🏛️ **Cluster Information Panel**
**Enhanced Node Details** with real-time state tracking:

- **Node Cards**: Individual cards for each of the 5 cluster nodes
- **Live State Display**: Current role (👥 Follower/🗳️ Candidate/👑 Leader) 
- **Term Tracking**: Current consensus term for each node
- **Real-time Updates**: Automatic updates during elections and state changes
- **Visual Indicators**: Color-coded states matching the main visualization

## 🎯 How to Use the Dashboard

### 🗳️ **NEW: Complete Election Visualization**
1. **Trigger Manual Election**: Click the "Trigger Election" button
2. **Watch Leader Step Down**: Current leader becomes a follower
3. **See Candidate Emergence**: A follower becomes a candidate (turns yellow)  
4. **Observe Vote Requests**: Watch vote request messages flow to all nodes
5. **Track Vote Responses**: See individual vote granted/denied responses
6. **Witness Democratic Victory**: Watch candidate become leader with majority votes
7. **Confirm New Leadership**: New leader starts sending heartbeats

**Key Innovation**: No more "invisible seconds" - every step of the election is now visible!

### 📝 **Proposal Process Testing**
1. **Submit Command**: Enter text in "Submit Proposal Command" field
2. **Watch Proposal Flow**: See command flow from client to leader
3. **Observe Consensus**: Watch leader broadcast to followers for consensus
4. **Track Acknowledgments**: See follower responses coming back to leader
5. **Confirm Commitment**: Successful consensus updates statistics

### ❤️ **Heartbeat Monitoring**
1. **Observe Regular Heartbeats**: See blue messages flowing from leader
2. **Monitor Leader Health**: Consistent heartbeats indicate healthy leadership
3. **Detect Leadership Changes**: Heartbeat pattern changes when leaders change

### 🎛️ **Interactive Controls**
- **Communication Type Toggles**: Filter visualization by message type
- **Pause/Resume**: Stop animation to examine specific moments
- **Clear Statistics**: Reset counters for focused testing

## 🎓 Understanding Raft Through Enhanced Visualization

### 🗳️ **Complete Democratic Election Process** (NEWLY VISIBLE!)
1. **Election Trigger**: Leader failure or manual trigger → followers detect timeout
2. **Candidate Emergence**: Follower becomes candidate (👥 → 🗳️) and increments term
3. **Vote Request Broadcast**: Candidate sends VoteRequested events to all nodes
4. **Democratic Voting**: Each node responds with VoteGranted/VoteDenied based on algorithm rules
5. **Majority Consensus**: Candidate wins with majority votes (3/5 in our 5-node cluster)
6. **Leadership Transition**: Winner becomes leader (🗳️ → 👑) and starts heartbeats
7. **Cluster Stabilization**: All nodes acknowledge new leader and resume normal operation

**Educational Value**: Watch democracy in action! See how distributed systems achieve consensus through voting.

### 📝 **Proposal Consensus Process**
1. **Command Submission**: Client submits command through web interface
2. **Leader Processing**: Only leader accepts commands (others reject and forward)
3. **Proposal Broadcasting**: Leader creates proposal and requests consensus from followers
4. **Follower Acknowledgments**: Followers validate and respond with ACK/NACK
5. **Majority Consensus**: Leader commits when majority of followers acknowledge
6. **Replication Completion**: Command is officially committed to distributed log

### ❤️ **Continuous Leadership Maintenance**
1. **Regular Heartbeats**: Leader sends periodic HeartbeatSent events (every 50ms)
2. **Authority Confirmation**: Followers reset election timers upon receiving heartbeats
3. **Failure Detection**: Missing heartbeats trigger election timeout in followers
4. **Automatic Recovery**: System automatically elects new leader when current leader fails

## 🏗️ Technical Architecture

### 🦀 **Backend (Rust) - Enhanced Event System**
- **Complete Raft Implementation**: Full consensus algorithm with all three communication types
- **Breakthrough Event Coverage**: Now captures **ALL** election negotiations (NEW!)
  - `ElectionStarted`, `VoteRequested`, `VoteGranted`, `VoteDenied` events
- **Async Simulation**: Tokio-based concurrent 5-node cluster with realistic timeouts
- **Real-time Event Broadcasting**: <1ms latency event streaming via broadcast channels
- **Dual Server Architecture**: 
  - **WebSocket Server** (`ws://127.0.0.1:8082`): Real-time event streaming
  - **HTTP Server** (`http://127.0.0.1:8081`): Static file serving

### 🌐 **Frontend (Vanilla JavaScript) - Clean 3-Type Architecture**
- **High-Performance Canvas**: 60fps rendering with message animations
- **Smart Message Classification**: Three-type system (Election, Proposal, Heartbeat)
- **Real-time WebSocket Client**: Auto-reconnection with cluster state synchronization  
- **Event-Driven UI**: Real-time updates for all node states and statistics
- **Responsive Design**: CSS Grid layout optimized for various screen sizes
- **Zero Dependencies**: Pure HTML/CSS/JavaScript - no frameworks needed

### 📡 **Enhanced Communication Protocol**
**Complete Event Coverage** (25+ event types now supported):

**🗳️ Election Events** (NEW!):
- `ElectionTimeout`, `ElectionStarted`, `VoteRequested`, `VoteGranted`, `VoteDenied`, `LeaderElected`, `StateChange`

**📝 Proposal Events**: 
- `ClientCommandReceived`, `LogEntryProposed`, `ConsensusAckReceived`, `ReplicationCompleted`

**❤️ Heartbeat Events**:
- `HeartbeatSent`, `HeartbeatReceived`

**🔄 Bidirectional Communication**: 
- **Backend → Frontend**: Live event streaming
- **Frontend → Backend**: Command submission, manual election triggers, cluster queries

## Troubleshooting

### Dashboard Won't Load
- Ensure backend is running: `cargo run`
- Check HTTP server is on port 8081
- Verify no firewall blocking connections

### No Real-time Updates
- Check WebSocket connection status (top of dashboard)
- Ensure WebSocket server is on port 8082
- Try refreshing the browser page

### Commands Not Working
- Ensure cluster has elected a leader (green node)
- Check browser console for error messages
- Verify WebSocket connection is established

### Performance Issues
- Reduce message animations by toggling "Show Heartbeats" off
- Use "Clear" button to remove accumulated animations
- Check browser console for performance warnings

## Development

### File Structure
```
web/
├── README.md                    # This comprehensive documentation
├── index.html                   # Clean, responsive HTML dashboard
├── clean-styles.css            # Responsive CSS Grid/Flexbox styling
├── clean-app.js                # Main application controller with 3-type model
├── websocket-manager.js        # WebSocket client with auto-reconnection
├── raft-visualization-v2.js    # Canvas visualization with election animations
└── raft-message-classifier.js  # Clean 3-type message classification
```

### Customization
- **Election Animation Colors**: Edit constants in `raft-visualization-v2.js`
- **Layout Adjustments**: Update CSS Grid properties in `clean-styles.css`  
- **Event Handling**: Extend 3-type classification in `raft-message-classifier.js`
- **Performance Tuning**: Adjust animation speeds and timing parameters

## 🎓 Educational Value

### **Breakthrough Learning Experience**
This visualization provides unprecedented insight into distributed consensus:

### **🗳️ Democratic Process Understanding** (NEW!)
- **Visual Democracy**: Watch how distributed systems achieve consensus through voting
- **Election Transparency**: See every vote request, response, and majority decision
- **Failure Recovery**: Observe automatic leadership transitions during failures
- **Interactive Testing**: Trigger elections manually to understand the process

### **📝 Consensus Mechanics**
- **Proposal Lifecycle**: Follow commands from submission to commitment
- **Majority Requirements**: Understand why consensus needs majority agreement  
- **Consistency Guarantees**: See how Raft ensures all nodes agree on the same log

### **❤️ System Reliability**
- **Continuous Monitoring**: Watch how leaders maintain cluster health
- **Failure Detection**: Understand timeout-based failure detection
- **Automatic Recovery**: See how systems self-heal after failures

**Perfect for**: Students, researchers, distributed systems engineers, and anyone learning consensus algorithms through **complete visual demonstration** of the Raft protocol - now including the previously invisible democratic election process!