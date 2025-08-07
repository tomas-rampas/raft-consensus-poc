/**
 * WebSocket Connection Manager
 * Handles connection, reconnection, and message routing for the Raft visualization
 */

class WebSocketManager {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second
        this.eventHandlers = new Map();
        this.messageQueue = [];
        
        this.connect();
    }
    
    /**
     * Establish WebSocket connection
     */
    async connect() {
        try {
            // Get WebSocket port from API
            const wsPort = await this.getWebSocketPort();
            const wsUrl = `ws://${window.location.hostname}:${wsPort}`;
            console.log(`🔌 Connecting to WebSocket at ${wsUrl}`);
            
            this.ws = new WebSocket(wsUrl);
            this.setupEventHandlers();
            
        } catch (error) {
            console.error('❌ WebSocket connection error:', error);
            this.handleConnectionError();
        }
    }
    
    /**
     * Get WebSocket port from API
     */
    async getWebSocketPort() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            return data.websocket_port || 8082; // Default fallback
        } catch (error) {
            console.warn('⚠️ Could not fetch WebSocket port from API, using default:', error);
            return 8082; // Default fallback
        }
    }
    
    /**
     * Set up WebSocket event handlers
     */
    setupEventHandlers() {
        this.ws.onopen = (event) => {
            console.log('✅ WebSocket connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;
            
            this.updateConnectionStatus('connected', 'Connected');
            
            // Send any queued messages
            this.flushMessageQueue();
            
            // Emit connected event
            this.emit('connected', event);
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('📨 Received WebSocket message:', data);
                
                // CRITICAL DEBUG: Look specifically for leader events
                const eventType = typeof data.event_type === 'string' ? data.event_type : data.event_type?.type;
                if (eventType === 'LeaderElected' || eventType === 'StateChange') {
                    console.log('👑 LEADER EVENT DETECTED:', {
                        eventType,
                        nodeId: data.node_id,
                        eventData: data.event_type,
                        fullMessage: data
                    });
                }
                
                // Debug: Count HeartbeatSent events
                if (data.event_type && 
                    (typeof data.event_type === 'object' && data.event_type.type === 'HeartbeatSent' ||
                     typeof data.event_type === 'string' && data.event_type === 'HeartbeatSent')) {
                    console.log(`💓 WebSocket received heartbeat from Node ${data.node_id}`);
                }
                
                // Process events normally through the event routing system
                // No direct manipulation needed - let the app handle events properly
                
                // Route message based on type
                if (data.type) {
                    this.emit(data.type, data);
                } else if (data.event_type) {
                    // Handle Raft events - both string and object formats
                    const eventType = typeof data.event_type === 'string' ? data.event_type : data.event_type.type;
                    this.emit('raft_event', data);
                    if (eventType) {
                        // Emit specific event handlers for new replication events
                        const lowerEventType = eventType.toLowerCase();
                        this.emit(`raft_${lowerEventType}`, data);
                        
                        // Additional routing for new event types
                        if (lowerEventType === 'logreplicationsent') {
                            this.emit('replication_sent', data);
                        } else if (lowerEventType === 'replicationackreceived') {
                            this.emit('replication_ack', data);
                        } else if (lowerEventType === 'replicationcompleted') {
                            this.emit('replication_completed', data);
                        }
                    }
                }
                
                // Emit raw message event
                this.emit('message', data);
                
            } catch (error) {
                console.error('❌ Error parsing WebSocket message:', error, event.data);
                this.emit('parse_error', { error, data: event.data });
            }
        };
        
        this.ws.onclose = (event) => {
            console.log('🔌 WebSocket closed:', event.code, event.reason);
            this.isConnected = false;
            this.updateConnectionStatus('disconnected', 'Disconnected');
            
            this.emit('disconnected', event);
            
            // Attempt to reconnect unless it was a clean close
            if (event.code !== 1000) {
                this.attemptReconnect();
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            this.emit('error', error);
            this.handleConnectionError();
        };
    }
    
    /**
     * Handle connection errors
     */
    handleConnectionError() {
        this.isConnected = false;
        this.updateConnectionStatus('error', 'Connection Error');
        this.attemptReconnect();
    }
    
    /**
     * Attempt to reconnect with exponential backoff
     */
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Max reconnection attempts reached');
            this.updateConnectionStatus('failed', 'Connection Failed');
            this.emit('connection_failed');
            return;
        }
        
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`🔄 Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.updateConnectionStatus('connecting', `Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
            if (!this.isConnected) {
                this.connect();
            }
        }, delay);
    }
    
    /**
     * Send a message through the WebSocket
     * @param {Object} message - Message to send
     */
    send(message) {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            try {
                const jsonMessage = JSON.stringify(message);
                this.ws.send(jsonMessage);
                console.log('📤 Sent message:', message);
            } catch (error) {
                console.error('❌ Error sending message:', error);
                this.emit('send_error', { error, message });
            }
        } else {
            // Queue message for later
            console.log('📥 Queueing message (not connected):', message);
            this.messageQueue.push(message);
        }
    }
    
    /**
     * Flush queued messages
     */
    flushMessageQueue() {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            this.send(message);
        }
    }
    
    /**
     * Add event listener
     * @param {string} eventType - Event type to listen for
     * @param {Function} handler - Event handler function
     */
    on(eventType, handler) {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        this.eventHandlers.get(eventType).push(handler);
    }
    
    /**
     * Remove event listener
     * @param {string} eventType - Event type
     * @param {Function} handler - Handler to remove
     */
    off(eventType, handler) {
        if (this.eventHandlers.has(eventType)) {
            const handlers = this.eventHandlers.get(eventType);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }
    
    /**
     * Emit event to all listeners
     * @param {string} eventType - Event type
     * @param {*} data - Event data
     */
    emit(eventType, data) {
        if (this.eventHandlers.has(eventType)) {
            this.eventHandlers.get(eventType).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`❌ Error in event handler for ${eventType}:`, error);
                }
            });
        }
    }
    
    /**
     * Update connection status in UI
     * @param {string} status - Connection status
     * @param {string} text - Status text
     */
    updateConnectionStatus(status, text) {
        const statusIndicator = document.getElementById('statusIndicator');
        const connectionText = document.getElementById('connectionText');
        
        if (statusIndicator && connectionText) {
            // Remove all status classes
            statusIndicator.className = 'status-indicator';
            
            // Add current status class
            statusIndicator.classList.add(status);
            connectionText.textContent = text;
        }
    }
    
    /**
     * Send ping to server
     */
    ping() {
        this.send({ type: 'ping', timestamp: Date.now() });
    }
    
    /**
     * Subscribe to events
     */
    subscribe() {
        this.send({ type: 'subscribe' });
    }
    
    /**
     * Get cluster status
     */
    getStatus() {
        this.send({ type: 'get_status' });
    }
    
    /**
     * Close connection
     */
    close() {
        if (this.ws) {
            this.ws.close(1000, 'Client closing');
        }
    }
    
    /**
     * Get connection state
     */
    getState() {
        return {
            isConnected: this.isConnected,
            readyState: this.ws ? this.ws.readyState : WebSocket.CLOSED,
            reconnectAttempts: this.reconnectAttempts,
            queuedMessages: this.messageQueue.length
        };
    }
}

// Export for use in other modules
window.WebSocketManager = WebSocketManager;