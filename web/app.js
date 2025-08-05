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
        
        this.wsManager = new WebSocketManager();
        
        // WebSocket event handlers
        this.wsManager.on('connected', () => {
            console.log('✅ WebSocket connected');
            // Subscribe to events
            this.wsManager.subscribe();
            // Get initial status
            this.wsManager.getStatus();
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
    }
    
    /**
     * Handle WebSocket message
     * @param {Object} data - Message data
     */
    handleWebSocketMessage(data) {
        console.log('📨 WebSocket message:', data);
        
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
                // Handle cluster status events from backend
                this.handleClusterStatus(data);
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
        
        // Debug: Count different event types
        const eventType = typeof event.event_type === 'string' ? event.event_type : event.event_type?.type;
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
        }
        
        // Special handling for ClusterStatus events to initialize all nodes
        if (eventType === 'ClusterStatus') {
            const eventData = typeof event.event_type === 'object' ? event.event_type : event.event_data;
            if (eventData && eventData.total_nodes) {
                console.log(`🔧 ClusterStatus received, initializing ${eventData.total_nodes} nodes`);
                // Make sure all nodes are initialized
                for (let nodeId = 0; nodeId < eventData.total_nodes; nodeId++) {
                    this.visualization.updateNode(nodeId, {
                        state: 'follower',
                        term: event.term || 0,
                        lastActivity: Date.now()
                    });
                }
            }
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
        
        // Update node state for the primary node
        if (nodeId !== undefined) {
            const newState = this.getNodeStateFromEvent(event);
            console.log(`🎨 Updating node ${nodeId} state to: ${newState} for event: ${eventType}`);
            this.visualization.updateNode(nodeId, {
                state: newState,
                term: term || 0,
                lastActivity: Date.now()
            });
        }
        
        // Add message animations for certain events
        console.log('🎯 Checking event type for animations:', eventType);
        switch (eventType) {
            case 'StateChange':
                console.log('🔄 Processing StateChange event:', {
                    nodeId,
                    eventData,
                    fromState: eventData?.from_state,
                    toState: eventData?.to_state
                });
                
                // Update node state in visualization
                const newState = eventData?.to_state?.toLowerCase() || 'follower';
                this.visualization.updateNode(nodeId, {
                    state: newState,
                    term: term || 0,
                    lastActivity: Date.now()
                });
                
                console.log(`🔄 Node ${nodeId} state changed to: ${newState}`);
                break;
                
            case 'LeaderElected':
                console.log('👑 Processing LeaderElected event:', {
                    leaderId: eventData?.leader_id || nodeId,
                    votesReceived: eventData?.votes_received,
                    totalVotes: eventData?.total_votes,
                    term
                });
                
                const electedLeaderId = eventData?.leader_id || nodeId;
                
                // Update the elected leader
                this.visualization.updateNode(electedLeaderId, {
                    state: 'leader',
                    term: term || 0,
                    lastActivity: Date.now()
                });
                
                // Set all other nodes as followers (they should get StateChange events too)
                for (let i = 0; i < 5; i++) {
                    if (i !== electedLeaderId) {
                        this.visualization.updateNode(i, {
                            state: 'follower',
                            term: term || 0,
                            lastActivity: Date.now()
                        });
                    }
                }
                
                console.log(`👑 Node ${electedLeaderId} elected as leader with ${eventData?.votes_received || 0} votes`);
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
                
                console.log('💓 Processing HeartbeatSent:', {
                    leaderId,
                    followers,
                    eventData,
                    nodeId
                });
                
                if (leaderId !== undefined && followers.length > 0) {
                    // Update leader state
                    this.visualization.updateNode(leaderId, {
                        state: 'leader',
                        term: term || 0,
                        lastActivity: Date.now()
                    });
                    
                    // Update followers and add message animations
                    followers.forEach(followerId => {
                        console.log(`💓 Adding heartbeat animation: ${leaderId} → ${followerId}`);
                        
                        // Make sure follower nodes exist in visualization
                        this.visualization.updateNode(followerId, {
                            state: 'follower',
                            term: term || 0,
                            lastActivity: Date.now()
                        });
                        
                        // Add heartbeat message animation
                        this.visualization.addMessage({
                            from: leaderId,
                            to: followerId,
                            messageType: 'heartbeat',
                            timestamp: event.timestamp || Date.now()
                        });
                    });
                } else {
                    console.warn('💓 HeartbeatSent but no followers found:', { leaderId, followers, eventData });
                }
                break;
                
            case 'MessageSent':
                if (eventData) {
                    this.visualization.addMessage({
                        from: eventData.from || nodeId,
                        to: eventData.to || 0,
                        messageType: eventData.message_type || 'message',
                        timestamp: event.timestamp || Date.now()
                    });
                }
                break;
                
            case 'ClientCommandReceived':
                console.log('📨 Processing ClientCommandReceived event:', {
                    nodeId,
                    command: eventData?.command,
                    acceptedByLeader: eventData?.accepted_by_leader
                });
                
                // Show command submission with a visual indicator
                // Instead of using node 999, we'll add a special client message animation
                // that shows the command coming from outside the cluster
                this.visualization.addClientMessage({
                    to: nodeId,
                    messageType: 'client_command',
                    command: eventData?.command,
                    timestamp: event.timestamp || Date.now()
                });
                
                console.log(`📨 Node ${nodeId} received client command: "${eventData?.command}"`);
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