/**
 * Clean Raft Visualization System V2
 * Focused on three core Raft communication patterns:
 * 1. Election visualization (candidate → all nodes, vote responses)
 * 2. Proposal visualization (leader → followers, consensus ACKs)  
 * 3. Heartbeat visualization (leader → followers, regular maintenance)
 */

class RaftVisualizationV2 {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        this.setupCanvas();
        
        // Visualization state
        this.nodes = new Map();
        this.animations = [];
        
        // Settings for three communication types
        this.settings = {
            showElections: true,
            showProposals: true,
            showHeartbeats: true
        };
        
        // Message classifier
        this.classifier = new RaftMessageClassifier();
        
        // Colors for different message types
        this.colors = {
            election: {
                vote_request: '#ff9500', // Orange for vote requests
                vote_granted: '#4caf50', // Green for granted votes
                vote_denied: '#f44336',  // Red for denied votes
                leader_elected: '#ffd700' // Gold for new leader
            },
            proposal: {
                client_command: '#2196f3',    // Blue for client commands
                proposal_broadcast: '#ff5722', // Deep orange for proposals
                consensus_ack: '#8bc34a',     // Light green for ACKs
                consensus_achieved: '#4caf50' // Green for consensus
            },
            heartbeat: {
                heartbeat_sent: '#9e9e9e',    // Gray for heartbeats
                heartbeat_ack: '#c0c0c0'     // Light gray for heartbeat ACKs
            },
            nodes: {
                leader: '#4caf50',    // Green
                candidate: '#ff9800', // Orange  
                follower: '#2196f3'   // Blue
            }
        };
        
        // Animation settings
        this.animationSpeed = 1.0;
        this.isAnimating = true;
        
        // Initialize 5-node cluster for visualization
        this.initializeNodes();
        
        // Start animation loop
        this.startAnimation();
    }

    /**
     * Initialize 5 nodes for visualization (before events arrive)
     */
    initializeNodes() {
        for (let i = 0; i < 5; i++) {
            this.updateNode({
                id: i,
                state: 'Follower',
                term: 0
            });
        }
        console.log('🎨 Initialized 5 nodes for visualization');
    }

    setupCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
    }

    /**
     * Update visualization settings
     * @param {Object} newSettings - New settings object
     */
    updateSettings(newSettings) {
        Object.assign(this.settings, newSettings);
    }

    /**
     * Add or update a node in the cluster
     * @param {Object} nodeData - Node information
     */
    updateNode(nodeData) {
        const { id, state, term } = nodeData;
        
        // Calculate position in a circle
        const totalNodes = 5; // Assume 5-node cluster for layout
        const angle = (id / totalNodes) * 2 * Math.PI - Math.PI / 2;
        const radius = 120;
        const centerX = this.canvas.width / (2 * window.devicePixelRatio);
        const centerY = this.canvas.height / (2 * window.devicePixelRatio);
        
        const node = {
            id,
            state: state || 'Follower',
            term: term || 0,
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
            radius: 25,
            lastUpdate: Date.now()
        };
        
        this.nodes.set(id, node);
    }

    /**
     * Process a Raft event and create appropriate animations
     * @param {Object} event - Raft event to visualize
     */
    processEvent(event) {
        const messageType = this.classifier.classify(event);
        
        // Filter based on settings
        if (!this.shouldShowMessage(messageType)) {
            return;
        }
        
        switch (messageType) {
            case 'election':
                this.processElectionEvent(event);
                break;
            case 'proposal':
                this.processProposalEvent(event);
                break;
            case 'heartbeat':
                this.processHeartbeatEvent(event);
                break;
            default:
                console.log('🔍 Unclassified event:', event);
        }
    }

    /**
     * Check if a message type should be shown based on current settings
     * @param {string} messageType - The message type ('election', 'proposal', 'heartbeat')
     * @returns {boolean}
     */
    shouldShowMessage(messageType) {
        switch (messageType) {
            case 'election':
                return this.settings.showElections;
            case 'proposal':
                return this.settings.showProposals;
            case 'heartbeat':
                return this.settings.showHeartbeats;
            default:
                return false;
        }
    }

    /**
     * Process election-related events
     * @param {Object} event - Election event
     */
    processElectionEvent(event) {
        const eventType = typeof event.event_type === 'string' 
            ? event.event_type 
            : event.event_type.type;

        switch (eventType) {
            case 'VoteRequested':
                this.animateVoteRequest(event);
                break;
            case 'VoteGranted':
                this.animateVoteResponse(event, true);
                break;
            case 'VoteDenied':
                this.animateVoteResponse(event, false);
                break;
            case 'LeaderElected':
                this.animateLeaderElection(event);
                break;
            case 'StateChange':
                this.updateNodeFromStateChange(event);
                break;
        }
    }

    /**
     * Process proposal-related events  
     * @param {Object} event - Proposal event
     */
    processProposalEvent(event) {
        const eventType = typeof event.event_type === 'string' 
            ? event.event_type 
            : event.event_type.type;

        switch (eventType) {
            case 'ClientCommandReceived':
                this.animateClientCommand(event);
                break;
            case 'LogEntryProposed':
                this.animateProposalBroadcast(event);
                break;
            case 'LogReplicationSent':
                this.animateReplication(event);
                break;
            case 'ConsensusAckReceived':
                this.animateConsensusAck(event);
                break;
            case 'ReplicationCompleted':
                this.animateConsensusAchieved(event);
                break;
        }
    }

    /**
     * Process heartbeat-related events
     * @param {Object} event - Heartbeat event  
     */
    processHeartbeatEvent(event) {
        const eventType = typeof event.event_type === 'string' 
            ? event.event_type 
            : event.event_type.type;

        switch (eventType) {
            case 'HeartbeatSent':
                this.animateHeartbeat(event);
                break;
            case 'HeartbeatReceived':
                this.animateHeartbeatAck(event);
                break;
        }
    }

    // Animation methods for each event type

    animateVoteRequest(event) {
        // Candidate sends vote request to all other nodes
        const candidateId = event.node_id;
        const candidate = this.nodes.get(candidateId);
        
        if (!candidate) return;

        // Animate to all other nodes
        this.nodes.forEach((node, nodeId) => {
            if (nodeId !== candidateId) {
                this.addAnimation({
                    type: 'vote_request',
                    from: candidate,
                    to: node,
                    color: this.colors.election.vote_request,
                    duration: 1000,
                    startTime: Date.now()
                });
            }
        });
    }

    animateVoteResponse(event, granted) {
        // Node responds to vote request
        const eventData = event.event_type;
        const voterId = eventData.voter_id;
        const candidateId = eventData.candidate_id;
        
        const voter = this.nodes.get(voterId);
        const candidate = this.nodes.get(candidateId);
        
        if (!voter || !candidate) return;

        this.addAnimation({
            type: granted ? 'vote_granted' : 'vote_denied',
            from: voter,
            to: candidate,
            color: granted ? this.colors.election.vote_granted : this.colors.election.vote_denied,
            duration: 800,
            startTime: Date.now()
        });
    }

    animateLeaderElection(event) {
        // New leader elected - show celebration
        const eventData = event.event_type;
        const leaderId = eventData.leader_id;
        const leader = this.nodes.get(leaderId);
        
        if (!leader) return;

        // Update node state
        leader.state = 'Leader';
        
        // Add celebration animation
        this.addAnimation({
            type: 'leader_elected',
            node: leader,
            color: this.colors.election.leader_elected,
            duration: 2000,
            startTime: Date.now()
        });
    }

    animateClientCommand(event) {
        // Client command submitted to node
        const nodeId = event.node_id;
        const node = this.nodes.get(nodeId);
        
        if (!node) return;

        // Show command submission
        this.addAnimation({
            type: 'client_command',
            node: node,
            color: this.colors.proposal.client_command,
            duration: 1000,
            startTime: Date.now()
        });
    }

    animateProposalBroadcast(event) {
        // Leader broadcasts proposal to all followers
        const leaderId = event.node_id;
        const leader = this.nodes.get(leaderId);
        
        if (!leader) return;

        // Animate to all followers
        this.nodes.forEach((node, nodeId) => {
            if (nodeId !== leaderId && node.state === 'Follower') {
                this.addAnimation({
                    type: 'proposal_broadcast',
                    from: leader,
                    to: node,
                    color: this.colors.proposal.proposal_broadcast,
                    duration: 1200,
                    startTime: Date.now()
                });
            }
        });
    }

    animateReplication(event) {
        // Log replication from leader to follower
        const eventData = event.event_type;
        const leaderId = eventData.leader_id;
        const followerId = eventData.follower_id;
        
        const leader = this.nodes.get(leaderId);
        const follower = this.nodes.get(followerId);
        
        if (!leader || !follower) return;

        this.addAnimation({
            type: 'replication',
            from: leader,
            to: follower,
            color: this.colors.proposal.proposal_broadcast,
            duration: 1000,
            startTime: Date.now()
        });
    }

    animateConsensusAck(event) {
        // Follower sends ACK back to leader
        const eventData = event.event_type;
        const followerId = eventData.from_follower;
        const leaderId = eventData.to_leader;
        
        const follower = this.nodes.get(followerId);
        const leader = this.nodes.get(leaderId);
        
        if (!follower || !leader) return;

        this.addAnimation({
            type: 'consensus_ack',
            from: follower,
            to: leader,
            color: this.colors.proposal.consensus_ack,
            duration: 800,
            startTime: Date.now()
        });
    }

    animateConsensusAchieved(event) {
        // Consensus achieved - show celebration
        const eventData = event.event_type;
        const leaderId = eventData.leader_id;
        const leader = this.nodes.get(leaderId);
        
        if (!leader) return;

        this.addAnimation({
            type: 'consensus_achieved',
            node: leader,
            color: this.colors.proposal.consensus_achieved,
            duration: 1500,
            startTime: Date.now()
        });
    }

    animateHeartbeat(event) {
        // Leader sends heartbeat to followers
        const eventData = event.event_type;
        const leaderId = eventData.leader_id;
        const leader = this.nodes.get(leaderId);
        
        if (!leader) return;

        // Animate to all followers (subtle)
        this.nodes.forEach((node, nodeId) => {
            if (nodeId !== leaderId && node.state === 'Follower') {
                this.addAnimation({
                    type: 'heartbeat',
                    from: leader,
                    to: node,
                    color: this.colors.heartbeat.heartbeat_sent,
                    duration: 600,
                    startTime: Date.now(),
                    subtle: true
                });
            }
        });
    }

    animateHeartbeatAck(event) {
        // Follower acknowledges heartbeat
        const eventData = event.event_type;
        const followerId = eventData.follower_id;
        const leaderId = eventData.leader_id;
        
        const follower = this.nodes.get(followerId);
        const leader = this.nodes.get(leaderId);
        
        if (!follower || !leader) return;

        this.addAnimation({
            type: 'heartbeat_ack',
            from: follower,
            to: leader,
            color: this.colors.heartbeat.heartbeat_ack,
            duration: 400,
            startTime: Date.now(),
            subtle: true
        });
    }

    updateNodeFromStateChange(event) {
        // Update node state from StateChange event
        const eventData = event.event_type;
        const nodeId = event.node_id;
        const node = this.nodes.get(nodeId);
        
        if (node) {
            node.state = eventData.to_state;
            node.lastUpdate = Date.now();
        }
    }

    /**
     * Add animation to the queue
     * @param {Object} animation - Animation object
     */
    addAnimation(animation) {
        this.animations.push(animation);
    }

    /**
     * Start the animation loop
     */
    startAnimation() {
        const animate = () => {
            if (this.isAnimating) {
                this.render();
            }
            requestAnimationFrame(animate);
        };
        animate();
    }

    /**
     * Render the visualization
     */
    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width / window.devicePixelRatio, 
                                 this.canvas.height / window.devicePixelRatio);
        
        // Update animations
        this.updateAnimations();
        
        // Draw nodes
        this.drawNodes();
        
        // Draw animations
        this.drawAnimations();
    }

    updateAnimations() {
        const now = Date.now();
        this.animations = this.animations.filter(animation => {
            const elapsed = now - animation.startTime;
            return elapsed < animation.duration;
        });
    }

    drawNodes() {
        this.nodes.forEach(node => {
            const color = this.colors.nodes[node.state.toLowerCase()] || this.colors.nodes.follower;
            
            // Draw node circle
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
            this.ctx.fillStyle = color;
            this.ctx.fill();
            this.ctx.strokeStyle = '#333';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // Draw node label
            this.ctx.fillStyle = '#fff';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(node.id.toString(), node.x, node.y + 4);
            
            // Draw state label
            this.ctx.fillStyle = '#333';
            this.ctx.font = '10px Arial';
            this.ctx.fillText(node.state, node.x, node.y - node.radius - 10);
        });
    }

    drawAnimations() {
        const now = Date.now();
        
        this.animations.forEach(animation => {
            const elapsed = now - animation.startTime;
            const progress = elapsed / animation.duration;
            
            if (progress >= 1) return; // Animation complete
            
            if (animation.from && animation.to) {
                // Message animation between nodes
                this.drawMessage(animation, progress);
            } else if (animation.node) {
                // Node-based animation (celebration, etc.)
                this.drawNodeAnimation(animation, progress);
            }
        });
    }

    drawMessage(animation, progress) {
        const { from, to, color, subtle } = animation;
        
        // Calculate message position
        const x = from.x + (to.x - from.x) * progress;
        const y = from.y + (to.y - from.y) * progress;
        
        // Draw message dot
        const size = subtle ? 4 : 6;
        const alpha = subtle ? 0.6 : 1.0;
        
        this.ctx.save();
        this.ctx.globalAlpha = alpha;
        this.ctx.beginPath();
        this.ctx.arc(x, y, size, 0, 2 * Math.PI);
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.restore();
        
        // Draw trail
        if (!subtle) {
            const trailLength = 20;
            for (let i = 0; i < trailLength; i++) {
                const trailProgress = Math.max(0, progress - (i / trailLength) * 0.1);
                if (trailProgress <= 0) break;
                
                const trailX = from.x + (to.x - from.x) * trailProgress;
                const trailY = from.y + (to.y - from.y) * trailProgress;
                const trailAlpha = (1 - i / trailLength) * 0.3;
                
                this.ctx.save();
                this.ctx.globalAlpha = trailAlpha;
                this.ctx.beginPath();
                this.ctx.arc(trailX, trailY, size * 0.5, 0, 2 * Math.PI);
                this.ctx.fillStyle = color;
                this.ctx.fill();
                this.ctx.restore();
            }
        }
    }

    drawNodeAnimation(animation, progress) {
        const { node, color, type } = animation;
        
        if (type === 'leader_elected' || type === 'consensus_achieved') {
            // Pulsing ring animation
            const maxRadius = node.radius + 20;
            const radius = maxRadius * Math.sin(progress * Math.PI);
            const alpha = 1 - progress;
            
            this.ctx.save();
            this.ctx.globalAlpha = alpha;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
            this.ctx.restore();
        } else if (type === 'client_command') {
            // Flash animation
            const alpha = Math.sin(progress * Math.PI * 4) * 0.5 + 0.5;
            
            this.ctx.save();
            this.ctx.globalAlpha = alpha * 0.7;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, node.radius + 5, 0, 2 * Math.PI);
            this.ctx.fillStyle = color;
            this.ctx.fill();
            this.ctx.restore();
        }
    }

    /**
     * Get current statistics
     * @returns {Object} Statistics from classifier
     */
    getStatistics() {
        return this.classifier.getStatistics();
    }

    /**
     * Pause/resume animation
     * @param {boolean} paused - Whether to pause animation
     */
    setPaused(paused) {
        this.isAnimating = !paused;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RaftVisualizationV2;
} else {
    window.RaftVisualizationV2 = RaftVisualizationV2;
}