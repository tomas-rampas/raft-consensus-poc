/**
 * Dashboard Component Manager
 * Handles UI components, statistics, and user interactions
 */

class RaftDashboard {
    constructor() {
        console.log('🎛️ RaftDashboard constructor called!');
        console.log('🎛️ DOM readyState:', document.readyState);
        console.log('🎛️ Direct test - can we find showReplicationEvents?', document.getElementById('showReplicationEvents'));
        
        this.statistics = {
            totalMessages: 0,
            leaderElections: 0,
            logEntries: 0,
            currentTerm: 0,
            startTime: Date.now()
        };
        
        this.nodes = new Map();
        this.eventHistory = [];
        this.maxEventHistory = 100;
        
        // Initialize DOM elements
        this.initializeDOMElements();
        
        this.setupEventHandlers();
        this.startPeriodicUpdates();
    }
    
    /**
     * Initialize DOM elements with error checking
     */
    initializeDOMElements() {
        console.log('🔧 Initializing Dashboard DOM elements...');
        
        // UI elements
        this.elements = {
            // Statistics
            totalMessages: document.getElementById('totalMessages'),
            leaderElections: document.getElementById('leaderElections'),
            logEntries: document.getElementById('logEntries'),
            currentTerm: document.getElementById('currentTerm'),
            
            // Controls
            commandInput: document.getElementById('commandInput'),
            submitBtn: document.getElementById('submitBtn'),
            pauseBtn: document.getElementById('pauseBtn'),
            clearBtn: document.getElementById('clearBtn'),
            resetBtn: document.getElementById('resetBtn'),
            changeLeaderBtn: document.getElementById('changeLeaderBtn'),
            
            // Visualization controls
            showHeartbeats: document.getElementById('showHeartbeats'),
            showMessages: document.getElementById('showMessages'),
            
            // Timeline
            eventTimeline: document.getElementById('eventTimeline'),
            timelineClearBtn: document.getElementById('timelineClearBtn'),
            showHeartbeatEvents: document.getElementById('showHeartbeatEvents'),
            showReplicationEvents: document.getElementById('showReplicationEvents'),
            
            // Nodes
            nodesList: document.getElementById('nodesList')
        };
        
        // Check for DOM element confusion
        if (this.elements.showHeartbeats === this.elements.showReplicationEvents) {
            console.error('🚨 BUG: showHeartbeats and showReplicationEvents are the same element!');
        }
        if (this.elements.showMessages === this.elements.showReplicationEvents) {
            console.error('🚨 BUG: showMessages and showReplicationEvents are the same element!');
        }
        
        // Debug: Check which elements were found
        const missingElements = [];
        Object.entries(this.elements).forEach(([key, element]) => {
            if (!element) {
                missingElements.push(key);
            }
        });
        
        if (missingElements.length > 0) {
            console.warn('⚠️ Missing DOM elements:', missingElements);
        } else {
            console.log('✅ All DOM elements found successfully');
        }
        
        // Force initial statistics display update
        this.updateStatistics();
        
        // Add test functions to global scope for debugging
        window.testDashboardUpdate = () => this.testDOMUpdate();
        window.debugDOMElements = () => this.debugDOMElements();
    }
    
    /**
     * Test DOM update functionality
     */
    testDOMUpdate() {
        console.log('🧪 Testing DOM update functionality...');
        
        // Test updating statistics with fake values
        this.statistics.totalMessages = 999;
        this.statistics.leaderElections = 5;
        this.statistics.logEntries = 10;
        this.statistics.currentTerm = 3;
        
        this.updateStatistics();
        
        // Also test direct DOM manipulation
        if (this.elements.totalMessages) {
            this.elements.totalMessages.style.backgroundColor = 'yellow';
            this.elements.totalMessages.style.color = 'red';
            setTimeout(() => {
                this.elements.totalMessages.style.backgroundColor = '';
                this.elements.totalMessages.style.color = '';
            }, 2000);
        }
        
        console.log('🧪 DOM update test completed - check if values changed to 999, 5, 10, 3');
    }
    
    /**
     * Debug DOM elements - check their current state
     */
    debugDOMElements() {
        console.log('🔍 Debugging DOM elements:');
        
        Object.entries(this.elements).forEach(([key, element]) => {
            if (element) {
                console.log(`✅ ${key}:`, {
                    element: element,
                    textContent: element.textContent,
                    innerHTML: element.innerHTML,
                    visible: element.offsetParent !== null,
                    inDocument: document.contains(element)
                });
            } else {
                console.log(`❌ ${key}: null/undefined`);
            }
        });
        
        // Check if elements are actually in DOM
        console.log('🔍 Manual DOM checks:');
        console.log('totalMessages by ID:', document.getElementById('totalMessages'));
        console.log('leaderElections by ID:', document.getElementById('leaderElections'));
        console.log('logEntries by ID:', document.getElementById('logEntries'));
        console.log('currentTerm by ID:', document.getElementById('currentTerm'));
    }
    
    /**
     * Set up event handlers for UI elements
     */
    setupEventHandlers() {
        // Command submission
        if (this.elements.submitBtn) {
            this.elements.submitBtn.addEventListener('click', () => {
                this.submitCommand();
            });
        }
        
        if (this.elements.commandInput) {
            this.elements.commandInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.submitCommand();
                }
            });
        }
        
        // Control buttons
        if (this.elements.pauseBtn) {
            this.elements.pauseBtn.addEventListener('click', () => {
                this.togglePause();
            });
        }
        
        if (this.elements.clearBtn) {
            this.elements.clearBtn.addEventListener('click', () => {
                this.clearVisualization();
            });
        }
        
        if (this.elements.resetBtn) {
            this.elements.resetBtn.addEventListener('click', () => {
                this.resetDashboard();
            });
        }
        
        if (this.elements.changeLeaderBtn) {
            this.elements.changeLeaderBtn.addEventListener('click', () => {
                this.triggerLeaderChange();
            });
        }
        
        // Timeline clear
        if (this.elements.timelineClearBtn) {
            this.elements.timelineClearBtn.addEventListener('click', () => {
                this.clearTimeline();
            });
        }
        
        // Visualization settings - PROTECTED to only respond to visualization controls
        if (this.elements.showHeartbeats) {
            this.elements.showHeartbeats.addEventListener('change', (event) => {
                if (event.target.id === 'showHeartbeats') {
                    this.updateVisualizationSettings();
                } else {
                    console.error('🚨 WRONG TARGET for showHeartbeats listener:', event.target.id);
                }
            });
        }
        
        if (this.elements.showMessages) {
            this.elements.showMessages.addEventListener('change', (event) => {
                if (event.target.id === 'showMessages') {
                    this.updateVisualizationSettings();
                } else {
                    console.error('🚨 WRONG TARGET for showMessages listener:', event.target.id);
                }
            });
        }
        
        // Timeline heartbeat filter
        if (this.elements.showHeartbeatEvents) {
            this.elements.showHeartbeatEvents.addEventListener('change', () => {
                this.handleHeartbeatFilterChange();
            });
        }
        
        // Timeline replication filter - COMPLETELY ISOLATED
        if (this.elements.showReplicationEvents) {
            this.elements.showReplicationEvents.addEventListener('change', (event) => {
                // COMPLETE ISOLATION: Stop all event propagation immediately
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                
                // Simple inline timeline update - no external function calls
                const showReplications = event.target.checked;
                
                if (!showReplications) {
                    // Filter replication events inline
                    this.eventHistory = this.eventHistory.filter(event => {
                        const message = event.message.toLowerCase();
                        return !(message.includes('replication') || 
                                message.includes('acknowledgment') ||
                                message.includes('ack') ||
                                message.includes('appendentries'));
                    });
                }
                
                // Update timeline display directly
                if (this.elements.eventTimeline) {
                    const timeline = this.elements.eventTimeline;
                    timeline.innerHTML = '';
                    
                    this.eventHistory.forEach(event => {
                        const eventElement = document.createElement('div');
                        eventElement.className = `timeline-event ${event.type}`;
                        
                        const timeElement = document.createElement('div');
                        timeElement.className = 'event-time';
                        timeElement.textContent = new Date(event.timestamp).toLocaleTimeString();
                        
                        const messageElement = document.createElement('div');
                        messageElement.className = 'event-description';
                        messageElement.textContent = event.message;
                        
                        eventElement.appendChild(timeElement);
                        eventElement.appendChild(messageElement);
                        timeline.appendChild(eventElement);
                    });
                    
                    timeline.scrollTop = 0;
                }
            });
        }
    }
    
    /**
     * Submit command to cluster
     */
    submitCommand() {
        const command = this.elements.commandInput?.value.trim();
        if (!command) {
            this.showNotification('Please enter a command', 'warning');
            return;
        }
        
        console.log('📤 Submitting command:', command);
        
        // Emit event for command submission
        this.emit('submitCommand', { command });
        
        // Clear input
        if (this.elements.commandInput) {
            this.elements.commandInput.value = '';
        }
        
        // Add to timeline
        this.addTimelineEvent({
            type: 'user_action',
            message: `Submitted command: "${command}"`,
            timestamp: Date.now()
        });
        
        this.showNotification(`Command submitted: "${command}"`, 'success');
    }
    
    /**
     * Toggle pause state
     */
    togglePause() {
        const isPaused = this.elements.pauseBtn?.textContent.includes('▶️');
        
        if (isPaused) {
            this.elements.pauseBtn.innerHTML = '⏸️ Pause';
            this.emit('resume');
        } else {
            this.elements.pauseBtn.innerHTML = '▶️ Resume';
            this.emit('pause');
        }
    }
    
    /**
     * Clear visualization
     */
    clearVisualization() {
        this.emit('clearVisualization');
        this.showNotification('Visualization cleared', 'info');
    }
    
    /**
     * Reset dashboard
     */
    resetDashboard() {
        if (confirm('Are you sure you want to reset all statistics and timeline?')) {
            this.statistics = {
                totalMessages: 0,
                leaderElections: 0,
                logEntries: 0,
                currentTerm: 0,
                startTime: Date.now()
            };
            
            this.eventHistory = [];
            this.clearTimeline();
            this.updateStatistics();
            this.emit('reset');
            
            this.showNotification('Dashboard reset', 'info');
        }
    }
    
    /**
     * Trigger a leader change simulation
     */
    triggerLeaderChange() {
        console.log('👑 Triggering leader change simulation...');
        
        // Emit event for main app to handle
        this.emit('triggerLeaderChange');
        
        // Add to timeline
        this.addTimelineEvent({
            type: 'user_action',
            message: 'User triggered leader change simulation',
            timestamp: Date.now()
        });
        
        this.showNotification('Leader change simulation triggered', 'info');
    }
    
    /**
     * Clear timeline
     */
    clearTimeline() {
        if (this.elements.eventTimeline) {
            this.elements.eventTimeline.innerHTML = '';
        }
        this.eventHistory = [];
    }
    
    /**
     * Update visualization settings
     */
    updateVisualizationSettings() {
        const settings = {
            showHeartbeats: document.getElementById('showHeartbeats').checked,
            showMessages: document.getElementById('showMessages').checked
        };
        
        this.emit('updateVisualizationSettings', settings);
    }
    
    /**
     * Process Raft event
     * @param {Object} event - Raft event data
     */
    processRaftEvent(event) {
        console.log('📊 Processing Raft event:', event);
        
        // Update statistics
        this.updateStatisticsFromEvent(event);
        
        // Update node information
        this.updateNodeFromEvent(event);
        
        // Add to timeline with enhanced categorization
        const eventType = typeof event.event_type === 'string' ? event.event_type : event.event_type?.type;
        const eventData = typeof event.event_type === 'object' ? event.event_type : event.event_data;
        
        // Enhanced message categorization
        let timelineType = this.getEventCategory(eventType);
        
        // Special handling for MessageSent to distinguish proposal vs ACK
        if (eventType === 'MessageSent') {
            const messageType = eventData?.message_type || '';
            const details = eventData?.message_details || '';
            
            if (messageType === 'AppendEntriesRequest' && (details.includes('Proposal') || details.includes('proposal'))) {
                timelineType = 'proposal';
            } else if (messageType === 'AppendEntriesResponse' && (details.includes('ACK') || details.includes('ack'))) {
                timelineType = 'consensus';
            }
        }
        
        this.addTimelineEvent({
            type: timelineType,
            message: this.formatEventMessage(event),
            timestamp: event.timestamp || Date.now(),
            nodeId: event.node_id,
            term: event.term
        });
        
        // Update displays
        this.updateStatistics();
        this.updateNodesDisplay();
    }
    
    /**
     * Update statistics from Raft event
     * @param {Object} event - Raft event
     */
    updateStatisticsFromEvent(event) {
        this.statistics.totalMessages++;
        
        // Handle different event formats:
        // 1. RaftEvent format: { id, timestamp, node_id, term, event_type: {...} }
        // 2. Direct event format: { type: "HeartbeatSent", leader_id: 1, ... }
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
            term = event.term || this.statistics.currentTerm;
        } else {
            console.warn('📊 Unknown event format:', event);
            return;
        }
        
        if (term > this.statistics.currentTerm) {
            this.statistics.currentTerm = term;
        }
        
        console.log(`📊 Processing statistics for event: ${eventType} from node ${nodeId}`, {
            before: { ...this.statistics },
            eventType,
            nodeId,
            term
        });
        
        switch (eventType) {
            case 'LeaderElected':
                this.statistics.leaderElections++;
                console.log('📊 Leader election detected! Count:', this.statistics.leaderElections);
                break;
            case 'LogEntryAdded':
                this.statistics.logEntries++;
                console.log('📊 Log entry detected! Count:', this.statistics.logEntries);
                break;
            case 'ClientCommandReceived':
                // Count client commands that are accepted by leader as log entries
                if (eventData?.accepted_by_leader !== false) {
                    this.statistics.logEntries++;
                    console.log('📊 Client command counted as log entry! Count:', this.statistics.logEntries);
                }
                break;
            case 'StateChange':
                // If a node becomes leader, it's likely due to an election
                if (eventData?.to_state === 'Leader') {
                    // Only count if we haven't already counted this election
                    // (Multiple nodes might report state changes for the same election)
                    console.log('📊 State change to Leader detected for node:', nodeId);
                }
                break;
            case 'ElectionStarted':
                // Alternative way to count elections
                console.log('📊 Election started detected for node:', nodeId);
                break;
        }
    }
    
    /**
     * Initialize a node with default values
     * @param {number} nodeId - Node ID
     * @param {Object} initialData - Initial node data
     */
    initializeNode(nodeId, initialData = {}) {
        if (!this.nodes.has(nodeId)) {
            this.nodes.set(nodeId, {
                id: nodeId,
                state: initialData.state || 'follower',
                term: initialData.term || 0,
                votes: 0,
                logSize: 0,
                commitIndex: 0,
                lastActivity: Date.now()
            });
            console.log(`📊 Initialized node ${nodeId} as ${initialData.state || 'follower'}`);
        }
    }
    
    /**
     * Update node information from event
     * @param {Object} event - Raft event
     */
    updateNodeFromEvent(event) {
        // Handle different event formats:
        // 1. RaftEvent format: { id, timestamp, node_id, term, event_type: {...} }
        // 2. Direct event format: { type: "HeartbeatSent", leader_id: 1, ... }
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
            term = event.term || this.statistics.currentTerm;
        } else {
            console.warn('📊 Unknown event format:', event);
            return;
        }
        
        // Ensure node exists
        this.initializeNode(nodeId);
        
        const node = this.nodes.get(nodeId);
        node.lastActivity = Date.now();
        node.term = Math.max(node.term, term || 0);
        
        console.log(`📊 Updating node ${nodeId} for event ${eventType}:`, eventData);
        
        switch (eventType) {
            case 'StateChange':
                if (eventData) {
                    const newState = (eventData.to_state || eventData.new_state)?.toLowerCase();
                    if (newState && newState !== node.state) {
                        console.log(`📊 Node ${nodeId} state change: ${node.state} → ${newState}`);
                        node.state = newState;
                    }
                }
                break;
            case 'LeaderElected':
                console.log(`📊 Node ${nodeId} became leader with ${eventData?.votes_received || 0} votes`);
                node.state = 'leader';
                if (eventData) {
                    node.votes = eventData.votes_received || 0;
                }
                break;
            case 'LogEntryAdded':
                if (eventData) {
                    const newLogSize = eventData.log_index || 0;
                    node.logSize = Math.max(node.logSize, newLogSize);
                    console.log(`📊 Node ${nodeId} log size updated to ${node.logSize}`);
                }
                break;
            case 'HeartbeatSent':
                // For HeartbeatSent events, update the leader and all followers
                const leaderId = eventData.leader_id || nodeId;
                const followers = eventData.followers || [];
                
                // Update leader
                this.initializeNode(leaderId);
                const leaderNode = this.nodes.get(leaderId);
                if (leaderNode.state !== 'leader') {
                    console.log(`📊 Node ${leaderId} sending heartbeats, marking as leader`);
                    leaderNode.state = 'leader';
                    leaderNode.lastActivity = Date.now();
                }
                
                // Update followers
                followers.forEach(followerId => {
                    this.initializeNode(followerId);
                    const followerNode = this.nodes.get(followerId);
                    if (followerNode.state !== 'follower') {
                        console.log(`📊 Node ${followerId} receiving heartbeats, marking as follower`);
                        followerNode.state = 'follower';
                    }
                    followerNode.lastActivity = Date.now();
                });
                break;
        }
    }
    
    /**
     * Get event category for styling
     * @param {string} eventType - Event type
     * @returns {string} Category
     */
    getEventCategory(eventType) {
        switch (eventType) {
            case 'LeaderElected':
            case 'ElectionTimeout':
                return 'leader-election';
            case 'StateChange':
                return 'state-change';
            case 'HeartbeatSent':
                return 'heartbeat';
            case 'MessageSent':
                return 'message';
            case 'MessageReceived':
                return 'message';
            case 'LogEntryProposed':
                return 'proposal';
            case 'LogEntryAdded':
            case 'ClientCommandReceived':
                return 'log-entry';
            case 'LogEntryReplicated':
            case 'LogEntryCommitted':
                return 'consensus';
            default:
                return 'general';
        }
    }
    
    /**
     * Format event message for display
     * @param {Object} event - Raft event
     * @returns {string} Formatted message
     */
    formatEventMessage(event) {
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
            term = event.term || this.statistics.currentTerm;
        } else {
            return `Unknown event format: ${JSON.stringify(event).substring(0, 100)}...`;
        }
        
        // Debug: Uncomment to debug event message formatting
        // console.log('📝 Formatting event message:', { eventType, eventData, nodeId, term });
        
        switch (eventType) {
            case 'StateChange':
                const oldState = eventData?.from_state || eventData?.old_state || 'unknown';
                const newState = eventData?.to_state || eventData?.new_state || 'unknown';
                return `Node ${nodeId} changed from ${oldState} to ${newState} (term ${term})`;
            
            case 'LeaderElected':
                const votes = eventData?.votes_received || 0;
                const totalNodes = eventData?.total_votes || eventData?.total_nodes || 0;
                return `Node ${nodeId} elected as leader with ${votes}/${totalNodes} votes (term ${term})`;
            
            case 'ElectionTimeout':
                return `Node ${nodeId} election timeout in state ${eventData?.current_state || 'unknown'} (term ${term})`;
            
            case 'LogEntryProposed':
                const proposedCommand = eventData?.command || 'unknown';
                const proposedIndex = eventData?.proposed_index || 0;
                const requiredAcks = eventData?.required_acks || 0;
                return `Node ${nodeId} proposed "${proposedCommand}" at index ${proposedIndex} (needs ${requiredAcks} acks, term ${term})`;
            
            case 'LogEntryAdded':
                const command = eventData?.command || 'unknown';
                const logIndex = eventData?.log_index || 0;
                return `Node ${nodeId} added log entry "${command}" at index ${logIndex} (term ${term})`;
            
            case 'LogEntryReplicated':
                const replicatedIndex = eventData?.log_index || 0;
                return `Node ${nodeId} replicated entry at index ${replicatedIndex} (term ${term})`;
            
            case 'LogEntryCommitted':
                const committedCommand = eventData?.command || 'unknown';
                const committedIndex = eventData?.log_index || 0;
                return `Node ${nodeId} committed "${committedCommand}" at index ${committedIndex} (term ${term})`;
            
            case 'MessageSent':
                const messageType = eventData?.message_type || 'message';
                const fromNode = eventData?.from || nodeId;
                const toNode = eventData?.to || 0;
                
                if (messageType === 'AppendEntriesRequest') {
                    const details = eventData?.message_details || '';
                    if (details.includes('Proposal') || details.includes('proposal')) {
                        return `Node ${fromNode} sent proposal message to Node ${toNode} (term ${term})`;
                    } else {
                        return `Node ${fromNode} sent replication message to Node ${toNode} (term ${term})`;
                    }
                } else if (messageType === 'AppendEntriesResponse') {
                    const details = eventData?.message_details || '';
                    if (details.includes('ACK') || details.includes('ack')) {
                        return `Node ${fromNode} sent acknowledgment to Node ${toNode} (term ${term})`;
                    } else {
                        return `Node ${fromNode} sent response to Node ${toNode} (term ${term})`;
                    }
                } else {
                    return `Node ${fromNode} sent ${messageType} to Node ${toNode} (term ${term})`;
                }
            
            case 'HeartbeatSent':
                const leaderId = eventData?.leader_id || nodeId;
                const followers = eventData?.followers?.length || 0;
                return `Node ${leaderId} sent heartbeat to ${followers} followers (term ${term})`;
            
            case 'ClientCommandReceived':
                const clientCommand = eventData?.command || 'unknown';
                const accepted = eventData?.accepted ? 'accepted' : 'rejected';
                return `Node ${nodeId} ${accepted} client command "${clientCommand}" (term ${term})`;
            
            case 'ClusterStatus':
                const clusterTotalNodes = eventData?.total_nodes || 0;
                const activeNodes = eventData?.active_nodes || 0;
                return `Cluster status: ${activeNodes}/${clusterTotalNodes} nodes active (term ${term})`;
            
            default:
                // Debug: Uncomment to debug unhandled events
                // console.warn('🔍 Unhandled event type in formatEventMessage:', eventType, eventData);
                
                // Special handling for events that might not match exact case
                if (eventType && eventType.toLowerCase().includes('messagesent')) {
                    const messageType = eventData?.message_type || 'message';
                    const fromNode = eventData?.from || nodeId;
                    const toNode = eventData?.to || 0;
                    
                    if (messageType === 'AppendEntriesRequest') {
                        const details = eventData?.message_details || '';
                        if (details.includes('Proposal') || details.includes('proposal')) {
                            return `Node ${fromNode} sent proposal message to Node ${toNode} (term ${term})`;
                        } else {
                            return `Node ${fromNode} sent replication message to Node ${toNode} (term ${term})`;
                        }
                    } else if (messageType === 'AppendEntriesResponse') {
                        const details = eventData?.message_details || '';
                        if (details.includes('ACK') || details.includes('ack')) {
                            return `Node ${fromNode} sent acknowledgment to Node ${toNode} (term ${term})`;
                        } else {
                            return `Node ${fromNode} sent response to Node ${toNode} (term ${term})`;
                        }
                    }
                }
                
                return `Node ${nodeId}: ${eventType} (term ${term})`;
        }
    }
    
    /**
     * Add event to timeline
     * @param {Object} event - Timeline event
     */
    addTimelineEvent(event) {
        // Check if heartbeat events should be filtered out before adding to history
        const showHeartbeats = this.elements.showHeartbeatEvents?.checked ?? true;
        const showReplications = this.elements.showReplicationEvents?.checked ?? true;
        
        // If heartbeats are filtered out and this is a heartbeat event, don't add it to history at all
        if (!showHeartbeats && this.isHeartbeatEvent(event)) {
            return; // Skip adding this event entirely
        }
        
        // If replications are filtered out and this is a replication event, don't add it to history at all
        if (!showReplications && this.isReplicationEvent(event)) {
            return; // Skip adding this event entirely
        }
        
        this.eventHistory.unshift(event);
        
        // Limit history size
        if (this.eventHistory.length > this.maxEventHistory) {
            this.eventHistory = this.eventHistory.slice(0, this.maxEventHistory);
        }
        
        this.updateTimelineDisplay();
    }
    
    /**
     * Handle heartbeat filter checkbox change
     */
    handleHeartbeatFilterChange() {
        const showHeartbeats = this.elements.showHeartbeatEvents?.checked ?? true;
        
        if (!showHeartbeats) {
            // Filter out heartbeat events from existing history
            this.eventHistory = this.eventHistory.filter(event => !this.isHeartbeatEvent(event));
            console.log('🔽 Filtered out heartbeat events from timeline history');
        }
        
        // Update display
        this.updateTimelineDisplay();
    }
    
    /**
     * Handle replication filter checkbox change
     */
    handleReplicationFilterChange() {
        const showReplications = this.elements.showReplicationEvents?.checked ?? true;
        console.error('🔽 REPLICATION FILTER CHANGED:', showReplications);
        
        // TEMPORARY: Disable filtering to test if this causes message flood
        console.error('🔽 TEMPORARY: Filtering disabled to test message flood');
        /*
        if (!showReplications) {
            // Filter out replication/ACK events from existing history
            this.eventHistory = this.eventHistory.filter(event => !this.isReplicationEvent(event));
            console.log('🔽 Filtered out replication/ACK events from timeline');
        }
        */
        
        // Update timeline display only
        this.updateTimelineDisplay();
    }
    
    /**
     * Update timeline display
     */
    updateTimelineDisplay() {
        if (!this.elements.eventTimeline) return;
        
        const timeline = this.elements.eventTimeline;
        timeline.innerHTML = '';
        
        // Display all events in history (filtering is already done when adding events)
        this.eventHistory.forEach(event => {
            const eventElement = document.createElement('div');
            eventElement.className = `timeline-event ${event.type}`;
            
            const timeElement = document.createElement('div');
            timeElement.className = 'event-time';
            timeElement.textContent = new Date(event.timestamp).toLocaleTimeString();
            
            const messageElement = document.createElement('div');
            messageElement.className = 'event-description';
            messageElement.textContent = event.message;
            
            eventElement.appendChild(timeElement);
            eventElement.appendChild(messageElement);
            timeline.appendChild(eventElement);
        });
        
        // Auto-scroll to top
        timeline.scrollTop = 0;
    }
    
    /**
     * Check if an event is a heartbeat-related event
     * @param {Object} event - Timeline event
     * @returns {boolean} True if it's a heartbeat event
     */
    isHeartbeatEvent(event) {
        // Check if the event message contains heartbeat-related keywords
        const message = event.message.toLowerCase();
        return message.includes('heartbeat') || 
               message.includes('sent heartbeat') ||
               message.includes('heartbeats');
    }
    
    /**
     * Check if an event is a replication/ACK-related event
     * @param {Object} event - Timeline event
     * @returns {boolean} True if it's a replication/ACK event
     */
    isReplicationEvent(event) {
        // Check if the event message contains replication/ACK-related keywords
        const message = event.message.toLowerCase();
        return message.includes('replication') || 
               message.includes('acknowledgment') ||
               message.includes('acknowledge') ||
               message.includes('ack') ||
               message.includes('sent replication message') ||
               message.includes('sent response') ||
               message.includes('sent appendentries') ||
               message.includes('appendentries');
    }
    
    /**
     * Update statistics display
     */
    updateStatistics() {
        console.log('🔄 Attempting to update statistics display...');
        
        // Update each statistic with detailed logging
        if (this.elements.totalMessages) {
            const oldValue = this.elements.totalMessages.textContent;
            this.elements.totalMessages.textContent = this.statistics.totalMessages;
            console.log(`📊 totalMessages: ${oldValue} → ${this.statistics.totalMessages}`);
        } else {
            console.warn('⚠️ totalMessages element not found!');
        }
        
        if (this.elements.leaderElections) {
            const oldValue = this.elements.leaderElections.textContent;
            this.elements.leaderElections.textContent = this.statistics.leaderElections;
            console.log(`📊 leaderElections: ${oldValue} → ${this.statistics.leaderElections}`);
        } else {
            console.warn('⚠️ leaderElections element not found!');
        }
        
        if (this.elements.logEntries) {
            const oldValue = this.elements.logEntries.textContent;
            this.elements.logEntries.textContent = this.statistics.logEntries;
            console.log(`📊 logEntries: ${oldValue} → ${this.statistics.logEntries}`);
        } else {
            console.warn('⚠️ logEntries element not found!');
        }
        
        if (this.elements.currentTerm) {
            const oldValue = this.elements.currentTerm.textContent;
            this.elements.currentTerm.textContent = this.statistics.currentTerm;
            console.log(`📊 currentTerm: ${oldValue} → ${this.statistics.currentTerm}`);
        } else {
            console.warn('⚠️ currentTerm element not found!');
        }
        
        // Force DOM repaint
        if (this.elements.totalMessages) {
            this.elements.totalMessages.style.color = this.elements.totalMessages.style.color || '';
        }
        
        console.log('📊 Statistics display update completed:', {
            totalMessages: this.statistics.totalMessages,
            leaderElections: this.statistics.leaderElections,
            logEntries: this.statistics.logEntries,
            currentTerm: this.statistics.currentTerm
        });
    }
    
    /**
     * Update nodes display
     */
    updateNodesDisplay() {
        if (!this.elements.nodesList) return;
        
        const nodesList = this.elements.nodesList;
        nodesList.innerHTML = '';
        
        // Sort nodes by ID
        const sortedNodes = Array.from(this.nodes.values()).sort((a, b) => a.id - b.id);
        
        if (sortedNodes.length === 0) {
            // Show placeholder when no nodes are available
            const placeholder = document.createElement('div');
            placeholder.className = 'no-nodes-placeholder';
            placeholder.textContent = 'Waiting for cluster data...';
            nodesList.appendChild(placeholder);
            return;
        }
        
        sortedNodes.forEach(node => {
            const nodeCard = this.createNodeCard(node);
            nodesList.appendChild(nodeCard);
        });
        
        console.log(`📊 Updated display for ${sortedNodes.length} nodes`);
    }
    
    /**
     * Create node card element
     * @param {Object} node - Node data
     * @returns {HTMLElement} Node card element
     */
    createNodeCard(node) {
        const card = document.createElement('div');
        card.className = `node-card ${node.state}`;
        
        const header = document.createElement('div');
        header.className = 'node-header';
        
        const nodeId = document.createElement('div');
        nodeId.className = 'node-id';
        nodeId.textContent = `Node ${node.id}`;
        
        const nodeState = document.createElement('div');
        nodeState.className = `node-state ${node.state}`;
        nodeState.textContent = node.state;
        
        header.appendChild(nodeId);
        header.appendChild(nodeState);
        
        const details = document.createElement('div');
        details.className = 'node-details';
        
        const detailItems = [
            { label: 'Term', value: node.term },
            { label: 'Log Size', value: node.logSize },
            { label: 'Commit Index', value: node.commitIndex },
            { label: 'Votes', value: node.votes }
        ];
        
        detailItems.forEach(item => {
            const detailItem = document.createElement('div');
            detailItem.className = 'detail-item';
            
            const label = document.createElement('span');
            label.className = 'detail-label';
            label.textContent = item.label + ':';
            
            const value = document.createElement('span');
            value.className = 'detail-value';
            value.textContent = item.value;
            
            detailItem.appendChild(label);
            detailItem.appendChild(value);
            details.appendChild(detailItem);
        });
        
        card.appendChild(header);
        card.appendChild(details);
        
        return card;
    }
    
    /**
     * Show notification to user
     * @param {string} message - Notification message
     * @param {string} type - Notification type (success, warning, error, info)
     */
    showNotification(message, type = 'info') {
        // Simple console notification for now
        // In a full implementation, this would show a toast or modal
        console.log(`${type.toUpperCase()}: ${message}`);
        
        // You could implement a toast notification system here
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'success' ? '#51cf66' : type === 'warning' ? '#ffd43b' : type === 'error' ? '#ff6b6b' : '#74c0fc'};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 1000;
            font-weight: 500;
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }
    
    /**
     * Start periodic updates
     */
    startPeriodicUpdates() {
        // Update displays every 2 seconds to avoid spam
        setInterval(() => {
            this.updateStatistics();
            this.updateNodesDisplay();
        }, 2000);
        
        // Initial display update
        setTimeout(() => {
            this.updateStatistics();
            this.updateNodesDisplay();
        }, 100);
    }
    
    /**
     * Simple event system
     */
    emit(eventType, data) {
        // Placeholder for event emission to main app
        const event = new CustomEvent(`dashboard_${eventType}`, { detail: data });
        document.dispatchEvent(event);
    }
    
    /**
     * Get current dashboard state
     */
    getState() {
        return {
            statistics: { ...this.statistics },
            nodeCount: this.nodes.size,
            eventCount: this.eventHistory.length,
            uptime: Date.now() - this.statistics.startTime
        };
    }
}

// Export for use in other modules
window.RaftDashboard = RaftDashboard;