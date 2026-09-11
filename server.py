# -*- coding: utf-8 -*-
"""Worn-In 本地服务器：静态文件 + 保存 wornin_project.json 接口。
用法: python server.py  (默认 127.0.0.1:8904)
POST /save  -> 把请求体(JSON)写回工程根目录 wornin_project.json
"""
import http.server, socketserver, os, sys, json

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 8904

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def do_POST(self):
        if self.path.startswith('/save'):
            try:
                n = int(self.headers.get('Content-Length', 0))
                raw = self.rfile.read(n)
                data = raw.decode('utf-8')
                json.loads(data)   # 校验是合法 JSON
                with open(os.path.join(ROOT, 'wornin_project.json'), 'w', encoding='utf-8') as f:
                    f.write(data)
                self.send_response(200)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.end_headers()
                self.wfile.write('ok'.encode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(str(e).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("[srv] %s\n" % (fmt % args))

if __name__ == '__main__':
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Handler) as httpd:
        print('Serving on http://127.0.0.1:%d  (root=%s)' % (PORT, ROOT))
        httpd.serve_forever()
