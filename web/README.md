# Raft Consensus Algorithm - Web Visualization

This web-based visualization provides a real-time, interactive dashboard for observing the Raft consensus algorithm in action. The visualization shows cluster dynamics, message flows, leader elections, log replication, and more through an intuitive graphical interface.

## Overview

The web dashboard demonstrates key Raft consensus concepts:

- **Leader Election**: Watch nodes transition between Follower, Candidate, and Leader states
- **Heartbeat Messages**: See leaders maintaining authority through periodic heartbeats
- **Log Replication**: Observe how client commands are replicated across the cluster
- **Fault Tolerance**: Simulate leader failures and witness automatic recovery
- **Real-time Statistics**: Track message counts, elections, and cluster state changes

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

## Dashboard Components

### Cluster Visualization (Top Left - 75%)
- **Canvas-based real-time display** of the 5-node Raft cluster
- **Node States**: Visual indicators for Follower (blue), Candidate (yellow), Leader (green)
- **Message Animations**: Live message flows between nodes
  - Blue lines: Heartbeat messages from leader to followers
  - Red lines: Client commands from external clients
  - Green lines: Append entries for log replication
- **Interactive Controls**: Toggle heartbeat and message visibility

### Control Panel (Top Right - 25%)
Interactive controls for cluster management:

- **Command Submission**: Text input to send commands to the cluster
  - Type any command (e.g., `"hello"`, `"user_action_123"`, `"test_cmd"`)
  - Commands are sent to all nodes; only the leader accepts them
- **Cluster Controls**:
  - ⏸️ **Pause/Resume**: Freeze/unfreeze the visualization
  - 🧹 **Clear**: Clear message animations
  - 🔄 **Reset**: Reset statistics and timeline
  - 👑 **Change Leader**: Simulate leader failure to trigger new election

### Statistics Panel (Top Right - 25%)
Real-time metrics displayed in a 2x2 grid:

- **Total Messages**: Count of all messages processed
- **Leader Elections**: Number of leadership changes
- **Log Entries**: Successfully committed commands
- **Current Term**: Latest consensus term number

### Node Information (Bottom Left - 50%)
Detailed view of each node's current state:

- **Node ID and State**: Current role (Follower/Candidate/Leader)
- **Term**: Current consensus term
- **Log Size**: Number of entries in the node's log
- **Commit Index**: Last committed log entry
- **Votes**: Vote count during elections

### Event Timeline (Bottom Right - 50%)
Chronological log of cluster events:

- **Real-time Event Stream**: Live updates as events occur
- **Event Types**: State changes, elections, log entries, heartbeats
- **Filtering**: Toggle to show/hide heartbeat events
- **Auto-scroll**: Latest events appear at the top

## How to Use the Dashboard

### Basic Observation
1. **Watch Initial Leader Election**: When started, nodes elect their first leader
2. **Observe Heartbeats**: See periodic blue message flows from leader to followers
3. **Monitor Statistics**: Watch counters update in real-time

### Command Submission
1. **Enter Command**: Type any text in the "Submit Command" field
2. **Submit**: Click the 📝 button or press Enter
3. **Watch Animation**: Red line flows from left edge to target node
4. **Check Timeline**: Command appears in event log
5. **Verify Replication**: If accepted by leader, see log replication messages

### Leader Change Simulation
1. **Click "👑 Change Leader"**: Simulates current leader failure
2. **Watch Transition**: Leader becomes unresponsive for 2 seconds
3. **Observe Election**: Followers detect timeout and start new election
4. **See Recovery**: New leader elected and heartbeats resume

### Timeline Filtering
- **Toggle "Show Heartbeats"**: Filter out heartbeat noise to see important events
- **Clear Timeline**: Reset event history for focused observation

## Understanding Raft Through the Visualization

### Leader Election Process
1. **Timeout**: Follower doesn't receive heartbeat and becomes Candidate (yellow)
2. **Vote Requests**: Candidate sends vote requests to all other nodes
3. **Majority Vote**: If candidate receives majority, becomes Leader (green)
4. **Authority**: New leader starts sending heartbeats to establish authority

### Log Replication
1. **Client Command**: External command submitted (red animation)
2. **Leader Processing**: Leader accepts command and adds to its log
3. **Replication**: Leader sends AppendEntries to all followers
4. **Consensus**: Once majority acknowledges, entry is committed
5. **Statistics Update**: Log Entries counter increments

### Fault Tolerance
1. **Leader Failure**: Current leader stops sending heartbeats
2. **Detection**: Followers detect leader failure via election timeout
3. **Recovery**: New election automatically triggered
4. **Service Restoration**: New leader elected and normal operation resumes

## Technical Architecture

### Backend (Rust)
- **Raft Implementation**: Complete consensus algorithm with leader election, log replication, and heartbeats
- **Async Simulation**: Tokio-based concurrent node simulation with realistic timeouts
- **Event System**: Comprehensive event broadcasting for visualization
- **WebSocket Server**: Real-time event streaming using `tokio-tungstenite`
- **HTTP Server**: Static file serving using `warp`

### Frontend (Vanilla JavaScript)
- **Canvas Visualization**: High-performance 60fps rendering with HTML5 Canvas
- **Real-time Updates**: WebSocket client with automatic reconnection
- **Event Processing**: Comprehensive Raft event handling and state tracking
- **Responsive Design**: CSS Grid/Flexbox layout optimized for various screen sizes
- **No Dependencies**: Pure HTML/CSS/JavaScript implementation

### Communication Protocol
- **WebSocket Events**: JSON-formatted Raft events streamed in real-time
- **Event Types**: StateChange, LeaderElected, LogEntryAdded, HeartbeatSent, ClientCommandReceived
- **Bidirectional**: Client can send commands and receive live cluster updates

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
├── README.md           # This documentation
├── index.html          # Main HTML structure
├── styles.css          # All CSS styling
├── app.js             # Main application controller
├── dashboard.js       # UI components and statistics
├── visualization.js   # Canvas-based cluster visualization
└── websocket.js       # WebSocket client manager
```

### Customization
- **Modify Colors**: Edit color constants in `visualization.js`
- **Adjust Layout**: Update CSS Grid/Flexbox in `styles.css`
- **Add Features**: Extend event handling in `app.js`
- **Performance Tuning**: Adjust animation parameters in `visualization.js`

## Educational Value

This visualization helps understand:

- **Distributed Consensus**: How nodes agree on shared state
- **Leader-based Replication**: Single leader simplifies consistency
- **Fault Tolerance**: System continues despite individual node failures  
- **Network Partitions**: Effects of communication delays and failures
- **Performance Trade-offs**: Consistency vs. availability in distributed systems

Perfect for students, researchers, and practitioners learning distributed systems concepts through interactive, visual demonstration of the Raft consensus algorithm.