import subprocess
import time
import urllib.request
import json
import sys
import os
import tempfile
import socket
import unittest

def is_port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        try:
            s.connect(('127.0.0.1', port))
            return True
        except (ConnectionRefusedError, socket.timeout, OSError):
            return False

class TestRealHelperShutdownAndRecovery(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_port = 5997
        cls.temp_data_dir = tempfile.mkdtemp(prefix="takoh_test_recovery_")
        cls.env = os.environ.copy()
        cls.env["PORT"] = str(cls.test_port)
        cls.env["TAKOH_DEV_MODE"] = "1"
        cls.env["TAKOH_DATA_DIR"] = cls.temp_data_dir

        cls.downloader_dir = os.path.dirname(os.path.abspath(__file__))
        cls.proc = subprocess.Popen(
            [sys.executable, "app.py"],
            cwd=cls.downloader_dir,
            env=cls.env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        # Wait for listening
        deadline = time.time() + 10
        cls.token = None
        while time.time() < deadline:
            if cls.proc.poll() is not None:
                raise RuntimeError(f"Helper died early with code {cls.proc.returncode}")
            if is_port_open(cls.test_port):
                try:
                    req = urllib.request.Request(f"http://127.0.0.1:{cls.test_port}/studio/session")
                    with urllib.request.urlopen(req, timeout=1) as resp:
                        cls.token = json.loads(resp.read().decode()).get("token")
                        if cls.token:
                            break
                except Exception:
                    pass
            time.sleep(0.3)
        if not cls.token:
            cls.proc.kill()
            raise RuntimeError("Failed to acquire studio session token from real process")

    @classmethod
    def tearDownClass(cls):
        if cls.proc and cls.proc.poll() is None:
            cls.proc.kill()
        try:
            import shutil
            shutil.rmtree(cls.temp_data_dir, ignore_errors=True)
        except Exception:
            pass

    def test_1_status_and_busy_rejection(self):
        # Verify busy-status initially idle
        req = urllib.request.Request(f"http://127.0.0.1:{self.test_port}/studio/busy-status")
        with urllib.request.urlopen(req, timeout=1) as resp:
            data = json.loads(resp.read().decode())
            self.assertFalse(data["busy"])
            self.assertFalse(data["shutting_down"])

    def test_2_unauthenticated_shutdown_rejected(self):
        # Shutdown without token or invalid token must return 403
        req = urllib.request.Request(
            f"http://127.0.0.1:{self.test_port}/studio/shutdown",
            data=b"{}",
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(req, timeout=1)
        self.assertEqual(ctx.exception.code, 403)

    def test_3_real_graceful_shutdown_and_exit(self):
        # Authenticated shutdown
        req = urllib.request.Request(
            f"http://127.0.0.1:{self.test_port}/studio/shutdown",
            data=b"{}",
            headers={
                "Content-Type": "application/json",
                "X-Studio-Token": self.token
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=2) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertTrue(data["success"])
            self.assertTrue(data["shutting_down"])

        # Wait for actual process termination
        deadline = time.time() + 5
        exited = False
        while time.time() < deadline:
            ret = self.proc.poll()
            if ret is not None:
                exited = True
                self.assertEqual(ret, 0, f"Expected clean exit code 0, got {ret}")
                break
            time.sleep(0.2)
        self.assertTrue(exited, "Process did not terminate within 5 seconds")
        self.assertFalse(is_port_open(self.test_port), f"Port {self.test_port} must be closed")

if __name__ == "__main__":
    unittest.main()
