#!/usr/bin/env node

/**
 * Test the frontend event processing with real WebSocket events
 */

const WebSocket = require('ws');

// Load our dashboard logic
const fs = require('fs');
const path = require('path');

// Mock DOM environment
global.window = global;
global.document = {
    getElementById: (id) => ({
        textContent: '',
        innerHTML: '',
        checked: true,
        value: '',
        addEventListener: () => {},
        appendChild: () => {},
        style: {},
        classList: { add: () => {} }
    }),
    createElement: (tag) => ({
        className: '',
        textContent: '',
        innerHTML: '',
        appendChild: () => {},
        addEventListener: () => {}
    }),
    addEventListener: () => {},
    dispatchEvent: () => {},
    readyState: 'complete'
};

console.log('🧪 Testing frontend event processing with real WebSocket events...\n');

// Load dashboard.js
try {
    eval(fs.readFileSync(path.join(__dirname, 'web/dashboard.js'), 'utf8'));
    console.log('✅ Dashboard.js loaded');
} catch (error) {
    console.error('❌ Failed to load dashboard.js:', error.message);
    process.exit(1);
}

// Create a dashboard instance
const dashboard = new window.RaftDashboard();
console.log('✅ Dashboard instance created');

// Connect to WebSocket and test real events
const ws = new WebSocket('ws://127.0.0.1:8082');
let eventCount = 0;
let leaderElections = 0;
let logEntries = 0;

ws.on('open', () => {
    console.log('✅ Connected to WebSocket\n');
    ws.send(JSON.stringify({type: 'subscribe'}));
});

ws.on('message', (data) => {
    const event = JSON.parse(data);
    eventCount++;
    
    // Skip connection messages
    if (event.type === 'connected' || event.type === 'subscribed') {
        return;
    }
    
    // Test our dashboard processing
    const beforeStats = { ...dashboard.statistics };
    const beforeNodes = dashboard.nodes.size;
    
    // Process the event
    dashboard.updateStatisticsFromEvent(event);
    dashboard.updateNodeFromEvent(event);
    
    const afterStats = { ...dashboard.statistics };
    const afterNodes = dashboard.nodes.size;
    
    // Show first few events
    if (eventCount <= 5) {
        console.log(`📊 Event ${eventCount}: ${event.event_type?.type || event.type}`);
        console.log(`   Node: ${event.node_id}, Term: ${event.term}`);
        console.log(`   Stats before: messages=${beforeStats.totalMessages}, elections=${beforeStats.leaderElections}, term=${beforeStats.currentTerm}`);
        console.log(`   Stats after:  messages=${afterStats.totalMessages}, elections=${afterStats.leaderElections}, term=${afterStats.currentTerm}`);
        console.log(`   Nodes: ${beforeNodes} → ${afterNodes}\n`);
    }
    
    // Track leader elections and log entries
    if (event.event_type?.type === 'LeaderElected') {
        leaderElections++;
    }
    if (event.event_type?.type === 'LogEntryAdded') {
        logEntries++;
    }
});

ws.on('close', () => {
    console.log(`📊 Final Results:`);
    console.log(`   Events processed: ${eventCount}`);
    console.log(`   Dashboard stats: ${JSON.stringify(dashboard.statistics, null, 2)}`);
    console.log(`   Nodes tracked: ${dashboard.nodes.size}`);
    console.log(`   Leader elections seen: ${leaderElections}`);
    console.log(`   Log entries seen: ${logEntries}`);
    
    // Show node states
    console.log(`\n📋 Node States:`);
    for (const [id, node] of dashboard.nodes) {
        console.log(`   Node ${id}: ${node.state} (term ${node.term})`);
    }
});

ws.on('error', (err) => {
    console.error('❌ WebSocket error:', err.message);
});

// Run for 10 seconds
setTimeout(() => {
    console.log('\n🏁 Test completed, closing connection...');
    ws.close();
}, 10000);