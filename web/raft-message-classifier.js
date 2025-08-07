/**
 * Clean Raft Message Classification System
 * Classifies messages into three core Raft communication types:
 * 1. Election - RequestVote, leadership changes
 * 2. Proposal - Client commands, consensus operations  
 * 3. Heartbeat - Regular maintenance traffic
 */

class RaftMessageClassifier {
    constructor() {
        this.statistics = {
            electionMessages: 0,
            proposalMessages: 0,
            heartbeatMessages: 0,
            otherMessages: 0
        };
    }

    /**
     * Classify a Raft event into one of the three core communication types
     * @param {Object} event - The Raft event to classify
     * @returns {string} - 'election', 'proposal', 'heartbeat', or 'other'
     */
    classify(event) {
        if (!event || !event.event_type) {
            return 'other';
        }

        const eventType = typeof event.event_type === 'string' 
            ? event.event_type 
            : event.event_type.type;
        
        const message = event.message?.toLowerCase() || '';

        // 1. ELECTION MESSAGES
        if (this.isElectionEvent(eventType, message)) {
            this.statistics.electionMessages++;
            return 'election';
        }

        // 2. PROPOSAL MESSAGES  
        if (this.isProposalEvent(eventType, message)) {
            this.statistics.proposalMessages++;
            return 'proposal';
        }

        // 3. HEARTBEAT MESSAGES
        if (this.isHeartbeatEvent(eventType, message)) {
            this.statistics.heartbeatMessages++;
            return 'heartbeat';
        }

        // 4. OTHER MESSAGES
        this.statistics.otherMessages++;
        return 'other';
    }

    /**
     * Check if event is related to leader election process
     * @param {string} eventType - The event type
     * @param {string} message - The event message (lowercase)
     * @returns {boolean}
     */
    isElectionEvent(eventType, message) {
        // Direct election event types
        const electionTypes = [
            'ElectionTimeout',
            'ElectionStarted', 
            'VoteRequested',
            'VoteGranted',
            'VoteDenied',
            'LeaderElected'
        ];

        if (electionTypes.includes(eventType)) {
            return true;
        }

        // State changes related to elections
        if (eventType === 'StateChange') {
            return message.includes('candidate') || 
                   message.includes('leader') || 
                   message.includes('election');
        }

        // Message types related to voting
        if (eventType === 'MessageSent' || eventType === 'MessageReceived') {
            return message.includes('vote') || 
                   message.includes('requestvote') ||
                   message.includes('election');
        }

        return false;
    }

    /**
     * Check if event is related to proposal/consensus process
     * @param {string} eventType - The event type
     * @param {string} message - The event message (lowercase)
     * @returns {boolean}
     */
    isProposalEvent(eventType, message) {
        // Direct proposal event types
        const proposalTypes = [
            'LogEntryProposed',
            'LogReplicationSent',
            'ConsensusAckReceived',
            'ReplicationCompleted',
            'ClientCommandReceived'
        ];

        if (proposalTypes.includes(eventType)) {
            return true;
        }

        // Client command events
        if (eventType === 'ClientCommandReceived' || 
            eventType === 'ClientCommandRejected') {
            return true;
        }

        // Log-related events that aren't heartbeats
        if (eventType === 'LogEntryAdded' || 
            eventType === 'LogEntryCommitted') {
            return true;
        }

        // Messages containing proposal-related keywords
        if (message.includes('proposal') || 
            message.includes('consensus') ||
            message.includes('client command') ||
            message.includes('replication') && !message.includes('heartbeat')) {
            return true;
        }

        return false;
    }

    /**
     * Check if event is related to heartbeat maintenance
     * @param {string} eventType - The event type
     * @param {string} message - The event message (lowercase)
     * @returns {boolean}
     */
    isHeartbeatEvent(eventType, message) {
        // Direct heartbeat event types
        const heartbeatTypes = [
            'HeartbeatSent',
            'HeartbeatReceived'
        ];

        if (heartbeatTypes.includes(eventType)) {
            return true;
        }

        // Messages explicitly containing heartbeat
        if (message.includes('heartbeat')) {
            return true;
        }

        // AppendEntries without actual log entries (heartbeats)
        if (eventType === 'MessageSent' && 
            message.includes('appendentries') && 
            !message.includes('entries') && 
            !message.includes('proposal')) {
            return true;
        }

        return false;
    }

    /**
     * Get classification statistics
     * @returns {Object} Statistics object
     */
    getStatistics() {
        return { ...this.statistics };
    }

    /**
     * Reset statistics
     */
    resetStatistics() {
        this.statistics = {
            electionMessages: 0,
            proposalMessages: 0,
            heartbeatMessages: 0,
            otherMessages: 0
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RaftMessageClassifier;
} else {
    window.RaftMessageClassifier = RaftMessageClassifier;
}