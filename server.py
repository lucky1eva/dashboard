#!/usr/bin/env python3
import http.server
import socketserver
import os
import webbrowser
from pathlib import Path

PORT = 8000

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

def start_server():
    """Start local HTTP server for the clinical trials dashboard"""
    
    # Check if we're in the right directory
    if not Path('index.html').exists():
        print("❌ Error: index.html not found in current directory")
        print("Please run this script from the clinical-trials-dashboard folder")
        return
    
    # Create data directory if it doesn't exist
    Path('data').mkdir(exist_ok=True)
    
    # Check for JSON files
    json_files = list(Path('data').glob('*.json'))
    if not json_files:
        print("⚠️  Warning: No JSON files found in data/ directory")
        print("Please add your JSON files to the data/ folder")
    else:
        print(f"✅ Found {len(json_files)} JSON files:")
        for f in json_files:
            print(f"   - {f.name}")
    
    # Start server
    with socketserver.TCPServer(("", PORT), CustomHTTPRequestHandler) as httpd:
        print(f"\n🚀 Clinical Trials Dashboard Server Started!")
        print(f"📂 Serving files from: {os.getcwd()}")
        print(f"🌐 Open your browser to: http://localhost:{PORT}")
        print(f"🔄 Press Ctrl+C to stop the server\n")
        
        # Try to open browser automatically
        try:
            webbrowser.open(f'http://localhost:{PORT}')
        except:
            pass
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n👋 Server stopped!")

if __name__ == "__main__":
    start_server()