# Python TCP Reverse Tunnel Server
# Listens on a public port and forwards all TCP data to a connected client tunnel

import socket
import threading

LISTEN_HOST = '0.0.0.0'
LISTEN_PORT = 9000  # Public port for incoming connections

# When a client connects, we store its socket here
client_tunnel = None
client_lock = threading.Lock()

def handle_client_connection(client_sock, addr):
    global client_tunnel
    print(f"[Server] New client tunnel connected from {addr}")
    with client_lock:
        client_tunnel = client_sock
    try:
        while True:
            data = client_sock.recv(4096)
            if not data:
                break
    except Exception as e:
        print(f"[Server] Tunnel client error: {e}")
    finally:
        with client_lock:
            client_tunnel = None
        client_sock.close()
        print(f"[Server] Tunnel client disconnected")

def handle_incoming_connection(conn, addr):
    global client_tunnel
    print(f"[Server] Incoming connection from {addr}")
    with client_lock:
        tunnel = client_tunnel
    if tunnel is None:
        print("[Server] No tunnel client connected, closing incoming connection")
        conn.close()
        return
    # Start bidirectional forwarding
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
    threading.Thread(target=forward, args=(conn, tunnel)).start()
    threading.Thread(target=forward, args=(tunnel, conn)).start()

def main():
    # Listen for tunnel client
    tunnel_server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    tunnel_server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    tunnel_server.bind((LISTEN_HOST, LISTEN_PORT + 1))
    tunnel_server.listen(1)
    print(f"[Server] Waiting for tunnel client on port {LISTEN_PORT + 1}")
    threading.Thread(target=lambda: handle_client_connection(*tunnel_server.accept())).start()

    # Listen for incoming connections
    public_server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    public_server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    public_server.bind((LISTEN_HOST, LISTEN_PORT))
    public_server.listen(100)
    print(f"[Server] Listening for incoming connections on port {LISTEN_PORT}")
    while True:
        conn, addr = public_server.accept()
        threading.Thread(target=handle_incoming_connection, args=(conn, addr)).start()

if __name__ == '__main__':
    main()
