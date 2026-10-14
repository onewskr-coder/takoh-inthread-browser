import unittest
import threading
import time
import json
import os
import sys

# Ensure current directory is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import app as flask_app_module
from studio import lifecycle_tracker, StudioError

class TestFlaskLifecycleAndShutdown(unittest.TestCase):
    def setUp(self):
        # Reset lifecycle tracker state
        with lifecycle_tracker._lock:
            lifecycle_tracker._tasks.clear()
            lifecycle_tracker._shutting_down = False
            lifecycle_tracker._task_seq = 0
        flask_app_module.app.config['TESTING'] = True
        self.client = flask_app_module.app.test_client()

        # Get valid studio session token
        res = self.client.get('/studio/session')
        self.assertEqual(res.status_code, 200)
        self.token = res.get_json()['token']
        self.headers = {'X-Studio-Token': self.token}

    def tearDown(self):
        with lifecycle_tracker._lock:
            lifecycle_tracker._tasks.clear()
            lifecycle_tracker._shutting_down = False

    def test_busy_status_idle(self):
        res = self.client.get('/studio/busy-status')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertFalse(data['busy'])
        self.assertEqual(len(data['tasks']), 0)
        self.assertFalse(data['shutting_down'])

    def test_busy_status_with_active_tasks(self):
        tid = lifecycle_tracker.start_task('영상 업로드', 'sample.mp4')
        try:
            res = self.client.get('/studio/busy-status')
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data['busy'])
            self.assertEqual(len(data['tasks']), 1)
            self.assertEqual(data['tasks'][0]['kind'], '영상 업로드')
            self.assertEqual(data['tasks'][0]['details'], 'sample.mp4')
        finally:
            lifecycle_tracker.finish_task(tid)

        res2 = self.client.get('/studio/busy-status')
        self.assertEqual(res2.status_code, 200)
        self.assertFalse(res2.get_json()['busy'])

    def test_shutdown_blocked_when_busy(self):
        tid = lifecycle_tracker.start_task('동영상 편집', 'job_123')
        try:
            res = self.client.post('/studio/shutdown', headers=self.headers, json={})
            self.assertEqual(res.status_code, 409)
            data = res.get_json()
            self.assertIn('진행 중인 작업', data['error'])
            self.assertTrue(data['busy'])
            self.assertFalse(data['shutting_down'])
        finally:
            lifecycle_tracker.finish_task(tid)

    def test_shutdown_allowed_when_idle_and_rejects_new_tasks(self):
        # When idle, request_shutdown should succeed
        res = self.client.post('/studio/shutdown', headers=self.headers, json={})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['success'])
        self.assertTrue(data['shutting_down'])

        # After shutdown initiated, starting a new task must fail with 503
        with self.assertRaises(StudioError) as ctx:
            lifecycle_tracker.start_task('AI 분석', 'job_456')
        self.assertEqual(ctx.exception.status, 503)

    def test_shutdown_failure_recovery(self):
        # Verify that if shutdown fails, cancel_shutdown restores operational state
        approved, _, _ = lifecycle_tracker.request_shutdown()
        self.assertTrue(approved)
        self.assertTrue(lifecycle_tracker.is_shutting_down())

        # Simulate shutdown handler failure causing recovery
        lifecycle_tracker.cancel_shutdown()
        self.assertFalse(lifecycle_tracker.is_shutting_down())

        # After recovery, new tasks must succeed normally
        tid = lifecycle_tracker.start_task('영상 업로드', 'recovery_test.mp4')
        self.assertIsNotNone(tid)
        lifecycle_tracker.finish_task(tid)

    def test_concurrency_race_condition(self):
        # Test concurrent task start and shutdown requests
        errors = []
        started_tasks = []
        shutdown_results = []

        def worker_task(i):
            try:
                tid = lifecycle_tracker.start_task(f'작업-{i}', f'det-{i}')
                started_tasks.append(tid)
                time.sleep(0.04)
                lifecycle_tracker.finish_task(tid)
            except StudioError as e:
                # 503 is expected if shutdown won the race
                if e.status != 503:
                    errors.append(f'Unexpected StudioError: {e}')
            except Exception as e:
                errors.append(str(e))

        def worker_shutdown():
            time.sleep(0.01)
            with flask_app_module.app.test_client() as c:
                res = c.post('/studio/shutdown', headers=self.headers, json={})
                if res.status_code in (200, 409):
                    shutdown_results.append(res.status_code)
                else:
                    errors.append(f'Unexpected status code: {res.status_code}')

        threads = [threading.Thread(target=worker_task, args=(i,)) for i in range(10)]
        threads.append(threading.Thread(target=worker_shutdown))

        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(errors), 0, f'Errors occurred: {errors}')
        self.assertTrue(len(shutdown_results) > 0)

if __name__ == '__main__':
    unittest.main()
