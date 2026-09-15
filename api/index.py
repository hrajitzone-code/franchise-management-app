import os
import sys
import traceback

dir_path = os.path.dirname(os.path.realpath(__file__))
parent_dir = os.path.dirname(dir_path)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

try:
    from app import app
except Exception as e:
    err_msg = traceback.format_exc()
    from flask import Flask
    app = Flask(__name__)
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def catch_all(path):
        return f'<h1>Vercel Startup Error Traceback</h1><pre>{err_msg}</pre>', 500
