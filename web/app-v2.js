/**
 * Clean Raft Visualization App V2
 * Simplified interface focusing on three core communication types
 */

class RaftAppV2 {
    constructor() {
        this.wsManager = null;
        this.visualization = null;
        this.classifier = null;
        this.isReady = false;
        this.stats = {
            electionMessages: 0,
            proposalMessages: 0,
            heartbeatMessages: 0,
            currentTerm: 0
        };
        this.nodes = new Map();
        
        console.log('🚀 Initializing Clean Raft App V2...');
        this.init();
    }
    
    async init() {
        try {
            // Wait for DOM to be fully ready
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve);
                });
            }
            
            console.log('📋 DOM ready, setting up components...');
            
            // Initialize components
            this.setupWebSocket();
            this.setupVisualization();
            this.setupEventHandlers();
            this.setupStatisticsDisplay();
            
            this.isReady = true;
            console.log('✅ Clean Raft App V2 initialization complete!');
            
        } catch (error) {
            console.error('❌ Failed to initialize Clean Raft App V2:', error);
        }
    }
    
    setupWebSocket() {
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
    
    setupVisualization() {
        console.log('🎨 Setting up clean visualization...');
        
        // Initialize the V2 visualization system
        this.visualization = new RaftVisualizationV2('clusterCanvas');
        
        // Set up message classifier for statistics
        this.classifier = new RaftMessageClassifier();
    }
    
    setupEventHandlers() {
        console.log('⚡ Setting up event handlers...');
        
        // Communication type checkboxes
        const electionsCheckbox = document.getElementById('showElections');
        const proposalsCheckbox = document.getElementById('showProposals');
        const heartbeatsCheckbox = document.getElementById('showHeartbeats');
        
        if (electionsCheckbox) {
            electionsCheckbox.addEventListener('change', (e) => {
                this.visualization?.updateSettings({ showElections: e.target.checked });
                console.log('🗳️ Elections display:', e.target.checked ? 'enabled' : 'disabled');
            });
        }
        
        if (proposalsCheckbox) {
            proposalsCheckbox.addEventListener('change', (e) => {
                this.visualization?.updateSettings({ showProposals: e.target.checked });
                console.log('📝 Proposals display:', e.target.checked ? 'enabled' : 'disabled');
            });
        }
        
        if (heartbeatsCheckbox) {
            heartbeatsCheckbox.addEventListener('change', (e) => {
                this.visualization?.updateSettings({ showHeartbeats: e.target.checked });
                console.log('💓 Heartbeats display:', e.target.checked ? 'enabled' : 'disabled');
            });
        }
        
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
        
        // Manual election trigger
        const triggerElectionBtn = document.getElementById('triggerElectionBtn');
        if (triggerElectionBtn) {
            triggerElectionBtn.addEventListener('click', () => {
                console.log('🗳️ Triggering manual election...');
                this.wsManager?.send({
                    type: 'trigger_election'
                });
            });
        }
        
        // Pause/resume
        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) {
            let isPaused = false;
            pauseBtn.addEventListener('click', () => {
                isPaused = !isPaused;
                this.visualization?.setPaused(isPaused);
                pauseBtn.textContent = isPaused ? '▶️ Resume' : '⏸️ Pause';
                console.log('⏸️ Visualization', isPaused ? 'paused' : 'resumed');
            });
        }
    }
    
    setupStatisticsDisplay() {
        console.log('📊 Setting up statistics display...');
        
        // Initialize all stat displays to 0
        this.updateStatistics();
        
        // Update statistics every 2 seconds
        setInterval(() => {
            this.updateStatistics();
        }, 2000);
    }
    
    handleRaftEvent(event) {
        if (!this.isReady || !event) return;
        
        try {
            // Update visualization with the event
            if (this.visualization) {
                this.visualization.processEvent(event);
            }
            
            // Classify message for statistics
            const messageType = this.classifier.classify(event);
            
            // Update statistics
            switch (messageType) {
                case 'election':
                    this.stats.electionMessages++;
                    break;
                case 'proposal':
                    this.stats.proposalMessages++;
                    break;
                case 'heartbeat':
                    this.stats.heartbeatMessages++;
                    break;
            }
            
            // Update term if available
            if (event.term && event.term > this.stats.currentTerm) {
                this.stats.currentTerm = event.term;
            }
            
            // Update node information if this is a state change event
            if (event.event_type && (typeof event.event_type === 'string' ? 
                event.event_type === 'StateChange' : 
                event.event_type.type === 'StateChange')) {
                
                const nodeData = {
                    id: event.node_id,
                    state: event.event_type.to_state || 'Follower',
                    term: event.term || 0
                };
                
                // Update visualization
                this.visualization?.updateNode(nodeData);
                
                // Update nodes tracking
                this.nodes.set(event.node_id, nodeData);
                this.updateNodesDisplay();
            }
            
        } catch (error) {
            console.error('❌ Error handling Raft event:', error, event);
        }
    }
    
    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connectionStatus');
        const indicatorElement = document.getElementById('statusIndicator');
        const textElement = document.getElementById('connectionText');
        
        if (statusElement && indicatorElement && textElement) {
            if (connected) {
                statusElement.className = 'connection-status connected';
                indicatorElement.className = 'status-indicator connected';
                textElement.textContent = 'Connected';
                console.log('✅ WebSocket connected');
            } else {
                statusElement.className = 'connection-status disconnected';
                indicatorElement.className = 'status-indicator disconnected';
                textElement.textContent = 'Disconnected';
                console.log('❌ WebSocket disconnected');
            }
        }
    }
    
    updateStatistics() {
        // Update communication statistics
        this.updateStatElement('electionMessages', this.stats.electionMessages);
        this.updateStatElement('proposalMessages', this.stats.proposalMessages);  
        this.updateStatElement('heartbeatMessages', this.stats.heartbeatMessages);
        this.updateStatElement('currentTerm', this.stats.currentTerm);
        
        // Get statistics from visualization if available
        if (this.visualization) {
            const vizStats = this.visualization.getStatistics();
            if (vizStats) {
                this.updateStatElement('electionMessages', vizStats.electionMessages || this.stats.electionMessages);
                this.updateStatElement('proposalMessages', vizStats.proposalMessages || this.stats.proposalMessages);
                this.updateStatElement('heartbeatMessages', vizStats.heartbeatMessages || this.stats.heartbeatMessages);
            }
        }
    }
    
    updateStatElement(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value.toString();
        }
    }
    
    updateNodesDisplay() {
        const nodesList = document.getElementById('nodesList');
        if (!nodesList) return;
        
        // Clear and rebuild nodes list
        nodesList.innerHTML = '';
        
        // Sort nodes by ID
        const sortedNodes = Array.from(this.nodes.values()).sort((a, b) => a.id - b.id);
        
        sortedNodes.forEach(node => {
            const nodeCard = document.createElement('div');
            nodeCard.className = `node-card ${node.state.toLowerCase()}`;
            
            const stateEmoji = {
                'Leader': '👑',
                'Candidate': '🗳️',  
                'Follower': '👥'
            };
            
            nodeCard.innerHTML = `
                <div class="node-header">
                    <span class="node-icon">${stateEmoji[node.state] || '⚪'}</span>
                    <h3>Node ${node.id}</h3>
                </div>
                <div class="node-details">
                    <div class="node-detail">
                        <span class="detail-label">State:</span>
                        <span class="detail-value">${node.state}</span>
                    </div>
                    <div class="node-detail">
                        <span class="detail-label">Term:</span>
                        <span class="detail-value">${node.term}</span>
                    </div>
                </div>
            `;
            
            nodesList.appendChild(nodeCard);
        });
    }
}

// Initialize the clean app when DOM is ready
console.log('🌟 Starting Clean Raft Visualization App V2...');
window.app = new RaftAppV2();