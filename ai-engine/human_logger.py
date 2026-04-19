import socket
import json
import os
import sys
import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime
import glob
import re

log_dir = r"C:\Users\hayfo\source\OpenRCT2\logs"
os.makedirs(log_dir, exist_ok=True)

# 1. Strip the A-latest badge from all older logs to maintain exactly one latest badge
old_latest = glob.glob(os.path.join(log_dir, "A-latest-human-build-*.log"))
for old_log in old_latest:
    clean_name = os.path.basename(old_log).replace("A-latest-", "")
    os.rename(old_log, os.path.join(log_dir, clean_name))

timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
log_file = os.path.join(log_dir, f"A-latest-human-build-{timestamp}.log")

# Create a rotating file handler: max 30MB, keep 3 backups
handler = RotatingFileHandler(log_file, maxBytes=30*1024*1024, backupCount=3)
logging.basicConfig(handlers=[handler], level=logging.INFO, format="%(message)s")

class PrintLogger:
    def write(self, message):
        if message.strip() != "":
            logging.info(message.strip())
        sys.__stdout__.write(message)
    def flush(self):
        sys.__stdout__.flush()

sys.stdout = PrintLogger()

def start_human_server(host='127.0.0.1', port=1337):
    print("========================================")
    print("   OpenRCT2 Human Interceptor Logger    ")
    print("========================================")
    print(f"Saving your manual layouts to: {log_file}")
    print("Waiting for game to connect...")

    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.bind((host, port))
    server_socket.listen()

    while True:
        conn, addr = server_socket.accept()
        print(f"\n[Bridge] Game connected actively from {addr}!")
        
        # Declare Human Mode to the JS Engine
        conn.sendall(json.dumps({"type": "config", "mode": "human"}).encode('utf-8') + b"\n")
        
        try:
            buffer = ""
            while True:
                data = conn.recv(1024)
                if not data: break
                
                buffer += data.decode('utf-8')
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    
                    try:
                        state = json.loads(line)
                        if state.get("type") == "handshake":
                            print(f"[Handshake] {state.get('msg')}")
                        elif state.get("type") == "intercept":
                            print(f"\n[INTERCEPT] Action: {state['action']}")
                            print(json.dumps(state['args'], indent=2))
                    except json.JSONDecodeError:
                        pass
        except Exception as e:
            print(f"[Bridge] Connection dropped: {e}")
        finally:
            conn.close()
            print("Listening for a new connection...")

if __name__ == "__main__":
    start_human_server()
