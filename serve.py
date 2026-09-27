#!/usr/bin/env python3
"""Servidor local. Igual que http.server pero con HTTP/1.1 y keep-alive, que
si no hace lento pedir muchos archivos."""

import errno
import http.server
import os
import socketserver
import sys

PORT = 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass


class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    try:
        with Server(("127.0.0.1", PORT), Handler) as httpd:
            print(f"http://localhost:{PORT}  (Ctrl+C para salir)")
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                pass
    except OSError as err:
        if err.errno != errno.EADDRINUSE:
            raise
        sys.exit(
            f"\nEl puerto {PORT} ya esta ocupado.\n"
            "Seguramente hay otro servidor de esta pagina corriendo:\n\n"
            "    pkill -f 'serve[.]py'\n\n"
            "y despues volve a correr ./run.sh\n"
            "(O cambiale el puerto: PORT = 8001 en serve.py)\n"
        )
