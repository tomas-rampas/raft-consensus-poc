/**
 * Clean Raft Visualization Application
 * Focuses on three core communication types: Elections, Proposals, Heartbeats
 */

class CleanRaftApp {
    constructor() {
        this.wsManager = null;
        this.visualization = null;
        this.classifier = null;
        this.nodes = new Map();
        this.stats = {
            elections: 0,
            proposals: 0,
            heartbeats: 0,
            currentTerm: 0,
            currentLeader: null,
            activeNodes: 0
        };
        this.isPaused = false;
        this.isReady = false;
        
        console.log('🚀 Initializing Clean Raft Application...');
        this.init();
    }
    
    async init() {
        try {
            // Wait for DOM
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve);
                });
            }
            
            console.log('📋 DOM ready, initializing components...');
            
            // Initialize core components
            await this.setupWebSocket();
            await this.setupVisualization();
            await this.setupEventHandlers();
            await this.setupUI();
            
            this.isReady = true;
            console.log('✅ Clean Raft Application ready!');
            
        } catch (error) {
            console.error('❌ Failed to initialize Clean Raft Application:', error);
            this.showError('Failed to initialize application');
        }
    }
    
    async setupWebSocket() {
        console.log('🔌 Setting up WebSocket connection...');
        
        this.wsManager = new WebSocketManager('ws://127.0.0.1:8082');
        
        this.wsManager.onMessage = (event) => {
            this.handleRaftEvent(event);
        };
        
        this.wsManager.onConnectionChange = (connected) => {
            this.updateConnectionStatus(connected);
        };
        
        this.wsManager.connect();
    }
    
    async setupVisualization() {
        console.log('🎨 Setting up visualization system...');
        
        // Initialize V2 visualization
        this.visualization = new RaftVisualizationV2('clusterCanvas');
        
        // Initialize message classifier
        this.classifier = new RaftMessageClassifier();
        
        console.log('✅ Visualization system ready');
    }
    
    async setupEventHandlers() {
        console.log('⚡ Setting up event handlers...');
        
        // Communication type toggles
        this.setupCommunicationToggles();
        
        // Control buttons
        this.setupControlButtons();
        
        // Action buttons
        this.setupActionButtons();
        
        console.log('✅ Event handlers configured');
    }
    
    setupCommunicationToggles() {
        const electionsToggle = document.getElementById('showElections');
        const proposalsToggle = document.getElementById('showProposals');
        const heartbeatsToggle = document.getElementById('showHeartbeats');
        
        if (electionsToggle) {
            electionsToggle.addEventListener('change', (e) => {
                this.visualization?.updateSettings({ showElections: e.target.checked });
                console.log('🗳️ Elections display:', e.target.checked ? 'enabled' : 'disabled');
            });
        }
        
        if (proposalsToggle) {
            proposalsToggle.addEventListener('change', (e) => {
                this.visualization?.updateSettings({ showProposals: e.target.checked });
                console.log('📝 Proposals display:', e.target.checked ? 'enabled' : 'disabled');
            });
        }
        
        if (heartbeatsToggle) {
            heartbeatsToggle.addEventListener('change', (e) => {
                this.visualization?.updateSettings({ showHeartbeats: e.target.checked });
                console.log('💓 Heartbeats display:', e.target.checked ? 'enabled' : 'disabled');
            });
        }
    }
    
    setupControlButtons() {
        // Pause/Resume button
        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => {
                this.isPaused = !this.isPaused;
                this.visualization?.setPaused(this.isPaused);
                
                const icon = pauseBtn.querySelector('.btn-icon');
                const text = pauseBtn.querySelector('.btn-text');
                
                if (this.isPaused) {
                    icon.textContent = '▶️';
                    text.textContent = 'Resume';
                } else {
                    icon.textContent = '⏸️';
                    text.textContent = 'Pause';
                }
                
                console.log('⏸️ Visualization', this.isPaused ? 'paused' : 'resumed');
            });
        }
        
        // Clear button
        const clearBtn = document.getElementById('clearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.classifier?.resetStatistics();
                this.resetStatistics();
                console.log('🧹 Statistics cleared');
            });
        }
    }
    
    setupActionButtons() {
        // Command submission
        const commandInput = document.getElementById('commandInput');
        const submitBtn = document.getElementById('submitBtn');
        
        const submitCommand = () => {
            if (!commandInput || !this.wsManager?.isConnected) return;
            
            const command = commandInput.value.trim();
            if (!command) return;
            
            console.log('📤 Submitting proposal command:', command);
            this.wsManager.send({
                type: 'submit_command',
                command: command
            });
            
            commandInput.value = '';
        };
        
        if (submitBtn) {
            submitBtn.addEventListener('click', submitCommand);
        }
        
        if (commandInput) {
            commandInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    submitCommand();
                }
            });
        }
        
        // Election trigger
        const triggerElectionBtn = document.getElementById('triggerElectionBtn');
        if (triggerElectionBtn) {
            triggerElectionBtn.addEventListener('click', () => {
                console.log('🗳️ Triggering manual election...');
                this.wsManager?.send({
                    type: 'trigger_election'
                });
            });
        }
    }
    
    async setupUI() {
        console.log('🖥️ Setting up UI components...');
        
        // Hide canvas overlay initially
        this.hideCanvasOverlay();
        
        // Initialize 5 nodes for cluster information display
        this.initializeClusterNodes();
        
        // Start statistics update timer
        setInterval(() => {
            this.updateStatisticsDisplay();
        }, 1000);
        
        console.log('✅ UI setup complete');
    }
    
    handleRaftEvent(event) {
        if (!this.isReady || !event) return;
        
        try {
            // Process event through visualization
            if (this.visualization) {
                this.visualization.processEvent(event);
            }
            
            // Classify message for statistics
            const messageType = this.classifier?.classify(event);
            if (messageType) {
                this.updateMessageStats(messageType);
            }
            
            // Update cluster information
            this.updateClusterInfo(event);
            
            // Update node information
            this.updateNodeInfo(event);
            
        } catch (error) {
            console.error('❌ Error handling Raft event:', error, event);
        }
    }
    
    updateMessageStats(messageType) {
        switch (messageType) {
            case 'election':
                this.stats.elections++;
                break;
            case 'proposal':
                this.stats.proposals++;
                break;
            case 'heartbeat':
                this.stats.heartbeats++;
                break;
        }
    }
    
    updateClusterInfo(event) {
        // Update current term
        if (event.term && event.term > this.stats.currentTerm) {
            this.stats.currentTerm = event.term;
        }
        
        // Check for leader election events
        const eventType = typeof event.event_type === 'string' 
            ? event.event_type 
            : event.event_type?.type;
            
        if (eventType === 'LeaderElected') {
            this.stats.currentLeader = event.event_type.leader_id ?? event.node_id;
        } else if (eventType === 'ClusterStatus') {
            // Handle cluster status response from query_cluster_state
            this.stats.currentLeader = event.event_type.leader_id;
            this.stats.currentTerm = event.event_type.current_term;
            this.stats.activeNodes = event.event_type.active_nodes;
            console.log('📊 Updated cluster info from status query:', {
                leader: this.stats.currentLeader,
                term: this.stats.currentTerm,
                nodes: this.stats.activeNodes
            });
        }
    }
    
    updateNodeInfo(event) {
        const eventType = typeof event.event_type === 'string' 
            ? event.event_type 
            : event.event_type?.type;
            
        if (eventType === 'StateChange') {
            const nodeData = {
                id: event.node_id,
                state: event.event_type.to_state || 'Follower',
                term: event.term || 0
            };
            
            // Update visualization
            this.visualization?.updateNode(nodeData);
            
            // Update local nodes tracking
            this.nodes.set(event.node_id, nodeData);
            this.stats.activeNodes = this.nodes.size;
            
            // Update nodes display
            this.updateNodesDisplay();
        }
    }
    
    updateConnectionStatus(connected) {
        const statusDot = document.getElementById('statusDot');
        const connectionText = document.getElementById('connectionText');
        const canvasOverlay = document.getElementById('canvasOverlay');
        
        if (statusDot) {
            statusDot.className = `status-dot ${connected ? 'connected' : ''}`;
        }
        
        if (connectionText) {
            connectionText.textContent = connected ? 'Connected' : 'Disconnected';
        }
        
        if (canvasOverlay) {
            if (connected) {
                this.hideCanvasOverlay();
            } else {
                this.showCanvasOverlay('Connecting to cluster...', '🔄');
            }
        }
        
        console.log('🔌 WebSocket', connected ? 'connected' : 'disconnected');
    }
    
    showCanvasOverlay(text = 'Loading...', icon = '🔄') {
        const overlay = document.getElementById('canvasOverlay');
        const overlayText = overlay?.querySelector('.overlay-text');
        const overlayIcon = overlay?.querySelector('.overlay-icon');
        
        if (overlay) {
            overlay.classList.remove('hidden');
        }
        
        if (overlayText) {
            overlayText.textContent = text;
        }
        
        if (overlayIcon) {
            overlayIcon.textContent = icon;
        }
    }
    
    hideCanvasOverlay() {
        const overlay = document.getElementById('canvasOverlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }
    
    updateStatisticsDisplay() {
        // Update communication stats
        this.updateElement('electionCount', this.stats.elections);
        this.updateElement('proposalCount', this.stats.proposals);
        this.updateElement('heartbeatCount', this.stats.heartbeats);
        
        // Update cluster stats  
        this.updateElement('currentTerm', this.stats.currentTerm);
        this.updateElement('currentLeader', this.stats.currentLeader ?? '-');
        this.updateElement('activeNodes', this.stats.activeNodes);
        
        // Get stats from classifier if available
        if (this.classifier) {
            const classifierStats = this.classifier.getStatistics();
            this.updateElement('electionCount', classifierStats.electionMessages || this.stats.elections);
            this.updateElement('proposalCount', classifierStats.proposalMessages || this.stats.proposals);
            this.updateElement('heartbeatCount', classifierStats.heartbeatMessages || this.stats.heartbeats);
        }
    }
    
    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value.toString();
        }
    }
    
    updateNodesDisplay() {
        const nodesGrid = document.getElementById('nodesGrid');
        if (!nodesGrid) return;
        
        // Clear existing nodes
        nodesGrid.innerHTML = '';
        
        // Sort nodes by ID
        const sortedNodes = Array.from(this.nodes.values()).sort((a, b) => a.id - b.id);
        
        sortedNodes.forEach(node => {
            const nodeCard = this.createNodeCard(node);
            nodesGrid.appendChild(nodeCard);
        });
    }
    
    createNodeCard(node) {
        const card = document.createElement('div');
        card.className = `node-card ${node.state.toLowerCase()}`;
        
        const stateIcons = {
            'Leader': '👑',
            'Candidate': '🗳️',
            'Follower': '👥'
        };
        
        card.innerHTML = `
            <div class="node-header">
                <div class="node-title">
                    <span class="node-icon">${stateIcons[node.state] || '⚪'}</span>
                    <h3>Node ${node.id}</h3>
                </div>
                <span class="node-state ${node.state.toLowerCase()}">${node.state}</span>
            </div>
            <div class="node-details">
                <div class="detail-item">
                    <span class="detail-label">Term</span>
                    <span class="detail-value">${node.term}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">ID</span>
                    <span class="detail-value">${node.id}</span>
                </div>
            </div>
        `;
        
        return card;
    }
    
    initializeClusterNodes() {
        // Initialize 5 nodes for cluster information display
        for (let i = 0; i < 5; i++) {
            const nodeData = {
                id: i,
                state: 'Follower',
                term: 0
            };
            this.nodes.set(i, nodeData);
        }
        
        this.stats.activeNodes = 5;
        this.updateNodesDisplay();
        console.log('🏛️ Initialized cluster information with 5 nodes');
    }
    
    resetStatistics() {
        this.stats = {
            elections: 0,
            proposals: 0,
            heartbeats: 0,
            currentTerm: this.stats.currentTerm, // Keep current term
            currentLeader: this.stats.currentLeader, // Keep current leader
            activeNodes: this.stats.activeNodes // Keep active nodes count
        };
    }
    
    showError(message) {
        console.error('❌ Application Error:', message);
        this.showCanvasOverlay(`Error: ${message}`, '⚠️');
    }
}

// Initialize the application
console.log('🌟 Starting Clean Raft Visualization Application...');
window.raftApp = new CleanRaftApp();