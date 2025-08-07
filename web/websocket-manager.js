/**
 * Simple WebSocket Manager for Clean Raft App
 * Provides the interface expected by clean-app.js
 */

class WebSocketManager {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.isConnected = false;
        this.onMessage = null;
        this.onConnectionChange = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
    }
    
    connect() {
        try {
            console.log(`🔌 Connecting to WebSocket at ${this.url}`);
            this.ws = new WebSocket(this.url);
            this.setupEventHandlers();
        } catch (error) {
            console.error('❌ WebSocket connection error:', error);
            this.handleConnectionError();
        }
    }
    
    setupEventHandlers() {
        this.ws.onopen = (event) => {
            console.log('✅ WebSocket connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;
            
            // Query cluster state to get current leader and node states
            console.log('🔍 Querying cluster state for current leadership...');
            this.send({ type: 'query_cluster_state' });
            
            if (this.onConnectionChange) {
                this.onConnectionChange(true);
            }
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('📨 Received WebSocket message:', data);
                
                if (this.onMessage) {
                    this.onMessage(data);
                }
            } catch (error) {
                console.error('❌ Error parsing WebSocket message:', error, event.data);
            }
        };
        
        this.ws.onclose = (event) => {
            console.log('🔌 WebSocket closed:', event.code, event.reason);
            this.isConnected = false;
            
            if (this.onConnectionChange) {
                this.onConnectionChange(false);
            }
            
            // Attempt to reconnect unless it was a clean close
            if (event.code !== 1000) {
                this.attemptReconnect();
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            this.handleConnectionError();
        };
    }
    
    handleConnectionError() {
        this.isConnected = false;
        if (this.onConnectionChange) {
            this.onConnectionChange(false);
        }
        this.attemptReconnect();
    }
    
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Max reconnection attempts reached');
            return;
        }
        
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`🔄 Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
            if (!this.isConnected) {
                this.connect();
            }
        }, delay);
    }
    
    send(message) {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            try {
                const jsonMessage = JSON.stringify(message);
                this.ws.send(jsonMessage);
                console.log('📤 Sent message:', message);
            } catch (error) {
                console.error('❌ Error sending message:', error);
            }
        } else {
            console.log('📥 Cannot send message - not connected:', message);
        }
    }
    
    close() {
        if (this.ws) {
            this.ws.close(1000, 'Client closing');
        }
    }
}

// Export for use in other modules
window.WebSocketManager = WebSocketManager;