# Python TCP Reverse Tunnel Client
# Connects to the server and exposes a local port, forwarding all data to the server

import socket
import threading

SERVER_HOST = 'your.server.ip'  # Set to your server's public IP
SERVER_PORT = 9001  # Port the server listens for tunnel clients (LISTEN_PORT+1)
LOCAL_HOST = '127.0.0.1'
LOCAL_PORT = 8778  # Local service port to forward to


def handle_local_connection(local_sock, tunnel_sock):
    def forward(src, dst):
        try:
            while True:
                data = src.recv(4096)
                if not data:
                    break
                dst.sendall(data)
        except Exception:
            pass
        finally:
            src.close()
            dst.close()
    threading.Thread(target=forward, args=(local_sock, tunnel_sock)).start()
    threading.Thread(target=forward, args=(tunnel_sock, local_sock)).start()

def main():
    # Connect to the server as a tunnel client
    tunnel_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    tunnel_sock.connect((SERVER_HOST, SERVER_PORT))
    print(f"[Client] Connected to tunnel server at {SERVER_HOST}:{SERVER_PORT}")

    # Listen for local connections to forward
    local_server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    local_server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    local_server.bind((LOCAL_HOST, LOCAL_PORT))
    local_server.listen(100)
    print(f"[Client] Listening for local connections on {LOCAL_HOST}:{LOCAL_PORT}")
    while True:
        local_sock, addr = local_server.accept()
        print(f"[Client] New local connection from {addr}")
        # For each local connection, use the tunnel socket to the server
        threading.Thread(target=handle_local_connection, args=(local_sock, tunnel_sock)).start()

if __name__ == '__main__':
    main()
