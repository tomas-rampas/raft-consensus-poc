/**
 * Canvas-based Raft Cluster Visualization Engine
 * Renders nodes, connections, and real-time message flows
 */

class RaftVisualization {
    constructor(canvasId) {
        console.log('🎯 RaftVisualization constructor called with canvasId:', canvasId);
        this.canvas = document.getElementById(canvasId);
        console.log('🎯 Canvas element found:', this.canvas);
        this.ctx = this.canvas.getContext('2d');
        console.log('🎯 Canvas context created:', this.ctx);
        
        // Set up canvas
        console.log('🎯 Calling setupCanvas()...');
        this.setupCanvas();
        
        // Visualization state
        this.nodes = new Map();
        this.messages = [];
        this.animations = [];
        
        // Performance monitoring
        this.frameCount = 0;
        this.lastPerformanceCheck = Date.now();
        this.renderTimes = [];
        this.lastRenderTime = Date.now();
        
        // Emergency recovery
        this.setupEmergencyRecovery();
        
        // Message throttling
        this.lastMessageTime = 0;
        this.messageThrottleMs = 100; // Minimum 100ms between message animations
        
        // Animation settings
        this.isAnimating = true;
        this.lastFrameTime = 0;
        this.animationSpeed = 1.0;
        
        // Dual animation system
        this.animationId = null;
        this.fallbackTimer = null;
        this.useFallbackTimer = false;
        
        // Display settings
        this.showHeartbeats = true;
        this.showMessages = true;
        this.showNodeLabels = true;
        
        // Colors and styling
        this.colors = {
            leader: '#51cf66',
            candidate: '#ffd43b',
            follower: '#74c0fc',
            background: '#f8f9fa',
            grid: '#e9ecef',
            message: '#667eea',
            heartbeat: '#ff8cc8',
            vote: '#ffd43b',
            proposal: '#ff8a50',     // Orange for proposal messages
            replication: '#b8620a',  // Dark orange for replication messages
            ack: '#69db7c',         // Green for ACK messages
            text: '#333'
        };
        
        // Node layout - initialize with defaults, will be updated by setupCanvas()
        this.nodeRadius = 40;
        this.clusterRadius = 150;
        
        // Test basic canvas functionality first
        this.testBasicCanvas();
        
        // Start animation loop
        this.startAnimation();
        
        // Handle canvas clicks
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        
        // Handle window resize
        window.addEventListener('resize', () => this.handleResize());
        
        // Final check of center coordinates after constructor
        console.log('🎯 Constructor complete - final center:', this.centerX, this.centerY);
    }
    
    /**
     * Set up canvas properties
     */
    setupCanvas() {
        // Set up high DPI support
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        this.ctx.scale(dpr, dpr);
        
        // Update layout calculations
        this.centerX = rect.width / 2;
        this.centerY = rect.height / 2;
        
        console.log('🎯 Canvas layout updated:', {
            canvasWidth: this.canvas.width,
            canvasHeight: this.canvas.height,
            rectWidth: rect.width,
            rectHeight: rect.height,
            centerX: this.centerX,
            centerY: this.centerY,
            dpr: window.devicePixelRatio || 1
        });
        
        console.log('🎯 Final center coordinates set to:', this.centerX, this.centerY);
        
        // Verify that the coordinates are actually set
        if (this.centerX === 0 || this.centerY === 0) {
            console.error('❌ Center coordinates still zero after setupCanvas!');
        } else {
            console.log('✅ Center coordinates successfully updated');
        }
    }
    
    /**
     * Handle window resize
     */
    handleResize() {
        this.setupCanvas();
    }
    
    /**
     * Update node information
     * @param {number} nodeId - Node ID
     * @param {Object} nodeData - Node state data
     */
    updateNode(nodeId, nodeData) {
        console.log('🔄 Visualization updateNode called:', {
            nodeId,
            nodeData,
            existingNode: this.nodes.has(nodeId)
        });
        
        if (!this.nodes.has(nodeId)) {
            // Calculate position for new node
            const angle = (nodeId / 5) * 2 * Math.PI - Math.PI / 2; // Assume 5 nodes for now
            const x = this.centerX + Math.cos(angle) * this.clusterRadius;
            const y = this.centerY + Math.sin(angle) * this.clusterRadius;
            
            console.log(`🎯 Calculating position for node ${nodeId}:`, {
                angle: angle,
                centerX: this.centerX,
                centerY: this.centerY,
                clusterRadius: this.clusterRadius,
                finalX: x,
                finalY: y
            });
            
            const newNode = {
                id: nodeId,
                x: x,
                y: y,
                state: 'follower',
                term: 0,
                votes: 0,
                logSize: 0,
                commitIndex: 0,
                lastActivity: Date.now(),
                ...nodeData
            };
            
            this.nodes.set(nodeId, newNode);
            console.log('✅ Created new node:', newNode);
        } else {
            // Update existing node
            const node = this.nodes.get(nodeId);
            const oldState = node.state;
            
            // CRITICAL PROTECTION: Don't allow leader state to be overridden by follower
            if (oldState === 'leader' && nodeData.state === 'follower') {
                console.warn(`🔒 PROTECTION: Preventing leader Node ${nodeId} from being downgraded to follower without explicit StateChange`);
                // Keep the leader state but update other properties
                const { state, ...otherData } = nodeData;
                Object.assign(node, otherData);
                // Preserve leader state
                node.state = 'leader';
            } else {
                Object.assign(node, nodeData);
            }
            
            node.lastActivity = Date.now();
            
            console.log('✅ Updated existing node:', {
                nodeId,
                stateChange: `${oldState} → ${node.state}`,
                term: node.term,
                protection: oldState === 'leader' && nodeData.state === 'follower' ? 'LEADER_PROTECTED' : 'NORMAL',
                updatedNode: node
            });
        }
        
        console.log('🗺️ Current nodes in visualization:', Array.from(this.nodes.values()));
        
        // Force a render to see immediate changes
        this.render(performance.now());
    }
    
    /**
     * Add message animation for consensus flow
     * @param {Object} messageData - Message data
     */
    addConsensusMessage(messageData) {
        console.log('💌 Consensus message:', messageData);
        
        // Create message animations for consensus flow
        if (messageData.type === 'proposal_replication') {
            // Leader sending proposal to all followers
            const leaderNode = this.nodes.get(messageData.from);
            if (leaderNode) {
                messageData.targets.forEach(targetId => {
                    this.addMessage({
                        from: messageData.from,
                        to: targetId,
                        messageType: 'proposal',
                        details: messageData.command || 'proposal'
                    });
                });
            }
        } else if (messageData.type === 'proposal_ack') {
            // Follower sending ACK back to leader
            this.addMessage({
                from: messageData.from,
                to: messageData.to,
                messageType: 'ack',
                details: messageData.details || 'ack'
            });
        }
    }
    
    /**
     * Check if a message is proposal-related (should always be shown regardless of showMessages setting)
     * @param {Object} messageData - Message data
     * @returns {boolean} True if it's a proposal-related message
     */
    isProposalMessage(messageData) {
        const messageType = messageData.messageType || messageData.type || '';
        return messageType === 'proposal_broadcast' || 
               messageType === 'proposal_ack_success' || 
               messageType === 'proposal_ack_failure' ||
               messageType === 'consensus_ack_success' ||
               messageType === 'consensus_ack_failure' ||
               messageType === 'proposal' ||
               messageType === 'log_proposal' ||
               messageType === 'proposal_replication';
    }

    /**
     * Add message animation
     * @param {Object} messageData - Message data
     */
    addMessage(messageData) {
        console.error('🎯🎯🎯 CRITICAL DEBUG: addMessage called with:', messageData);
        
        // Determine message classification
        // Since backend doesn't always send hasLogEntries flag, treat all AppendEntriesRequest as replication
        // unless explicitly marked as heartbeat type
        const isHeartbeatType = messageData.messageType === 'heartbeat';
        const isReplicationMessage = messageData.messageType === 'AppendEntriesRequest';
        
        // Smart deduplication instead of simple throttling
        const now = Date.now();
        const messageKey = `${messageData.messageType}-${messageData.from}-${messageData.to}`;
        const debugKey = `${messageData.from}->${messageData.to}`;
        
        // DEBUG: Always log first message to each target to debug visual rendering
        if (!this.debuggedPairs) this.debuggedPairs = new Set();
        
        if (!this.debuggedPairs.has(debugKey) || Math.random() < 0.05) {
            console.error('🎯 VIZ addMessage:', messageData.messageType, 'from', messageData.from, 'to', messageData.to);
            if (!this.debuggedPairs.has(debugKey)) {
                this.debuggedPairs.add(debugKey);
                console.error('📍 First message for pair:', debugKey);
            }
        }
        
        if (!this.recentMessages) this.recentMessages = new Map();
        
        // Check if we recently added this exact message type/route
        const lastTime = this.recentMessages.get(messageKey);
        if (lastTime && (now - lastTime) < 200) { // 200ms deduplication window
            if (Math.random() < 0.01) { // Only log 1% of deduplicated messages
                console.warn('🚫 DEDUPLICATED:', messageData.messageType, 'from', messageData.from, 'to', messageData.to);
            }
            return;
        }
        
        // Clean up old entries (older than 1 second)
        if (this.recentMessages.size > 50) {
            for (const [key, time] of this.recentMessages.entries()) {
                if (now - time > 1000) {
                    this.recentMessages.delete(key);
                }
            }
        }
        
        // Emergency brake - if too many messages are active, only allow heartbeats
        if (this.messages.length > 50 && !isHeartbeatType) {
            if (Math.random() < 0.02) {
                console.warn('🚫 EMERGENCY BRAKE:', messageData.messageType, 'from', messageData.from, 'to', messageData.to, 'total:', this.messages.length);
            }
            return;
        }
        
        // Filter messages based on visualization settings
        // Filter heartbeat-type messages
        if (!this.showHeartbeats && isHeartbeatType) {
            if (Math.random() < 0.02) { // Only log 2% of filtered messages
                console.log('🚫 FILTERED BY showHeartbeats:', messageData.messageType);
            }
            return;
        }
        
        // Filter regular messages (excluding client commands and proposals which should always show)
        const isClientCommandType = messageData.messageType === 'client_command' || 
                                   messageData.from === 'client' || 
                                   messageData.from === 999; // Client ID from WebSocket commands
        const isProposalType = this.isProposalMessage(messageData);
        
        if (!this.showMessages && !isHeartbeatType && !isClientCommandType && !isProposalType) {
            if (Math.random() < 0.02) { // Only log 2% of filtered messages
                console.log('🚫 FILTERED BY showMessages (NOT proposal):', messageData.messageType);
            }
            return;
        }
        
        if (isProposalType) {
            console.log('🎯 PROPOSAL MESSAGE PRESERVED:', messageData.messageType);
        }
        
        const fromNode = this.nodes.get(messageData.from);
        const toNode = this.nodes.get(messageData.to);
        
        if (!fromNode || !toNode) {
            console.error('🚨 MISSING NODES for message:', {
                messageType: messageData.messageType,
                from: messageData.from,
                to: messageData.to,
                fromNodeExists: !!fromNode,
                toNodeExists: !!toNode,
                allNodes: Array.from(this.nodes.keys()),
                fromNodePos: fromNode ? `(${fromNode.x}, ${fromNode.y})` : 'N/A',
                toNodePos: toNode ? `(${toNode.x}, ${toNode.y})` : 'N/A'
            });
            return;
        }
        
        // Create message with appropriate duration based on type
        const messageType = messageData.messageType || 'message';
        let duration = 1000; // Default 1 second
        
        // Proposal messages are slightly slower to show the consensus process
        if (messageType === 'proposal' || messageType === 'log_proposal' || messageType === 'proposal_broadcast') {
            duration = 1200;
        }
        // ACK messages are faster to show quick response
        else if (messageType === 'ack' || messageType === 'proposal_ack' || messageType === 'ack_success' || messageType === 'ack_failure' || messageType === 'proposal_ack_success' || messageType === 'proposal_ack_failure' || messageType === 'consensus_ack_success' || messageType === 'consensus_ack_failure') {
            duration = 800;
        }
        
        const message = {
            id: Date.now() + Math.random(),
            from: messageData.from,
            to: messageData.to,
            type: messageType,
            startX: fromNode.x,
            startY: fromNode.y,
            endX: toNode.x,
            endY: toNode.y,
            currentX: fromNode.x,
            currentY: fromNode.y,
            progress: 0,
            startTime: Date.now(),
            duration: duration,
            color: this.getMessageColor(messageType),
            details: messageData.details || ''
        };
        
        this.messages.push(message);
        
        // Record this message in our deduplication map
        this.recentMessages.set(messageKey, now);
        
        // Debug: Log successful message addition with position info 
        if (!this.debuggedPairs.has(debugKey) || Math.random() < 0.02) {
            console.error('✅ MESSAGE ADDED:', {
                type: message.type,
                from: message.from,
                to: message.to,
                startPos: `(${message.startX}, ${message.startY})`,
                endPos: `(${message.endX}, ${message.endY})`,
                color: message.color,
                totalMessages: this.messages.length
            });
        }
        
        // Warning if too many messages accumulate
        if (this.messages.length > 50) {
            console.warn('⚠️ High message count detected:', this.messages.length);
        }
    }
    
    /**
     * Add client message animation (from outside the cluster)
     * @param {Object} messageData - Message data
     */
    addClientMessage(messageData) {
        console.log('📨 Visualization addClientMessage called:', messageData);
        
        // Client messages should always be visible regardless of filter settings
        // (They represent user actions and are important for understanding cluster behavior)
        
        const toNode = this.nodes.get(messageData.to);
        
        if (!toNode) {
            console.warn('❌ Cannot add client message - target node not found:', messageData.to);
            return;
        }
        
        // Calculate client position (outside the cluster circle)
        const clientX = this.centerX - 150; // To the left of the cluster
        const clientY = this.centerY;
        
        const message = {
            id: Date.now() + Math.random(),
            from: 'client',
            to: messageData.to,
            type: 'client_command',
            startX: clientX,
            startY: clientY,
            endX: toNode.x,
            endY: toNode.y,
            currentX: clientX,
            currentY: clientY,
            progress: 0,
            startTime: Date.now(),
            duration: 1500, // Slightly longer for client messages
            color: '#ff6b6b', // Red color for client messages
            command: messageData.command || 'command'
        };
        
        this.messages.push(message);
        
        console.log('✅ Added client message animation:', {
            messageId: message.id,
            to: message.to,
            command: message.command,
            totalMessages: this.messages.length
        });
    }
    
    /**
     * Get color for message type
     * @param {string} messageType - Type of message
     * @returns {string} Color hex code
     */
    getMessageColor(messageType) {
        let color;
        switch (messageType) {
            case 'heartbeat':
                color = this.colors.heartbeat; // Pink
                break;
            case 'AppendEntriesRequest':
                color = this.colors.heartbeat; // Pink (for heartbeat AppendEntries)
                break;
            case 'vote':
            case 'RequestVoteRequest':
                color = this.colors.vote; // Yellow
                break;
            case 'proposal':
            case 'log_proposal':
            case 'proposal_replication':
                color = this.colors.proposal; // Orange
                break;
            case 'ack':
            case 'proposal_ack':
                color = this.colors.ack; // Green
                break;
            case 'AppendEntriesResponse':
                color = this.colors.ack; // Green (for ACK responses)
                break;
            case 'client_command':
                color = this.colors.message; // Blue
                break;
            case 'client_command_accepted':
                color = '#51cf66'; // Green for accepted commands
                break;
            case 'client_command_rejected':
                color = '#ff6b6b'; // Red for rejected commands  
                break;
            case 'command_forward':
                color = '#ffd43b'; // Yellow for forwarding
                break;
            case 'proposal_broadcast':
                color = '#ff8a50'; // Orange for proposal broadcasts (distinct from replication)
                break;
            case 'replication':
                color = this.colors.replication; // Dark orange for replication
                break;
            case 'ack_success':
                color = this.colors.ack; // Green for successful ACK
                break;
            case 'ack_failure':
                color = '#ff6b6b'; // Red for failed ACK/NACK
                break;
            case 'proposal_ack_success':
                color = '#51cf66'; // Bright green for successful proposal ACK
                break;
            case 'proposal_ack_failure':
                color = '#ff4757'; // Bright red for failed proposal ACK
                break;
            case 'consensus_ack_success':
                color = '#00ff00'; // Bright neon green for consensus ACK success (most prominent)
                break;
            case 'consensus_ack_failure':
                color = '#ff0000'; // Bright neon red for consensus ACK failure (most prominent)
                break;
            default:
                color = this.colors.message; // Default blue
                break;
        }
        
        console.log(`🎨 MESSAGE COLOR: ${messageType} → ${color}`);
        return color;
    }
    
    /**
     * Add subtle heartbeat pulse animation (not prominent messages)
     * @param {number} leaderId - Leader node ID
     * @param {Array} followers - Array of follower node IDs
     */
    addHeartbeatPulse(leaderId, followers) {
        console.log('💓 Adding subtle heartbeat pulse:', { leaderId, followers });
        
        if (!this.showHeartbeats) {
            return;
        }
        
        const leaderNode = this.nodes.get(leaderId);
        if (!leaderNode) {
            console.warn('❌ Leader node not found for heartbeat pulse:', leaderId);
            return;
        }
        
        // Add subtle pulse animation to leader node (visual indication only)
        leaderNode.heartbeatPulse = Date.now();
        
        // Add very subtle message animations to followers if needed
        followers.forEach(followerId => {
            this.addMessage({
                from: leaderId,
                to: followerId,
                messageType: 'heartbeat',
                timestamp: Date.now(),
                subtle: true
            });
        });
        
        console.log(`💓 Added heartbeat pulse from Node ${leaderId} to ${followers.length} followers`);
    }
    
    /**
     * Add prominent replication message animation
     * @param {Object} messageData - Replication message data
     */
    addReplicationMessage(messageData) {
        console.log('📦 Adding prominent replication animation:', messageData);
        
        // Always show proposal-related replication, even if showMessages is false
        const isProposalType = this.isProposalMessage(messageData);
        
        if (!this.showMessages && !isProposalType) {
            console.log('🚫 FILTERED replication message (not proposal):', messageData.messageType);
            return;
        }
        
        if (isProposalType) {
            console.log('🎯 PROPOSAL REPLICATION PRESERVED:', messageData.messageType);
        }
        
        // Add prominent replication animation with special styling
        const replicationMsg = {
            ...messageData,
            messageType: 'replication',
            prominent: true  // Flag for special rendering
        };
        
        this.addMessage(replicationMsg);
        
        console.log(`📦 Added replication animation: ${messageData.from} → ${messageData.to} (${messageData.entriesCount} entries)`);
    }
    
    /**
     * Add ACK/NACK response animation
     * @param {Object} ackData - ACK response data
     */
    addAckMessage(ackData) {
        console.log('✅ addAckMessage called with:', ackData);
        
        // Always show proposal-related ACKs, even if showMessages is false
        const isProposalType = this.isProposalMessage(ackData);
        
        if (!this.showMessages && !isProposalType) {
            console.warn('❌ ACK message blocked by showMessages setting (not proposal):', this.showMessages);
            return;
        }
        
        if (isProposalType) {
            console.log('🎯 PROPOSAL ACK PRESERVED:', ackData.messageType);
        }
        
        // Verify nodes exist
        const fromNode = this.nodes.get(ackData.from);
        const toNode = this.nodes.get(ackData.to);
        
        if (!fromNode || !toNode) {
            console.error('❌ addAckMessage: Missing nodes!', {
                from: ackData.from,
                to: ackData.to,
                fromNode: !!fromNode,
                toNode: !!toNode,
                availableNodes: Array.from(this.nodes.keys())
            });
            return;
        }
        
        // Add ACK response animation with success/failure styling
        // Use different message types for consensus ACKs vs regular heartbeat ACKs
        let messageType;
        if (ackData.isConsensusAck) {
            // Consensus ACKs (step 3 of client command flow) - more prominent
            messageType = ackData.success ? 'consensus_ack_success' : 'consensus_ack_failure';
        } else {
            // Regular heartbeat ACKs - less prominent
            messageType = ackData.success ? 'proposal_ack_success' : 'proposal_ack_failure';
        }
        
        const ackMsg = {
            from: ackData.from,
            to: ackData.to,
            messageType,
            matchedIndex: ackData.matchedIndex,
            proposalIndex: ackData.proposalIndex,
            acksReceived: ackData.acksReceived,
            acksNeeded: ackData.acksNeeded,
            consensusAchieved: ackData.consensusAchieved,
            timestamp: ackData.timestamp || Date.now()
        };
        
        console.log('🎯 Creating ACK message object:', ackMsg);
        
        this.addMessage(ackMsg);
        
        console.log(`✅ Added ${ackData.success ? 'SUCCESS' : 'FAILED'} ACK animation: ${ackData.from} → ${ackData.to}`);
        console.log(`📊 Current messages in queue: ${this.messages.length}`);
    }
    
    /**
     * Add consensus achieved celebration animation
     * @param {Object} consensusData - Consensus achievement data
     */
    addConsensusAchievedAnimation(consensusData) {
        console.log('🎉 Adding consensus achievement animation:', consensusData);
        
        // Always show consensus animations (they are always proposal-related)
        if (!this.showMessages) {
            console.log('🎯 CONSENSUS ANIMATION PRESERVED despite showMessages=false');
        }
        
        const { leaderId, committedIndices, acknowledgedBy } = consensusData;
        
        // Add special celebration animation
        const leaderNode = this.nodes.get(leaderId);
        if (leaderNode) {
            // Add celebration pulse to leader
            leaderNode.consensusPulse = Date.now();
            leaderNode.lastConsensusIndices = committedIndices;
        }
        
        // Add celebration indicators to acknowledging nodes
        acknowledgedBy.forEach(nodeId => {
            const node = this.nodes.get(nodeId);
            if (node) {
                node.consensusParticipant = Date.now();
            }
        });
        
        console.log(`🎉 Added consensus celebration: Leader ${leaderId}, ${committedIndices.length} entries, ${acknowledgedBy.length} participants`);
    }

    /**
     * Start animation loop with dual-mode support
     */
    startAnimation() {
        console.log('🎬 Starting dual-mode animation loop...');
        
        // Clear any existing animation
        this.stopAnimation();
        
        // Start both requestAnimationFrame and fallback timer
        this.startRequestAnimationFrame();
        this.startFallbackTimer();
        
        console.log('✅ Dual animation system started');
    }
    
    /**
     * Start requestAnimationFrame loop
     */
    startRequestAnimationFrame() {
        const animate = (timestamp) => {
            try {
                // Only log every 60 frames to reduce console spam
                if (this.frameCount % 60 === 0) {
                    console.log('🎬 RAF tick - frame:', this.frameCount, 'isAnimating:', this.isAnimating, 'useFallback:', this.useFallbackTimer);
                }
                if (this.isAnimating && !this.useFallbackTimer) {
                    this.render(timestamp || performance.now());
                    this.animationId = requestAnimationFrame(animate);
                } else {
                    console.log('⏸️ RAF stopped - isAnimating:', this.isAnimating, 'useFallback:', this.useFallbackTimer);
                }
            } catch (error) {
                console.error('💥 RequestAnimationFrame crashed:', error);
                this.switchToFallbackTimer();
            }
        };
        
        this.animationId = requestAnimationFrame(animate);
        console.log('🎬 RequestAnimationFrame started:', this.animationId);
    }
    
    /**
     * Start fallback timer loop
     */
    startFallbackTimer() {
        this.fallbackTimer = setInterval(() => {
            try {
                // Only log every 60 ticks to reduce console spam
                if (this.frameCount % 60 === 0) {
                    console.log('⏰ Timer tick - frame:', this.frameCount, 'isAnimating:', this.isAnimating, 'useFallback:', this.useFallbackTimer);
                }
                if (this.isAnimating && this.useFallbackTimer) {
                    this.render(performance.now());
                }
            } catch (error) {
                console.error('💥 Fallback timer crashed:', error);
                // Don't call emergencyRecovery to prevent loops
                console.error('Fallback timer disabled due to error');
                clearInterval(this.fallbackTimer);
                this.fallbackTimer = null;
            }
        }, 16); // ~60 FPS
        
        console.log('⏰ Fallback timer started:', this.fallbackTimer);
    }
    
    /**
     * Switch to fallback timer when requestAnimationFrame fails
     */
    switchToFallbackTimer() {
        console.warn('🔄 Switching to fallback timer animation...');
        this.useFallbackTimer = true;
        
        // Cancel requestAnimationFrame
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
    
    /**
     * Stop all animation loops
     */
    stopAnimation() {
        console.log('⏹️ Stopping all animation loops...');
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        if (this.fallbackTimer) {
            clearInterval(this.fallbackTimer);
            this.fallbackTimer = null;
        }
        
        this.useFallbackTimer = false;
    }
    
    /**
     * Main render function
     * @param {number} timestamp - Animation timestamp
     */
    render(timestamp) {
        // FIRST THING: Update last render time to prevent recovery loops
        this.lastRenderTime = Date.now();
        
        try {
            // Only log every 60 frames to reduce console spam
            if (this.frameCount % 60 === 0) {
                console.log('🎨 Render called, frame:', this.frameCount, 'mode:', this.useFallbackTimer ? 'timer' : 'RAF', 'nodes:', this.nodes.size, 'messages:', this.messages.length);
            }
            
            const renderStart = performance.now();
            const deltaTime = timestamp - this.lastFrameTime;
            this.lastFrameTime = timestamp;
            
            this.frameCount++;
            
            // Validate canvas context
            if (!this.ctx || !this.canvas) {
                console.error('❌ Canvas or context is null!');
                return;
            }
            
            // Clear canvas with error handling
            try {
                this.ctx.clearRect(0, 0, this.canvas.width / (window.devicePixelRatio || 1), 
                                  this.canvas.height / (window.devicePixelRatio || 1));
            } catch (error) {
                console.error('❌ Failed to clear canvas:', error);
                return;
            }
            
            // Draw each component with individual error handling
            try {
                this.drawBackground();
                if (this.frameCount % 60 === 0) {
                    console.log('✅ Background drawn');
                }
            } catch (error) {
                console.error('❌ Error drawing background:', error);
            }
            
            try {
                this.updateMessages(deltaTime);
                this.drawMessages();
            } catch (error) {
                console.error('❌ Error with messages:', error);
                // Clear messages if they're causing issues
                this.messages = [];
            }
            
            try {
                this.drawConnections();
            } catch (error) {
                console.error('❌ Error drawing connections:', error);
            }
            
            try {
                this.drawNodes();
                if (this.frameCount % 60 === 0) {
                    console.log('✅ Nodes drawn, count:', this.nodes.size, 'nodes:', Array.from(this.nodes.keys()));
                }
            } catch (error) {
                console.error('❌ Error drawing nodes:', error);
            }
            
            try {
                this.drawOverlay();
            } catch (error) {
                console.error('❌ Error drawing overlay:', error);
            }
            
            // Performance monitoring
            const renderEnd = performance.now();
            const renderTime = renderEnd - renderStart;
            this.renderTimes.push(renderTime);
            
            // Keep only last 60 frames for performance calculation
            if (this.renderTimes.length > 60) {
                this.renderTimes.shift();
            }
            
            // Log performance every 5 seconds
            if (renderEnd - this.lastPerformanceCheck > 5000) {
                const avgRenderTime = this.renderTimes.reduce((a, b) => a + b, 0) / this.renderTimes.length;
                const fps = 1000 / avgRenderTime;
                
                console.log('📊 Visualization Performance:', {
                    frameCount: this.frameCount,
                    avgRenderTime: avgRenderTime.toFixed(2) + 'ms',
                    fps: fps.toFixed(1),
                    activeMessages: this.messages.length,
                    totalNodes: this.nodes.size
                });
                
                // Warning if performance is degrading
                if (avgRenderTime > 16.67) { // Below 60 FPS
                    console.warn('⚠️ Visualization performance degraded - avg render time:', avgRenderTime.toFixed(2) + 'ms');
                }
                
                this.lastPerformanceCheck = renderEnd;
            }
            
            // Update last render time for emergency recovery
            this.lastRenderTime = renderEnd;
            
        } catch (error) {
            console.error('💥 Critical render error:', error);
            console.error('Stack trace:', error.stack);
            
            // Clear problematic state
            this.messages = [];
            
            // Try to reinitialize canvas
            try {
                this.setupCanvas();
            } catch (canvasError) {
                console.error('❌ Failed to reinitialize canvas:', canvasError);
            }
        }
    }
    
    /**
     * Setup emergency recovery system (DISABLED for debugging)
     */
    setupEmergencyRecovery() {
        console.log('🚫 Emergency recovery system DISABLED for debugging');
        // Disabled to prevent infinite recovery loops during debugging
        // The recovery was triggering continuously even when render was working
    }
    
    /**
     * Emergency recovery - clean up and restart animation
     */
    emergencyRecovery() {
        console.warn('🔧 Attempting emergency recovery...');
        
        // Stop all animation loops
        this.stopAnimation();
        
        // Clear accumulated messages
        const oldMessageCount = this.messages.length;
        this.messages = [];
        
        // Reset performance monitoring
        this.renderTimes = [];
        this.frameCount = 0;
        this.lastPerformanceCheck = Date.now();
        this.lastRenderTime = Date.now();
        
        // Force garbage collection if available
        if (window.gc) {
            window.gc();
        }
        
        // Reinitialize canvas
        try {
            this.setupCanvas();
        } catch (error) {
            console.error('❌ Failed to reinitialize canvas during recovery:', error);
        }
        
        // If we were using fallback timer, force use it again
        if (this.useFallbackTimer) {
            console.log('🔄 Recovery: Continuing with fallback timer');
        } else {
            console.log('🔄 Recovery: Switching to fallback timer for reliability');
            this.useFallbackTimer = true;
        }
        
        // Always restart animation
        this.isAnimating = true;
        this.startAnimation();
        
        console.log('✅ Emergency recovery completed:', {
            clearedMessages: oldMessageCount,
            currentMessages: this.messages.length,
            animationRestarted: this.isAnimating,
            useFallbackTimer: this.useFallbackTimer,
            animationId: this.animationId,
            fallbackTimer: this.fallbackTimer
        });
    }
    
    /**
     * Test basic canvas functionality
     */
    testBasicCanvas() {
        console.log('🧪 Testing basic canvas functionality...');
        
        if (!this.canvas) {
            console.error('❌ Canvas element not found!');
            return false;
        }
        
        if (!this.ctx) {
            console.error('❌ Canvas context not found!');
            return false;
        }
        
        try {
            // Clear canvas first
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            
            // Test basic canvas operations
            this.ctx.fillStyle = 'red';
            this.ctx.fillRect(10, 10, 50, 50);
            
            this.ctx.fillStyle = 'blue';
            this.ctx.fillRect(70, 10, 50, 50);
            
            this.ctx.fillStyle = 'green';
            this.ctx.beginPath();
            this.ctx.arc(150, 35, 25, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // Add text
            this.ctx.fillStyle = 'black';
            this.ctx.font = '16px Arial';
            this.ctx.fillText('Canvas Test - Basic Drawing Works!', 10, 100);
            
            console.log('✅ Basic canvas test successful - you should see colored shapes and text');
            return true;
            
        } catch (error) {
            console.error('❌ Canvas test failed:', error);
            return false;
        }
    }
    
    /**
     * Draw background grid and styling
     */
    drawBackground() {
        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);
        
        // Fill background
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, width, height);
        
        // Draw subtle grid
        this.ctx.strokeStyle = this.colors.grid;
        this.ctx.lineWidth = 0.5;
        this.ctx.setLineDash([2, 4]);
        
        const gridSize = 50;
        for (let x = 0; x < width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, height);
            this.ctx.stroke();
        }
        
        for (let y = 0; y < height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
            this.ctx.stroke();
        }
        
        this.ctx.setLineDash([]);
    }
    
    /**
     * Draw connections between nodes
     */
    drawConnections() {
        this.ctx.strokeStyle = '#ddd';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);
        
        const nodeArray = Array.from(this.nodes.values());
        for (let i = 0; i < nodeArray.length; i++) {
            for (let j = i + 1; j < nodeArray.length; j++) {
                const node1 = nodeArray[i];
                const node2 = nodeArray[j];
                
                this.ctx.beginPath();
                this.ctx.moveTo(node1.x, node1.y);
                this.ctx.lineTo(node2.x, node2.y);
                this.ctx.stroke();
            }
        }
        
        this.ctx.setLineDash([]);
    }
    
    /**
     * Update message animations
     * @param {number} deltaTime - Time since last frame
     */
    updateMessages(deltaTime) {
        this.messages = this.messages.filter(message => {
            const elapsed = Date.now() - message.startTime;
            message.progress = Math.min(elapsed / message.duration, 1);
            
            // Simple linear interpolation - no artificial easing
            message.currentX = message.startX + (message.endX - message.startX) * message.progress;
            message.currentY = message.startY + (message.endY - message.startY) * message.progress;
            
            // Remove completed messages
            return message.progress < 1;
        });
    }
    
    /**
     * Draw message animations
     */
    drawMessages() {
        // Debug: Track message rendering (reduced logging)
        if (this.messages.length > 10 && this.frameCount % 120 === 0) { // Log every 2 seconds when many messages
            console.warn('🎨 HIGH MESSAGE COUNT:', this.messages.length, 'active messages');
        }
        
        this.messages.forEach((message, index) => {
            
            const alpha = 1 - message.progress * 0.5; // Fade out as it travels
            let size = 8 + (1 - message.progress) * 4; // Shrink as it travels
            
            // Make proposal and ACK messages slightly larger
            if (message.type === 'proposal' || message.type === 'ack') {
                size += 2;
            }
            
            this.ctx.save();
            this.ctx.globalAlpha = alpha;
            this.ctx.fillStyle = message.color;
            
            // Draw main message circle
            this.ctx.beginPath();
            this.ctx.arc(message.currentX, message.currentY, size, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // Add glow effect
            this.ctx.shadowColor = message.color;
            this.ctx.shadowBlur = 10;
            this.ctx.beginPath();
            this.ctx.arc(message.currentX, message.currentY, size * 0.6, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // Add special indicators for consensus messages
            if (message.type === 'proposal') {
                // Draw 'P' for proposal
                this.ctx.shadowBlur = 0;
                this.ctx.fillStyle = 'white';
                this.ctx.font = 'bold 8px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText('P', message.currentX, message.currentY);
            } else if (message.type === 'ack') {
                // Draw checkmark for ACK
                this.ctx.shadowBlur = 0;
                this.ctx.strokeStyle = 'white';
                this.ctx.lineWidth = 2;
                this.ctx.lineCap = 'round';
                
                // Draw checkmark
                this.ctx.beginPath();
                this.ctx.moveTo(message.currentX - 3, message.currentY);
                this.ctx.lineTo(message.currentX - 1, message.currentY + 2);
                this.ctx.lineTo(message.currentX + 3, message.currentY - 2);
                this.ctx.stroke();
            }
            
            this.ctx.restore();
        });
    }
    
    /**
     * Draw all nodes
     */
    drawNodes() {
        this.nodes.forEach(node => {
            this.drawNode(node);
        });
    }
    
    /**
     * Draw a single node
     * @param {Object} node - Node data
     */
    drawNode(node) {
        const color = this.colors[node.state] || this.colors.follower;
        const isActive = Date.now() - node.lastActivity < 2000; // Active in last 2 seconds
        
        // CRITICAL DEBUG: Log leader nodes every render
        if (node.state === 'leader') {
            console.log(`👑 RENDER: Drawing leader Node ${node.id} with GREEN color ${color} (state: ${node.state})`);
        }
        
        // Debug: Log node position every 60 frames
        if (this.frameCount % 60 === 0) {
            const canvasInfo = {
                canvasWidth: this.canvas.width,
                canvasHeight: this.canvas.height,
                clientWidth: this.canvas.clientWidth,
                clientHeight: this.canvas.clientHeight,
                centerX: this.centerX,
                centerY: this.centerY
            };
            console.log(`🎯 Drawing node ${node.id}:`, {
                position: `(${node.x}, ${node.y})`,
                state: node.state,
                color: color,
                canvas: canvasInfo
            });
        }
        
        this.ctx.save();
        
        // Draw node shadow
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        this.ctx.shadowBlur = 10;
        this.ctx.shadowOffsetX = 2;
        this.ctx.shadowOffsetY = 2;
        
        // Draw node circle
        this.ctx.fillStyle = color;
        this.ctx.strokeStyle = isActive ? '#333' : '#999';
        this.ctx.lineWidth = isActive ? 3 : 2;
        
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, this.nodeRadius, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.stroke();
        
        this.ctx.restore();
        
        // Draw node label
        if (this.showNodeLabels) {
            this.ctx.fillStyle = this.colors.text;
            this.ctx.font = 'bold 14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(`Node ${node.id}`, node.x, node.y - 5);
            
            // Draw state
            this.ctx.font = '10px Arial';
            
            // CRITICAL DEBUG: Always log what state we're about to draw
            console.log(`🏷️ DRAWING LABEL: Node ${node.id} state = "${node.state}" (displaying "${node.state.toUpperCase()}")`);
            
            this.ctx.fillText(node.state.toUpperCase(), node.x, node.y + 8);
            
            // Draw term
            this.ctx.font = '9px Arial';
            this.ctx.fillStyle = '#666';
            this.ctx.fillText(`T:${node.term}`, node.x, node.y + 20);
        }
        
        // Draw activity indicator
        if (isActive) {
            const pulseRadius = this.nodeRadius + 10 + Math.sin(Date.now() / 200) * 5;
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2;
            this.ctx.globalAlpha = 0.5;
            this.ctx.setLineDash([3, 3]);
            
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, pulseRadius, 0, 2 * Math.PI);
            this.ctx.stroke();
            
            this.ctx.setLineDash([]);
            this.ctx.globalAlpha = 1;
        }
    }
    
    /**
     * Draw UI overlay
     */
    drawOverlay() {
        // Draw legend
        this.drawLegend();
        
        // Draw performance info
        this.drawPerformanceInfo();
    }
    
    /**
     * Draw legend
     */
    drawLegend() {
        const startX = 20;
        const startY = 20;
        const itemHeight = 25;
        
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.fillRect(startX - 10, startY - 10, 120, 100);
        
        this.ctx.strokeStyle = '#ddd';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(startX - 10, startY - 10, 120, 100);
        
        const legendItems = [
            { color: this.colors.leader, label: 'Leader' },
            { color: this.colors.candidate, label: 'Candidate' },
            { color: this.colors.follower, label: 'Follower' }
        ];
        
        legendItems.forEach((item, index) => {
            const y = startY + index * itemHeight;
            
            // Draw color circle
            this.ctx.fillStyle = item.color;
            this.ctx.beginPath();
            this.ctx.arc(startX + 8, y + 8, 6, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // Draw label
            this.ctx.fillStyle = this.colors.text;
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(item.label, startX + 20, y + 8);
        });
    }
    
    /**
     * Draw performance information
     */
    drawPerformanceInfo() {
        const info = [
            `Nodes: ${this.nodes.size}`,
            `Messages: ${this.messages.length}`,
            `FPS: ${Math.round(1000 / (Date.now() - this.lastFrameTime)) || 0}`
        ];
        
        const startX = this.canvas.width / (window.devicePixelRatio || 1) - 150;
        const startY = 20;
        
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.fillRect(startX - 10, startY - 10, 140, 80);
        
        this.ctx.strokeStyle = '#ddd';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(startX - 10, startY - 10, 140, 80);
        
        this.ctx.fillStyle = this.colors.text;
        this.ctx.font = '11px monospace';
        this.ctx.textAlign = 'left';
        
        info.forEach((text, index) => {
            this.ctx.fillText(text, startX, startY + index * 20);
        });
    }
    
    /**
     * Handle canvas clicks
     * @param {MouseEvent} event - Click event
     */
    handleCanvasClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // Check if click is on a node
        this.nodes.forEach(node => {
            const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
            if (distance <= this.nodeRadius) {
                console.log('Clicked on node:', node.id);
                this.emit('nodeClick', node);
            }
        });
    }
    
    /**
     * Set visualization settings
     * @param {Object} settings - Settings object
     */
    setSettings(settings) {
        if (settings.showHeartbeats !== undefined) {
            this.showHeartbeats = settings.showHeartbeats;
        }
        if (settings.showMessages !== undefined) {
            this.showMessages = settings.showMessages;
        }
        if (settings.showNodeLabels !== undefined) {
            this.showNodeLabels = settings.showNodeLabels;
        }
    }
    
    /**
     * Clear all messages and animations
     */
    clear() {
        this.messages = [];
        this.animations = [];
    }
    
    /**
     * Pause/resume animation
     * @param {boolean} paused - Whether to pause
     */
    setPaused(paused) {
        this.isAnimating = !paused;
        if (!paused) {
            this.startAnimation();
        }
    }
    
    /**
     * Simple event system
     */
    emit(eventType, data) {
        // Placeholder for event emission
        console.log('Visualization event:', eventType, data);
    }
    
    /**
     * Get current state
     */
    getState() {
        return {
            nodeCount: this.nodes.size,
            messageCount: this.messages.length,
            isAnimating: this.isAnimating,
            settings: {
                showHeartbeats: this.showHeartbeats,
                showMessages: this.showMessages,
                showNodeLabels: this.showNodeLabels
            }
        };
    }

    /**
     * Clear message backlog (for debugging)
     */
    clearMessageBacklog() {
        console.log('🧹 Clearing message backlog:', this.messages.length, 'messages');
        this.messages = [];
        if (this.recentMessages) {
            this.recentMessages.clear();
        }
        console.log('✅ Message backlog cleared');
    }
}

// Export for use in other modules
window.RaftVisualization = RaftVisualization;