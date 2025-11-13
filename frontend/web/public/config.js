// Global configuration for all frontend pages
// Automatically detects protocol (http/https) and uses current host
const APP_CONFIG = {
  // Base URL for API calls - uses current protocol and host
  BASE_URL: window.location.origin,
  
  // Auth service base (goes through gateway)
  AUTH_BASE: window.location.origin,
  
  // WebSocket protocol based on current page protocol
  WS_PROTOCOL: window.location.protocol === 'https:' ? 'wss:' : 'ws:',
  
  // Full WebSocket URL
  get WS_URL() {
    return `${this.WS_PROTOCOL}//${window.location.host}`;
  }
};

console.log('[config] APP_CONFIG initialized:', APP_CONFIG);
