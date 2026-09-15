import os
import sys
import traceback

dir_path = os.path.dirname(os.path.realpath(__file__))
parent_dir = os.path.dirname(dir_path)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

try:
    from app import app as flask_app

    class SafeWSGIMiddleware:
        def __init__(self, wsgi_app):
            self.wsgi_app = wsgi_app

        def __call__(self, environ, start_response):
            try:
                return self.wsgi_app(environ, start_response)
            except Exception:
                err_text = traceback.format_exc()
                status = '200 OK'
                response_headers = [('Content-Type', 'text/html; charset=utf-8')]
                start_response(status, response_headers)
                html = f'<html><body><h1>WSGI Serverless Diagnostic Log</h1><pre>{err_text}</pre></body></html>'
                return [html.encode('utf-8')]

    app = SafeWSGIMiddleware(flask_app)

except Exception:
    startup_err = traceback.format_exc()
    def app(environ, start_response):
        status = '200 OK'
        response_headers = [('Content-Type', 'text/html; charset=utf-8')]
        start_response(status, response_headers)
        html = f'<html><body><h1>Vercel Startup Exception</h1><pre>{startup_err}</pre></body></html>'
        return [html.encode('utf-8')]
