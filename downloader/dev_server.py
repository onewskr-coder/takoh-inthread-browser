"""Run the 3.5.4 source helper with automatic Python reload, without builds."""
import argparse
import os
from pathlib import Path
import socket
import threading
import time
from dev_extension import DEFAULT_TARGET, sync_extension, watch_extension


class RequestActivity:
    """Keep source reloads from interrupting mutating studio requests."""
    def __init__(self, application):
        self.application = application
        self.condition = threading.Condition()
        self.active = 0

    def __call__(self, environ, start_response):
        tracked = environ.get('PATH_INFO', '').startswith('/studio/') and environ.get('REQUEST_METHOD') != 'GET'
        if tracked:
            with self.condition:
                self.active += 1
        response = None
        try:
            response = self.application(environ, start_response)
            yield from response
        finally:
            try:
                if response is not None and hasattr(response, 'close'):
                    response.close()
            finally:
                if tracked:
                    with self.condition:
                        self.active -= 1
                        self.condition.notify_all()


def guarded_reloader(activity):
    from werkzeug._reloader import StatReloaderLoop

    class GuardedReloader(StatReloaderLoop):
        def trigger_reload(self, filename):
            with activity.condition:
                if activity.active:
                    print('Source changed. Waiting for studio analysis/edit requests to finish before restart.', flush=True)
                while activity.active:
                    activity.condition.wait(.25)
            # Do not exit into an incomplete source file while an editor is saving it.
            while True:
                try:
                    for name in ('app.py', 'studio.py', 'studio_ai.py', 'studio_writing.py', 'studio_integrations.py', 'studio_text_clean.py', 'studio_secrets.py', 'build.py'):
                        path = Path(__file__).parent / name
                        compile(path.read_text(encoding='utf-8-sig'), str(path), 'exec')
                    import ast
                    tree=ast.parse((Path(__file__).parent/'build.py').read_text(encoding='utf-8-sig'))
                    assets=next(ast.literal_eval(node.value) for node in tree.body if isinstance(node,ast.Assign) and any(isinstance(target,ast.Name) and target.id=='EXTENSION_FILES' for target in node.targets))
                    if any(not (Path(__file__).parent/name).is_file() for name in assets):raise OSError('Extension assets are being updated')
                    break
                except (SyntaxError, OSError):
                    time.sleep(.5)
            # Recheck requests that may have started during validation.
            with activity.condition:
                while activity.active:
                    activity.condition.wait(.25)
                super().trigger_reload(filename)
    return GuardedReloader


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=int(os.environ.get('PORT', '5005')))
    parser.add_argument('--data-dir', help='Optional isolated data folder for verification')
    parser.add_argument('--extension-dir', type=Path, default=DEFAULT_TARGET)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('port must be between 1 and 65535')
    os.environ['TAKOH_DEV_MODE'] = '1'
    os.environ['PORT'] = str(args.port)
    if args.data_dir:
        os.environ['STUDIO_DATA_DIR'] = str(Path(args.data_dir).resolve())
    if os.environ.get('WERKZEUG_RUN_MAIN') != 'true':
        with socket.socket() as probe:
            try:
                probe.bind(('127.0.0.1', args.port))
            except OSError:
                raise SystemExit(f'Port {args.port} is unavailable. Close the previous helper and run again. No process was terminated.')
        print(f'Development helper: http://127.0.0.1:{args.port}/studio/', flush=True)
        print('Python changes restart the helper. Refresh the studio page after a restart.', flush=True)
    sync_extension(destination=args.extension_dir)
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        watch_extension(args.extension_dir)
    else:
        print(f'Unpacked extension folder: {args.extension_dir.resolve()}', flush=True)
        print('Extension assets sync automatically. Reload the extension and site after edits.', flush=True)
    from app import app
    from werkzeug._reloader import reloader_loops
    activity = RequestActivity(app.wsgi_app)
    app.wsgi_app = activity
    reloader_loops['takoh_guarded'] = guarded_reloader(activity)
    app.run(host='127.0.0.1', port=args.port, debug=False, use_reloader=True,
            reloader_type='takoh_guarded', reloader_interval=1,
            exclude_patterns=['*test_*.py', '*verify_*.py', str(Path(__file__).parent / 'scratch' / '*'), '*site-packages*'])


if __name__ == '__main__':
    main()
