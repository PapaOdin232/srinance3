import WebSocket from 'ws';

console.log('Connecting to WebSocket...');
const ws = new WebSocket('ws://localhost:8000/ws/bot');

ws.on('open', function open() {
  console.log('WebSocket connected!');
});

ws.on('message', function message(data) {
  console.log('Received:', data.toString());
});

ws.on('error', function error(err) {
  console.error('WebSocket error:', err);
});

ws.on('close', function close() {
  console.log('WebSocket closed');
});

// Keep the script running
setTimeout(() => {
  console.log('Test finished');
  process.exit(0);
}, 10000); // 10 seconds
