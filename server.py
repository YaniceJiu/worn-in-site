# -*- coding: utf-8 -*-
"""Worn-In 本地服务器：静态文件 + 保存配置 + 泵桥接（串口）。

用法:
  python server.py                         # HTTP  0.0.0.0:8904
  python server.py --https                 # HTTPS 0.0.0.0:8443（局域网/其它设备，摄像头需要 HTTPS）
  python server.py --port 9000 --https
  python server.py --serial-port COM3      # 手动指定 ESP32 串口

接口:
  POST /save   -> 把请求体(JSON)写回 wornin_project.json
  POST /pump   -> {"style":"甜美少女"} 或 {"pump":3} -> 串口指挥 ESP32 转对应泵
"""
import http.server, socketserver, os, sys, json, socket, time, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))

PORT = 8904
USE_HTTPS = '--https' in sys.argv
SERIAL_PORT = None
BAUD = 115200

for i, a in enumerate(sys.argv):
    if a == '--port' and i + 1 < len(sys.argv):
        PORT = int(sys.argv[i + 1])
    if a == '--serial-port' and i + 1 < len(sys.argv):
        SERIAL_PORT = sys.argv[i + 1]

if USE_HTTPS and PORT == 8904:
    PORT = 8443

# 风格 -> 泵号（与 js/play.js 里 PUMP_MAP 保持一致）
STYLE_TO_PUMP = {
    '野性风': 1, '办公风格': 2, '甜美少女': 3,
    '运动风': 4, '森系居家': 5, '晚礼服/名媛': 6,
}

try:
    import serial
    from serial.tools import list_ports
except ImportError:
    serial = None
    list_ports = None

_ser = None


def find_port():
    if list_ports is None:
        return None
    ports = list(list_ports.comports())
    if not ports:
        return None
    for p in ports:
        desc = ' '.join(filter(None, [p.description, p.manufacturer, p.hwid]))
        if any(k in desc for k in ('CP210', 'CH340', 'CH9102', 'USB Serial', 'Espressif', 'USB JTAG')):
            return p.device
    return ports[0].device


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    except Exception:
        return '127.0.0.1'
    finally:
        s.close()


def send_pump(pump_no, target=1.0):
    global _ser
    if serial is None:
        raise RuntimeError('电脑未安装 pyserial，请先: pip install pyserial')
    port = SERIAL_PORT or find_port()
    if not port:
        raise RuntimeError('没找到 ESP32 串口，请插好 USB 或加 --serial-port COMx')
    if _ser is None or not _ser.is_open:
        _ser = serial.Serial(port, BAUD, timeout=1)
        time.sleep(2)   # 等 ESP32 复位/就绪
    _ser.reset_input_buffer()
    _ser.write(('P%d:%.2f\n' % (pump_no, target)).encode('utf-8'))
    return {'ok': True, 'pump': pump_no, 'target': target, 'port': port}


# ---------- Stripe（扫码收款） ----------
STRIPE_AMOUNT_CENTS = 3500          # 默认 $35
STRIPE_PRODUCT_NAME = 'Worn-In Perfume'


def load_stripe_key():
    """密钥优先从环境变量 STRIPE_SECRET_KEY 读，其次从 stripe_key.txt 读（跳过注释/空行）。"""
    k = os.environ.get('STRIPE_SECRET_KEY', '').strip()
    if k:
        return k
    p = os.path.join(ROOT, 'stripe_key.txt')
    if os.path.exists(p):
        for line in open(p, encoding='utf-8'):
            line = line.strip()
            if line and not line.startswith('#'):
                return line
    return ''


def _stripe_req(method, path, form=None):
    key = load_stripe_key()
    if not key:
        raise RuntimeError('Stripe 未配置：请在项目根目录创建 stripe_key.txt，填入 sk_test_... 或 sk_live_...')
    headers = {'Authorization': 'Bearer ' + key}
    data = None
    if form is not None:
        data = urllib.parse.urlencode(form).encode('utf-8')
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
    req = urllib.request.Request('https://api.stripe.com/v1/' + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode('utf-8'))


def stripe_create_payment(amount_cents=None, product_name=None):
    amount = int(amount_cents or STRIPE_AMOUNT_CENTS)
    name = product_name or STRIPE_PRODUCT_NAME
    base = 'http://%s:%d/play.html' % (lan_ip(), PORT)
    obj = _stripe_req('POST', 'checkout/sessions', {
        'mode': 'payment',
        'success_url': base + '?paid=1',
        'cancel_url': base,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': str(amount),
        'line_items[0][price_data][product_data][name]': name,
    })
    return obj


def stripe_payment_status(session_id):
    obj = _stripe_req('GET', 'checkout/sessions/' + urllib.parse.quote(session_id))
    return obj.get('payment_status', 'unpaid')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/payment-status'):
            try:
                q = urllib.parse.urlparse(self.path).query
                params = dict(urllib.parse.parse_qsl(q))
                sid = params.get('id', '')
                if not sid:
                    raise ValueError('missing id')
                status = stripe_payment_status(sid)
                self._json(200, {'ok': True, 'status': status})
            except Exception as e:
                self._json(500, {'ok': False, 'error': str(e)})
        else:
            super().do_GET()

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
        elif self.path.startswith('/pump'):
            try:
                n = int(self.headers.get('Content-Length', 0))
                data = json.loads(self.rfile.read(n) or b'{}')
                style = data.get('style', '')
                pump = data.get('pump') or STYLE_TO_PUMP.get(style)
                if not pump:
                    raise ValueError('未知风格: %r' % style)
                duration = float(data.get('duration', 1.0))
                result = send_pump(int(pump), duration)
                result['style'] = style
                self._json(200, result)
            except Exception as e:
                self._json(500, {'ok': False, 'error': str(e)})
        elif self.path.startswith('/create-payment'):
            try:
                n = int(self.headers.get('Content-Length', 0))
                data = json.loads(self.rfile.read(n) or b'{}')
                obj = stripe_create_payment(data.get('amount'), data.get('name'))
                self._json(200, {'ok': True, 'id': obj.get('id'), 'url': obj.get('url')})
            except Exception as e:
                self._json(500, {'ok': False, 'error': str(e)})
        else:
            self._json(404, {'ok': False, 'error': 'not found'})

    def log_message(self, fmt, *args):
        sys.stderr.write("[srv] %s\n" % (fmt % args))


if __name__ == '__main__':
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(('0.0.0.0', PORT), Handler) as httpd:
        scheme = 'https' if USE_HTTPS else 'http'
        if USE_HTTPS:
            import ssl
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ctx.load_cert_chain(os.path.join(ROOT, 'certs', 'server.pem'),
                                os.path.join(ROOT, 'certs', 'server.key'))
            httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
        print('Serving on %s://127.0.0.1:%d  (root=%s)' % (scheme, PORT, ROOT))
        print('局域网其它设备: %s://%s:%d/play.html' % (scheme, lan_ip(), PORT))
        print('泵接口: POST /pump {"style":"甜美少女"}')
        if load_stripe_key():
            print('Stripe: 已配置密钥（扫码收款可用）')
        else:
            print('Stripe: 未配置密钥 —— 创建 stripe_key.txt 填入 sk_test_.../sk_live_... 后即可扫码收款')
        httpd.serve_forever()
