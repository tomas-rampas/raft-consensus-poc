/**
 * Main Application Controller
 * Orchestrates WebSocket connection, visualization, and dashboard components
 */

class RaftApp {
    constructor() {
        this.wsManager = null;
        this.visualization = null;
        this.dashboard = null;
        this.isInitialized = false;
        
        // Application state
        this.isPaused = false;
        this.clusterSize = 5; // Default cluster size
        
        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }
    
    /**
     * Initialize the application
     */
    async initialize() {
        console.log('🚀 Initializing Raft Visualization App v3.0 - SYNTAX FIXED');
        
        // Add version indicator to page
        const header = document.querySelector('.header h1');
        if (header) {
            header.innerHTML += ' <small style="color: #666; font-size: 12px;">(v3.0 - Fixed)</small>';
        }
        
        try {
            // Initialize components
            await this.initializeComponents();
            
            // Set up event handlers
            this.setupEventHandlers();
            
            // Connect to WebSocket
            this.connectWebSocket();
            
            this.isInitialized = true;
            console.log('✅ App initialized successfully');
            
            // Make app accessible globally for debugging
            window.app = this;
            
            // Add debug functions
            window.clearMessageBacklog = () => {
                if (this.visualization) {
                    this.visualization.clearMessageBacklog();
                }
            };
            
        } catch (error) {
            console.error('❌ Failed to initialize app:', error);
            this.showError('Failed to initialize application: ' + error.message);
        }
    }
    
    /**
     * Initialize all components
     */
    async initializeComponents() {
        console.log('🔧 Initializing components...');
        
        // Initialize visualization
        console.log('🔧 Creating RaftVisualization...');
        console.log('🔍 RaftVisualization class available?', typeof RaftVisualization);
        console.log('🔍 Window.RaftVisualization available?', typeof window.RaftVisualization);
        
        try {
            this.visualization = new RaftVisualization('clusterCanvas');
            console.log('✅ Visualization initialized:', this.visualization);
        } catch (error) {
            console.error('❌ Failed to create visualization:', error);
            console.error('❌ Error details:', error.message, error.stack);
            throw error;
        }
        
        // Initialize dashboard
        this.dashboard = new RaftDashboard();
        console.log('✅ Dashboard initialized');
        
        // Initialize all 5 nodes for visualization
        this.initializeClusterNodes();
        
        // Wait a bit for components to settle
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    /**
     * Initialize all cluster nodes for visualization
     */
    initializeClusterNodes() {
        console.log('🔧 Initializing cluster nodes...');
        
        // Initialize all 5 nodes as followers initially
        // Don't assume any specific state - let real events update them
        for (let nodeId = 0; nodeId < 5; nodeId++) {
            this.visualization.updateNode(nodeId, {
                state: 'follower',
                term: 0,
                lastActivity: Date.now()
            });
            
            // Initialize minimal node data in dashboard
            this.dashboard.initializeNode(nodeId, {
                state: 'follower',
                term: 0
            });
        }
        
        console.log('✅ All 5 nodes initialized as followers');
    }
    
    /**
     * Set up application event handlers
     */
    setupEventHandlers() {
        console.log('📡 Setting up event handlers...');
        
        // Dashboard events
        document.addEventListener('dashboard_submitCommand', (e) => {
            this.handleCommandSubmit(e.detail);
        });
        
        document.addEventListener('dashboard_pause', () => {
            this.setPaused(true);
        });
        
        document.addEventListener('dashboard_resume', () => {
            this.setPaused(false);
        });
        
        document.addEventListener('dashboard_clearVisualization', () => {
            this.clearVisualization();
        });
        
        document.addEventListener('dashboard_reset', () => {
            this.reset();
        });
        
        document.addEventListener('dashboard_updateVisualizationSettings', (e) => {
            this.updateVisualizationSettings(e.detail);
        });
        
        document.addEventListener('dashboard_triggerLeaderChange', () => {
            this.triggerLeaderChange();
        });
        
        // Window events
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
        
        // Error handling
        window.addEventListener('error', (e) => {
            console.error('Global error:', e.error);
            this.showError('Application error: ' + e.error.message);
        });
        
        console.log('✅ Event handlers configured');
    }
    
    /**
     * Connect to WebSocket server
     */
    connectWebSocket() {
        console.log('🌐 Connecting to WebSocket...');
        
        try {
            this.wsManager = new WebSocketManager();
            console.log('✅ WebSocketManager created successfully');
        } catch (error) {
            console.error('❌ Failed to create WebSocketManager:', error);
            this.showError('Failed to create WebSocket connection: ' + error.message);
            return;
        }
        
        // WebSocket event handlers
        this.wsManager.on('connected', () => {
            console.log('✅ WebSocket connected');
            // Subscribe to events
            this.wsManager.subscribe();
            // Get initial status
            this.wsManager.getStatus();
            
            // SOLUTION: Request current cluster state after a brief delay
            // This allows us to capture any immediate events, then query for current state
            setTimeout(() => {
                console.log('🔄 Requesting current cluster state after connection...');
                this.requestCurrentClusterState();
            }, 1000); // Wait 1 second for any immediate events
        });
        
        this.wsManager.on('disconnected', () => {
            console.log('🔌 WebSocket disconnected');
        });
        
        this.wsManager.on('error', (error) => {
            console.error('❌ WebSocket error:', error);
            this.showError('WebSocket connection error');
        });
        
        this.wsManager.on('connection_failed', () => {
            console.error('❌ WebSocket connection failed');
            this.showError('Unable to connect to Raft cluster. Please ensure the server is running.');
        });
        
        // Handle incoming messages
        this.wsManager.on('message', (data) => {
            this.handleWebSocketMessage(data);
        });
        
        // Handle Raft events
        this.wsManager.on('raft_event', (event) => {
            this.handleRaftEvent(event);
        });
        
        // Handle specific event types
        this.wsManager.on('pong', (data) => {
            console.log('🏓 Pong received:', data);
        });
        
        this.wsManager.on('status', (data) => {
            console.log('📊 Cluster status:', data);
        });
        
        // Initialize last known leader tracking for clean event processing
        this.lastKnownLeader = null;
    }
    
    
    
    
    /**
     * Handle WebSocket message
     * @param {Object} data - Message data
     */
    handleWebSocketMessage(data) {
        console.log('📨 WebSocket message:', data);
        
        // AGGRESSIVE DEBUGGING: Log specific events we care about
        if (data.event_type && typeof data.event_type === 'object') {
            if (data.event_type.LogEntryProposed) {
                console.error('🚨🚨🚨 CRITICAL DEBUG: LogEntryProposed event received!', data);
            }
            if (data.event_type.ReplicationAckReceived) {
                console.error('🚨🚨🚨 CRITICAL DEBUG: ReplicationAckReceived event received!', data);
            }
            if (data.event_type.ClientCommandReceived) {
                console.error('🚨🚨🚨 CRITICAL DEBUG: ClientCommandReceived event received!', data);
            }
        }
        
        // Determine if this is a RaftEvent format or connection message
        if (data.event_type) {
            // This is a RaftEvent format: { id, timestamp, node_id, term, event_type: {...} }
            console.log('🗳️ Processing RaftEvent:', data.event_type.type);
            this.handleRaftEvent(data);
            return;
        }
        
        // Handle connection/status messages (data.type format)
        switch (data.type) {
            case 'connected':
                console.log('🎉 Connected to Raft cluster');
                break;
                
            case 'subscribed':
                console.log('📡 Subscribed to Raft events');
                break;
                
            case 'status':
                this.handleClusterStatus(data);
                break;
                
            case 'ClusterStatus':
                // Handle cluster status events from backend - this contains REAL leader info
                console.log('🏛️ CRITICAL: Processing ClusterStatus with real leader info:', data);
                this.processClusterStatusEvent(data);
                // Also treat as Raft event
                this.handleRaftEvent(data);
                break;
                
            default:
                // Check if this is a direct event format (rare case)
                if (data.type && !data.event_type) {
                    // This looks like a direct event format, treat as Raft event
                    console.log('📋 Processing direct event format:', data.type);
                    this.handleRaftEvent(data);
                } else {
                    console.log('💫 Unknown message format:', data);
                }
                break;
        }
    }
    
    /**
     * Handle Raft event
     * @param {Object} event - Raft event data
     */
    handleRaftEvent(event) {
        if (this.isPaused) return;
        
        console.log('🗳️ Raft event:', event);
        
        // CRITICAL DEBUG: Track all events that could affect node states
        const eventType = typeof event.event_type === 'string' ? event.event_type : event.event_type?.type;
        console.log(`🕵️ EVENT TRACKER: ${eventType} from Node ${event.node_id} - BEFORE processing, current states:`, 
            Array.from(this.visualization.nodes.entries()).map(([id, node]) => `Node${id}:${node.state}`).join(', '));
        
        console.log('📊 Event type detected:', eventType, 'from node:', event.node_id);
        
        // Debug: Track event processing
        if (eventType === 'HeartbeatSent') {
            console.log(`💓 Processing heartbeat from Node ${event.node_id} to followers:`, event.event_type.followers);
            console.log('💓 Full heartbeat event:', event);
        }
        
        // Update dashboard
        if (this.dashboard) {
            this.dashboard.processRaftEvent(event);
        }
        
        // Update visualization  
        if (this.visualization) {
            this.updateVisualizationFromEvent(event);
            
            // CRITICAL DEBUG: Track state changes AFTER processing
            console.log(`🕵️ EVENT TRACKER: ${eventType} from Node ${event.node_id} - AFTER processing, current states:`, 
                Array.from(this.visualization.nodes.entries()).map(([id, node]) => `Node${id}:${node.state}`).join(', '));
        }
        
        // Special handling for ClusterStatus events - process real leader info
        if (eventType === 'ClusterStatus') {
            const eventData = typeof event.event_type === 'object' ? event.event_type : (event.event_data || event);
            console.log('🏛️ ClusterStatus RaftEvent format detected:', eventData);
            
            // Use the same processing logic as direct ClusterStatus events
            const statusEvent = {
                leader_id: eventData.leader_id,
                current_term: eventData.current_term || event.term,
                total_nodes: eventData.total_nodes
            };
            this.processClusterStatusEvent(statusEvent);
        }
    }
    
    /**
     * Update visualization from Raft event
     * @param {Object} event - Raft event data
     */
    updateVisualizationFromEvent(event) {
        console.log('🎨 updateVisualizationFromEvent called with:', event);
        
        if (!this.visualization) {
            console.error('❌ Visualization object not found!');
            return;
        }
        
        // Handle different event formats
        let eventType, eventData, nodeId, term;
        
        if (event.event_type) {
            // RaftEvent format
            eventType = typeof event.event_type === 'string' ? event.event_type : event.event_type?.type;
            eventData = typeof event.event_type === 'object' ? event.event_type : event.event_data;
            nodeId = event.node_id;
            term = event.term;
        } else if (event.type) {
            // Direct event format
            eventType = event.type;
            eventData = event;
            nodeId = event.leader_id || event.node_id || 0;
            term = event.term || 0;
        } else {
            console.warn('📈 Unknown event format for visualization:', event);
            return;
        }
        
        console.log('🎨 Processing visualization event:', {
            eventType,
            nodeId,
            term,
            eventData
        });
        
        // State updates are handled by specific event handlers only to prevent flickering
        
        // Add message animations for certain events
        console.log('🎯 Checking event type for animations:', eventType);
        switch (eventType) {
            case 'StateChange':
                // SIMPLE APPROACH: Copy the working logic from Dashboard
                console.log('🔄 Processing StateChange event - using simple dashboard approach');
                
                if (eventData) {
                    const newState = (eventData.to_state || eventData.new_state)?.toLowerCase();
                    if (newState) {
                        // Ensure node exists
                        if (!this.visualization.nodes.has(nodeId)) {
                            this.visualization.updateNode(nodeId, {
                                state: newState,
                                term: term || 0,
                                lastActivity: Date.now()
                            });
                        } else {
                            // Simple direct update (same as dashboard approach)
                            const node = this.visualization.nodes.get(nodeId);
                            const oldState = node.state;
                            if (newState !== oldState) {
                                console.log(`🔄 Node ${nodeId} state change: ${oldState} → ${newState}`);
                                node.state = newState;
                                node.term = Math.max(node.term, term || 0);
                                node.lastActivity = Date.now();
                            }
                        }
                        
                        // Force render
                        this.visualization.render(performance.now());
                    }
                }
                break;
                
            case 'LeaderElected':
                // SIMPLE APPROACH: Copy the working logic from Dashboard
                console.log('👑 Processing LeaderElected event - using simple dashboard approach');
                
                const electedLeaderId = eventData?.leader_id || nodeId;
                
                // Ensure node exists (same as dashboard)
                if (!this.visualization.nodes.has(electedLeaderId)) {
                    this.visualization.updateNode(electedLeaderId, {
                        state: 'leader',
                        term: term || 0,
                        lastActivity: Date.now()
                    });
                } else {
                    // Simple direct update (same as dashboard approach)
                    const leaderNode = this.visualization.nodes.get(electedLeaderId);
                    leaderNode.state = 'leader';
                    leaderNode.term = Math.max(leaderNode.term, term || 0);
                    leaderNode.lastActivity = Date.now();
                    if (eventData?.votes_received) {
                        leaderNode.votes = eventData.votes_received;
                    }
                    console.log(`👑 Node ${electedLeaderId} became leader with ${eventData?.votes_received || 0} votes`);
                }
                
                // Clear old leaders (simple approach)
                Array.from(this.visualization.nodes.entries()).forEach(([id, node]) => {
                    if (id !== electedLeaderId && node.state === 'leader') {
                        node.state = 'follower';
                    }
                });
                
                // Force render
                this.visualization.render(performance.now());
                break;
                
            case 'LogEntryAdded':
                console.log('📝 Processing LogEntryAdded event:', {
                    nodeId,
                    logIndex: eventData?.log_index,
                    command: eventData?.command,
                    term
                });
                
                // Update node with new log info - preserve current state
                const currentNode = this.visualization.nodes.get(nodeId);
                this.visualization.updateNode(nodeId, {
                    state: currentNode?.state || 'follower',
                    term: term || 0,
                    logSize: eventData?.log_index || 0,
                    lastActivity: Date.now()
                });
                
                console.log(`📝 Node ${nodeId} added log entry: "${eventData?.command}" at index ${eventData?.log_index}`);
                break;
                
            case 'HeartbeatSent':
                const leaderId = eventData?.leader_id || nodeId;
                const followers = eventData?.followers || [];
                
                console.log('💓 Processing HeartbeatSent (SUBTLE PULSE ONLY):', {
                    leaderId,
                    followers,
                    eventData,
                    nodeId
                });
                
                if (leaderId !== undefined && followers.length > 0) {
                    // Update leader state in visualization
                    const leaderNode = this.visualization.nodes.get(leaderId);
                    if (leaderNode && leaderNode.state !== 'leader') {
                        console.log(`👑 VISUALIZATION FIX: Node ${leaderId} sending heartbeats → updating to LEADER state`);
                        leaderNode.state = 'leader';
                        leaderNode.term = Math.max(leaderNode.term, term || 0);
                        leaderNode.lastActivity = Date.now();
                        
                        // Force render to show the change
                        this.visualization.render(performance.now());
                    }
                    
                    // Add subtle heartbeat pulse animations (not prominent messages)
                    if (this.visualization.addHeartbeatPulse) {
                        this.visualization.addHeartbeatPulse(leaderId, followers);
                    } else {
                        // Fallback: very subtle message animations for heartbeats
                        followers.forEach(followerId => {
                            this.visualization.addMessage({
                                from: leaderId,
                                to: followerId,
                                messageType: 'heartbeat',
                                timestamp: event.timestamp || Date.now(),
                                subtle: true  // Flag for subtle rendering
                            });
                        });
                    }
                    
                    console.log(`💓 HEARTBEAT: Added subtle pulse for ${followers.length} followers`);
                } else {
                    console.warn('💓 HeartbeatSent but no followers found:', { leaderId, followers, eventData });
                }
                break;
                
            case 'LogReplicationSent':
                const replicationLeader = eventData?.leader_id || nodeId;
                const replicationFollower = eventData?.follower_id;
                const entriesCount = eventData?.entries_count || 0;
                const proposalIndices = eventData?.proposal_indices || [];
                
                console.log('📦 Processing LogReplicationSent (PROMINENT ANIMATION):', {
                    replicationLeader,
                    replicationFollower,
                    entriesCount,
                    proposalIndices,
                    eventData
                });
                
                if (replicationLeader !== undefined && replicationFollower !== undefined && entriesCount > 0) {
                    // Add prominent replication animation
                    this.visualization.addReplicationMessage({
                        from: replicationLeader,
                        to: replicationFollower,
                        entriesCount,
                        proposalIndices,
                        timestamp: event.timestamp || Date.now()
                    });
                    
                    console.log(`📦 REPLICATION: Added prominent animation ${replicationLeader} → ${replicationFollower} (${entriesCount} entries)`);
                } else {
                    console.warn('📦 LogReplicationSent but missing data:', { replicationLeader, replicationFollower, entriesCount, eventData });
                }
                break;
                
            case 'ReplicationAckReceived':
                const ackFrom = eventData?.from_follower;
                const ackTo = eventData?.to_leader || nodeId;
                const ackSuccess = eventData?.success;
                const matchedIndex = eventData?.matched_index;
                
                console.log('✅ ReplicationAckReceived:', { ackFrom, ackTo, ackSuccess });
                
                if (ackFrom !== undefined && ackTo !== undefined) {
                    
                    // Add ACK/NACK response animation
                    this.visualization.addAckMessage({
                        from: ackFrom,
                        to: ackTo,
                        success: ackSuccess,
                        matchedIndex,
                        timestamp: event.timestamp || Date.now()
                    });
                    
                    console.log(`✅ ACK: Added ${ackSuccess ? 'SUCCESS' : 'FAILED'} animation ${ackFrom} → ${ackTo}`);
                } else {
                    console.warn('❌ ReplicationAckReceived missing critical data:', { 
                        ackFrom, 
                        ackTo, 
                        ackSuccess, 
                        'ackFrom undefined': ackFrom === undefined,
                        'ackTo undefined': ackTo === undefined,
                        eventData,
                        fullEvent: event
                    });
                }
                break;
                
            case 'ConsensusAckReceived':
                const consensusFrom = eventData?.from_follower;
                const consensusTo = eventData?.to_leader || nodeId;
                const consensusSuccess = eventData?.success;
                const proposalIndex = eventData?.proposal_index;
                const acksReceived = eventData?.acks_received;
                const acksNeeded = eventData?.acks_needed;
                const consensusAchieved = eventData?.consensus_achieved;
                
                console.log('🎯 ConsensusAckReceived (PROPOSAL ACK):', { 
                    consensusFrom, 
                    consensusTo, 
                    consensusSuccess, 
                    proposalIndex, 
                    acksReceived, 
                    acksNeeded, 
                    consensusAchieved 
                });
                
                if (consensusFrom !== undefined && consensusTo !== undefined) {
                    // Add consensus-specific ACK animation (step 3 of client command flow)
                    // Backend now handles proper timing with simulated network delay
                    this.visualization.addAckMessage({
                        from: consensusFrom,
                        to: consensusTo,
                        success: consensusSuccess,
                        proposalIndex,
                        timestamp: event.timestamp || Date.now(),
                        type: 'consensus_ack',
                        color: consensusSuccess ? '#00ff44' : '#ff4400', // Bright green for success, orange for failure
                        duration: 1000, // Make ACKs longer duration to be more visible
                        isConsensusAck: true, // Mark this as a consensus ACK
                        acksReceived,
                        acksNeeded,
                        consensusAchieved
                    });
                    
                    console.log(`🎯 CONSENSUS ACK: Added ${consensusSuccess ? 'SUCCESS' : 'FAILED'} consensus animation ${consensusFrom} → ${consensusTo} (${acksReceived}/${acksNeeded}) with bright color`);
                } else {
                    console.warn('❌ ConsensusAckReceived missing critical data:', { 
                        consensusFrom, 
                        consensusTo, 
                        eventData 
                    });
                }
                break;
                
            case 'ReplicationCompleted':
                const consensusLeader = eventData?.leader_id || nodeId;
                const committedIndices = eventData?.committed_indices || [];
                const acknowledgedBy = eventData?.acknowledged_by || [];
                
                console.log('🎉 Processing ReplicationCompleted (CONSENSUS ACHIEVED):', {
                    consensusLeader,
                    committedIndices,
                    acknowledgedBy,
                    eventData
                });
                
                if (consensusLeader !== undefined && committedIndices.length > 0) {
                    // Add consensus achievement animation
                    this.visualization.addConsensusAchievedAnimation({
                        leaderId: consensusLeader,
                        committedIndices,
                        acknowledgedBy,
                        timestamp: event.timestamp || Date.now()
                    });
                    
                    console.log(`🎉 CONSENSUS: Added celebration animation for ${committedIndices.length} entries committed by Node ${consensusLeader}`);
                } else {
                    console.warn('🎉 ReplicationCompleted but missing data:', { consensusLeader, committedIndices, acknowledgedBy, eventData });
                }
                break;
                
            case 'MessageSent':
                // DEPRECATED: MessageSent events are being replaced by specific event types
                // Keep for backward compatibility but prefer the new event types
                console.warn('⚠️ MessageSent event received - consider using specific event types instead:', eventData);
                
                if (eventData) {
                    // Legacy handling for any remaining MessageSent events
                    if (eventData.message_details && eventData.message_details.includes('Heartbeat')) {
                        // This is a legacy heartbeat - handle as subtle
                        this.visualization.addMessage({
                            from: eventData.from || nodeId,
                            to: eventData.to || 0,
                            messageType: 'heartbeat',
                            timestamp: event.timestamp || Date.now(),
                            subtle: true
                        });
                    } else {
                        // Other legacy messages - treat as regular
                        this.visualization.addMessage({
                            from: eventData.from || nodeId,
                            to: eventData.to || 0,
                            messageType: eventData.message_type || 'message',
                            timestamp: event.timestamp || Date.now()
                        });
                    }
                }
                break;
                
            case 'LogEntryProposed':
                console.log('📋 Processing LogEntryProposed event (STEP 2: LEADER BROADCAST):', {
                    nodeId,
                    proposedIndex: eventData?.proposed_index,
                    command: eventData?.command,
                    requiredAcks: eventData?.required_acks
                });
                
                // STEP 2: Leader broadcasts the proposal to all followers
                // This should show simultaneous animations from leader to all followers
                const followerIds = [];
                for (let i = 0; i < this.clusterSize; i++) {
                    if (i !== nodeId) {
                        followerIds.push(i);
                    }
                }
                
                console.log(`📋 BROADCASTING from Leader ${nodeId} to ${followerIds.length} followers: [${followerIds.join(', ')}]`);
                
                // Add BROADCAST animation: one leader sending to multiple followers simultaneously
                followerIds.forEach(followerId => {
                    this.visualization.addMessage({
                        from: nodeId,
                        to: followerId,
                        messageType: 'proposal_broadcast',
                        command: eventData?.command || 'proposal',
                        proposedIndex: eventData?.proposed_index,
                        timestamp: event.timestamp || Date.now()
                    });
                });
                
                console.log(`📋 STEP 2 COMPLETE: Leader ${nodeId} broadcast "${eventData?.command}" to ${followerIds.length} followers`);
                break;
                
            case 'ClientCommandReceived':
                const isAcceptedByLeader = eventData?.accepted_by_leader;
                
                console.log('📨 Processing ClientCommandReceived event:', {
                    nodeId,
                    command: eventData?.command,
                    acceptedByLeader: isAcceptedByLeader,
                    isLeader: isAcceptedByLeader,
                    isFollower: !isAcceptedByLeader
                });
                
                if (isAcceptedByLeader) {
                    // STEP 1: This is the leader receiving and accepting the command
                    console.log(`📨 LEADER ${nodeId} accepted client command: "${eventData?.command}"`);
                    
                    // Show command coming from external client to the leader
                    this.visualization.addClientMessage({
                        to: nodeId,
                        messageType: 'client_command_accepted',
                        command: eventData?.command,
                        timestamp: event.timestamp || Date.now()
                    });
                    
                } else {
                    // STEP 1: This is a follower rejecting the command (should forward to leader)
                    console.log(`📨 FOLLOWER ${nodeId} rejected client command: "${eventData?.command}" - should forward to leader`);
                    
                    // Show command coming from external client to this follower (which will reject)
                    this.visualization.addClientMessage({
                        to: nodeId,
                        messageType: 'client_command_rejected',
                        command: eventData?.command,
                        timestamp: event.timestamp || Date.now()
                    });
                    
                    // TODO: In a real implementation, we'd need to find the current leader and show forwarding
                    // For now, we'll identify the leader from current node states
                    const currentLeader = this.getCurrentLeader();
                    if (currentLeader !== null && currentLeader !== nodeId) {
                        console.log(`🔄 FORWARDING: Node ${nodeId} → Leader ${currentLeader}`);
                        
                        // Show forwarding animation from follower to leader
                        setTimeout(() => {
                            this.visualization.addMessage({
                                from: nodeId,
                                to: currentLeader,
                                messageType: 'command_forward',
                                command: eventData?.command,
                                timestamp: event.timestamp + 100 || Date.now() + 100
                            });
                        }, 200); // Small delay to show the sequence
                    }
                }
                
                console.log(`📨 Node ${nodeId} processed client command: "${eventData?.command}" (accepted: ${isAcceptedByLeader})`);
                break;
                
            case 'ClusterStatus':
                console.log('🏛️ Processing ClusterStatus in visualization update:', eventData);
                // ClusterStatus is already handled above in handleRaftEvent - no additional animation needed
                break;

            case 'VoteRequested':
                // Candidate requesting votes from other nodes
                console.log('🗳️ Processing VoteRequested event:', eventData);
                if (eventData && eventData.candidate_id !== undefined) {
                    const candidateId = eventData.candidate_id;
                    
                    // Send vote request message from candidate to all other nodes
                    for (let [targetId, targetNode] of this.visualization.nodes.entries()) {
                        if (targetId !== candidateId) {
                            this.visualization.addMessage({
                                from: candidateId,
                                to: targetId,
                                type: 'vote_request',
                                color: '#9966ff', // Purple for vote requests
                                duration: 1000,
                                timestamp: Date.now()
                            });
                            console.log(`🗳️ ANIMATION: Vote request from Node ${candidateId} to Node ${targetId}`);
                        }
                    }
                }
                break;

            case 'VoteGranted':
                // Voter granting vote to candidate
                console.log('✅ Processing VoteGranted event:', eventData);
                if (eventData && eventData.voter_id !== undefined && eventData.candidate_id !== undefined) {
                    this.visualization.addAckMessage({
                        from: eventData.voter_id,
                        to: eventData.candidate_id,
                        type: 'vote_granted',
                        color: '#00ff88', // Bright green for granted votes
                        duration: 800,
                        timestamp: Date.now()
                    });
                    console.log(`✅ ANIMATION: Vote granted from Node ${eventData.voter_id} to Node ${eventData.candidate_id}`);
                }
                break;

            case 'VoteDenied':
                // Voter denying vote to candidate
                console.log('❌ Processing VoteDenied event:', eventData);
                if (eventData && eventData.voter_id !== undefined && eventData.candidate_id !== undefined) {
                    this.visualization.addAckMessage({
                        from: eventData.voter_id,
                        to: eventData.candidate_id,
                        type: 'vote_denied',
                        color: '#ff4444', // Red for denied votes
                        duration: 800,
                        timestamp: Date.now()
                    });
                    console.log(`❌ ANIMATION: Vote denied from Node ${eventData.voter_id} to Node ${eventData.candidate_id}`);
                }
                break;

            case 'HeartbeatReceived':
                // Follower acknowledging heartbeat from leader
                console.log('💓 Processing HeartbeatReceived event:', eventData);
                if (eventData && eventData.follower_id !== undefined && eventData.leader_id !== undefined) {
                    this.visualization.addAckMessage({
                        from: eventData.follower_id,
                        to: eventData.leader_id,
                        type: 'heartbeat_ack',
                        color: '#88ccff', // Light blue for heartbeat ACKs
                        duration: 400, // Faster than other messages since heartbeats are frequent
                        timestamp: Date.now()
                    });
                    console.log(`💓 ANIMATION: Heartbeat ACK from Node ${eventData.follower_id} to Node ${eventData.leader_id}`);
                }
                break;
                
            default:
                console.log('🤷 Unhandled event type for animation:', eventType, event);
                break;
        }
    }
    
    /**
     * Get node state from event
     * @param {Object} event - Raft event
     * @returns {string} Node state
     */
    getNodeStateFromEvent(event) {
        // Handle different event formats
        let eventType, eventData;
        
        if (event.event_type) {
            // RaftEvent format
            eventType = typeof event.event_type === 'string' ? event.event_type : event.event_type?.type;
            eventData = typeof event.event_type === 'object' ? event.event_type : event.event_data;
        } else if (event.type) {
            // Direct event format
            eventType = event.type;
            eventData = event;
        }
        
        switch (eventType) {
            case 'StateChange':
                return (eventData?.to_state || eventData?.new_state)?.toLowerCase() || 'follower';
            case 'LeaderElected':
                // For LeaderElected events, only the elected node becomes leader
                const electedLeaderId = eventData?.leader_id || event.node_id;
                return electedLeaderId === event.node_id ? 'leader' : 'follower';
            case 'HeartbeatSent':
                // Node sending heartbeats is the leader
                return 'leader';
            case 'ElectionTimeout':
                // Node timing out might become candidate
                return 'candidate';
            case 'VoteRequested':
                // Node requesting votes is a candidate
                return 'candidate';
            default:
                return 'follower'; // Default state
        }
    }
    
    /**
     * Process ClusterStatus event that contains real leader information
     * @param {Object} statusEvent - ClusterStatus event from backend
     */
    processClusterStatusEvent(statusEvent) {
        console.log('🏛️ Processing ClusterStatus event with REAL leader data:', statusEvent);
        
        // Extract leader information from ClusterStatus event
        const leaderId = statusEvent.leader_id;
        const currentTerm = statusEvent.current_term || statusEvent.term || 1;
        const totalNodes = statusEvent.total_nodes || 5;
        
        console.log(`🏛️ ClusterStatus: leader_id=${leaderId}, term=${currentTerm}, total_nodes=${totalNodes}`);
        
        if (leaderId !== null && leaderId !== undefined) {
            console.log(`👑 REAL LEADER DETECTED: Node ${leaderId} is the current leader (term ${currentTerm})`);
            
            // Update all nodes - set the real leader and make others followers
            for (let nodeId = 0; nodeId < totalNodes; nodeId++) {
                const isLeader = nodeId === leaderId;
                const newState = isLeader ? 'leader' : 'follower';
                
                // Ensure node exists in visualization
                if (!this.visualization.nodes.has(nodeId)) {
                    this.visualization.updateNode(nodeId, {
                        state: newState,
                        term: currentTerm,
                        lastActivity: Date.now()
                    });
                    console.log(`🔧 Created Node ${nodeId} as ${newState}`);
                } else {
                    // Update existing node
                    const node = this.visualization.nodes.get(nodeId);
                    const oldState = node.state;
                    if (oldState !== newState) {
                        console.log(`🔄 Node ${nodeId} state update: ${oldState} → ${newState}`);
                        node.state = newState;
                        node.term = Math.max(node.term || 0, currentTerm);
                        node.lastActivity = Date.now();
                    }
                }
            }
            
            // Force render to show the updated states
            this.visualization.render(performance.now());
            
            console.log(`✅ Applied ClusterStatus: Node ${leaderId} is now leader, others are followers`);
        } else {
            console.warn('⚠️ ClusterStatus event has no leader_id - may be incomplete');
        }
    }

    /**
     * Handle cluster status update
     * @param {Object} status - Cluster status data
     */
    handleClusterStatus(status) {
        console.log('📊 Cluster status update:', status);
        
        // Update UI with cluster information
        if (status.cluster_active) {
            console.log('✅ Cluster is active');
        } else {
            console.log('⚠️ Cluster is not active');
        }
    }
    
    /**
     * Handle command submission
     * @param {Object} commandData - Command data
     */
    handleCommandSubmit(commandData) {
        console.log('📤 Submitting command to cluster:', commandData.command);
        
        // Send command through WebSocket
        if (this.wsManager) {
            this.wsManager.send({
                type: 'submit_command',
                command: commandData.command
            });
            console.log('✅ Command sent via WebSocket');
        } else {
            console.log('❌ WebSocket not available');
        }
    }
    
    /**
     * Set paused state
     * @param {boolean} paused - Whether to pause
     */
    setPaused(paused) {
        this.isPaused = paused;
        
        if (this.visualization) {
            this.visualization.setPaused(paused);
        }
        
        console.log(paused ? '⏸️ App paused' : '▶️ App resumed');
    }
    
    /**
     * Clear visualization
     */
    clearVisualization() {
        if (this.visualization) {
            this.visualization.clear();
        }
        console.log('🧹 Visualization cleared');
    }
    
    /**
     * Reset application
     */
    reset() {
        console.log('🔄 Resetting app...');
        
        // Clear visualization
        this.clearVisualization();
        
        // Reset state
        this.isPaused = false;
        
        console.log('✅ App reset complete');
    }
    
    /**
     * Update visualization settings
     * @param {Object} settings - Visualization settings
     */
    updateVisualizationSettings(settings) {
        if (this.visualization) {
            this.visualization.setSettings(settings);
        }
        console.log('⚙️ Visualization settings updated:', settings);
    }
    
    /**
     * Trigger a leader change simulation
     */
    triggerLeaderChange() {
        console.log('👑 Triggering leader change simulation via WebSocket...');
        
        // Send command through WebSocket
        if (this.wsManager) {
            this.wsManager.send({
                type: 'simulate_leader_failure',
                timestamp: Date.now()
            });
            console.log('✅ Leader change simulation message sent via WebSocket');
        } else {
            console.log('❌ WebSocket not available');
        }
    }
    
    /**
     * Show error message to user
     * @param {string} message - Error message
     */
    showError(message) {
        console.error('❌ Error:', message);
        
        // Show error in dashboard if available
        if (this.dashboard) {
            this.dashboard.showNotification(message, 'error');
        } else {
            // Fallback: show alert
            alert('Error: ' + message);
        }
    }
    
    /**
     * Cleanup when app is closing
     */
    cleanup() {
        console.log('🧹 Cleaning up app...');
        
        if (this.wsManager) {
            this.wsManager.close();
        }
        
        if (this.visualization) {
            this.visualization.setPaused(true);
        }
    }
    
    /**
     * Request current cluster state and generate events if leader is missing
     * This solves the timing issue where WebSocket connects after leader election
     */
    requestCurrentClusterState() {
        console.log('🔍 Checking if we have received leader events...');
        
        // Check if any node is currently marked as leader
        if (this.visualization && this.visualization.nodes.size > 0) {
            const leaders = Array.from(this.visualization.nodes.values()).filter(node => node.state === 'leader');
            
            if (leaders.length === 0) {
                console.log('⚠️ No leader detected in visualization - cluster state may be incomplete');
                console.log('🔄 Analyzing current cluster state...');
                
                // In a real Raft cluster, there should always be a leader
                // Since we're missing leader state, we need to determine who the current leader is
                // For now, we'll send a special request to query cluster state
                if (this.wsManager) {
                    console.log('📤 Sending cluster state query request...');
                    this.wsManager.send({
                        type: 'query_cluster_state',
                        timestamp: Date.now()
                    });
                    
                    // If no response after 2 seconds, we'll infer the leader from the dashboard
                    setTimeout(() => {
                        this.inferLeaderFromDashboardState();
                    }, 2000);
                }
            } else {
                console.log('✅ Leader already detected:', leaders.map(l => `Node ${l.id}`));
            }
        }
    }
    
    /**
     * Infer leader from dashboard state and generate synthetic events
     */
    inferLeaderFromDashboardState() {
        console.log('🧮 Inferring leader from dashboard state...');
        
        if (!this.dashboard || !this.dashboard.nodes) {
            console.log('❌ Dashboard data not available for leader inference');
            return;
        }
        
        // Look for the node with the highest term or most activity
        let candidateLeader = null;
        let highestTerm = 0;
        
        for (const [nodeId, nodeData] of this.dashboard.nodes.entries()) {
            if (nodeData.term > highestTerm || 
                (nodeData.term === highestTerm && nodeData.state === 'leader')) {
                candidateLeader = nodeId;
                highestTerm = nodeData.term;
            }
        }
        
        // If we found a candidate leader, generate synthetic events
        if (candidateLeader !== null) {
            console.log(`🎯 Inferred leader: Node ${candidateLeader} (term ${highestTerm})`);
            console.log('🔧 Generating synthetic LeaderElected event...');
            
            // Create synthetic LeaderElected event
            const syntheticLeaderEvent = {
                id: Date.now(),
                timestamp: Date.now(),
                node_id: candidateLeader,
                term: highestTerm,
                event_type: {
                    type: 'LeaderElected',
                    leader_id: candidateLeader,
                    votes_received: 3, // Assume majority
                    total_votes: 5,
                    term: highestTerm
                }
            };
            
            console.log('📡 Processing synthetic LeaderElected event:', syntheticLeaderEvent);
            this.handleRaftEvent(syntheticLeaderEvent);
            
            // Also create synthetic StateChange event
            const syntheticStateEvent = {
                id: Date.now() + 1,
                timestamp: Date.now(),
                node_id: candidateLeader,
                term: highestTerm,
                event_type: {
                    type: 'StateChange',
                    from_state: 'Follower',
                    to_state: 'Leader',
                    reason: 'Inferred from cluster state on WebSocket connection'
                }
            };
            
            console.log('📡 Processing synthetic StateChange event:', syntheticStateEvent);
            this.handleRaftEvent(syntheticStateEvent);
            
        } else {
            console.log('❌ Could not infer current leader from available data');
            // As last resort, assume Node 0 is leader (common in tests)
            console.log('🔧 Falling back to Node 0 as default leader');
            
            const fallbackLeaderEvent = {
                id: Date.now(),
                timestamp: Date.now(),
                node_id: 0,
                term: 1,
                event_type: {
                    type: 'LeaderElected',
                    leader_id: 0,
                    votes_received: 3,
                    total_votes: 5,
                    term: 1
                }
            };
            
            this.handleRaftEvent(fallbackLeaderEvent);
        }
    }

    /**
     * Get current leader node ID from visualization state
     */
    getCurrentLeader() {
        if (!this.visualization || !this.visualization.nodes) {
            return null;
        }
        
        for (const [nodeId, node] of this.visualization.nodes.entries()) {
            if (node.state === 'leader') {
                return nodeId;
            }
        }
        
        return null; // No leader found
    }

    /**
     * Get application state
     */
    getState() {
        return {
            isInitialized: this.isInitialized,
            isPaused: this.isPaused,
            clusterSize: this.clusterSize,
            wsState: this.wsManager ? this.wsManager.getState() : null,
            vizState: this.visualization ? this.visualization.getState() : null,
            dashboardState: this.dashboard ? this.dashboard.getState() : null
        };
    }
}

// Initialize app when script loads
console.log('🌟 Raft Visualization App starting...');
const app = new RaftApp();

// Make app globally available for debugging
window.raftApp = app;