#!/usr/bin/env node

/**
 * Test script to simulate browser script loading order
 */

const fs = require('fs');
const path = require('path');

// Simulate browser globals
global.window = global;
global.document = {
    getElementById: (id) => ({ textContent: '', innerHTML: '' }),
    createElement: (tag) => ({ 
        className: '',
        textContent: '',
        appendChild: () => {},
        addEventListener: () => {}
    }),
    addEventListener: () => {},
    dispatchEvent: () => {},
    readyState: 'complete'
};
global.WebSocket = class WebSocket {
    constructor(url) { this.url = url; }
    on() {}
    send() {}
    close() {}
};

console.log('🧪 Testing script loading order...\n');

try {
    // Load scripts in the same order as the HTML
    console.log('1️⃣ Loading websocket.js...');
    eval(fs.readFileSync(path.join(__dirname, 'web/websocket.js'), 'utf8'));
    console.log(`   ✅ WebSocketManager: ${typeof window.WebSocketManager}`);

    console.log('2️⃣ Loading visualization.js...');
    eval(fs.readFileSync(path.join(__dirname, 'web/visualization.js'), 'utf8'));
    console.log(`   ✅ RaftVisualization: ${typeof window.RaftVisualization}`);

    console.log('3️⃣ Loading dashboard.js...');
    eval(fs.readFileSync(path.join(__dirname, 'web/dashboard.js'), 'utf8'));
    console.log(`   ✅ RaftDashboard: ${typeof window.RaftDashboard}`);

    console.log('4️⃣ Loading app.js...');
    eval(fs.readFileSync(path.join(__dirname, 'web/app.js'), 'utf8'));
    console.log(`   ✅ RaftApp: ${typeof window.RaftApp}`);

    console.log('\n🎉 All scripts loaded successfully!');
    
    // Test creating instances
    console.log('\n🔧 Testing class instantiation...');
    
    const dashboard = new window.RaftDashboard();
    console.log('✅ RaftDashboard instance created');
    
    const visualization = new window.RaftVisualization('testCanvas');
    console.log('✅ RaftVisualization instance created');
    
    console.log('\n✅ All tests passed! The scripts should load correctly in the browser.');
    
} catch (error) {
    console.error('\n❌ Script loading failed:');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
}