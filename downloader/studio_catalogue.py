"""Persistent discovery catalogue, separate from expiring request caches."""
from contextlib import contextmanager
import json
import sqlite3
import time
from pathlib import Path

class DiscoveryCatalogue:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.path = self.root / 'discovery-catalogue.sqlite3'
        with self.connect() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS videos(id TEXT PRIMARY KEY,payload TEXT NOT NULL,query TEXT,language TEXT,first_seen REAL,last_seen REAL,shown REAL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS channels(id TEXT PRIMARY KEY,name TEXT,uploads TEXT,last_checked REAL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS channel_statistics(id TEXT PRIMARY KEY,subscribers INTEGER,hidden INTEGER,checked_at REAL);
            CREATE TABLE IF NOT EXISTS migrated(path TEXT PRIMARY KEY,mtime REAL);
            ''')
    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=20)
        db.execute('PRAGMA busy_timeout=20000')
        try:
            with db:
                yield db
        finally:
            db.close()
    def add(self, rows):
        added = 0
        with self.connect() as db:
            for item, query, language in rows:
                vid = item.get('id')
                if not vid:
                    continue
                now = time.time()
                old = db.execute('SELECT payload FROM videos WHERE id=?', (vid,)).fetchone()
                if old:
                    # Do not replace verified provider details with incomplete search metadata.
                    previous = json.loads(old[0])
                    if item.get('_source_provider') == 'serpapi' and not previous.get('_source_provider'):
                        item = previous
                    db.execute('UPDATE videos SET payload=?,last_seen=? WHERE id=?', (json.dumps(item, ensure_ascii=False), now, vid))
                else:
                    db.execute('INSERT INTO videos(id,payload,query,language,first_seen,last_seen) VALUES(?,?,?,?,?,?)', (vid,json.dumps(item,ensure_ascii=False),query,language,now,now))
                    added += 1
                snippet = item.get('snippet', {})
                cid = snippet.get('channelId')
                if cid:
                    db.execute('INSERT INTO channels(id,name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name', (cid,snippet.get('channelTitle','')))
        return added
    def migrate_caches(self):
        for path in (self.root / 'youtube_raw_cache').glob('*.json'):
            stamp = path.stat().st_mtime
            with self.connect() as db:
                old = db.execute('SELECT mtime FROM migrated WHERE path=?', (path.name,)).fetchone()
            if old and old[0] == stamp:
                continue
            try:
                self.add(json.loads(path.read_text(encoding='utf-8')).get('items', []))
            except (ValueError, KeyError, TypeError):
                continue
            with self.connect() as db:
                db.execute('INSERT OR REPLACE INTO migrated VALUES(?,?)', (path.name,stamp))
    def rows(self, unseen=False):
        with self.connect() as db:
            rows = db.execute('SELECT payload,query,language FROM videos '+('WHERE shown=0 ' if unseen else '')+'ORDER BY first_seen DESC').fetchall()
        return [(json.loads(p),q,l) for p,q,l in rows]
    def mark_shown(self, ids):
        with self.connect() as db:
            db.executemany('UPDATE videos SET shown=? WHERE id=?', [(time.time(),v) for v in ids])
    def channels(self):
        with self.connect() as db:
            return [dict(zip(('id','name','uploads','last_checked'),r)) for r in db.execute('SELECT id,name,uploads,last_checked FROM channels ORDER BY last_checked,id')]
    def stats(self):
        with self.connect() as db:
            return {'videos':db.execute('SELECT COUNT(*) FROM videos').fetchone()[0], 'channels':db.execute('SELECT COUNT(*) FROM channels').fetchone()[0], 'unseen':db.execute('SELECT COUNT(*) FROM videos WHERE shown=0').fetchone()[0]}
    def update_channel(self, cid, uploads):
        with self.connect() as db:
            db.execute('UPDATE channels SET uploads=?,last_checked=? WHERE id=?', (uploads,time.time(),cid))

    def save_channel_statistics(self, items):
        with self.connect() as db:
            for item in items:
                statistics = item.get('statistics', {})
                value = statistics.get('subscriberCount')
                subscribers = int(value) if value is not None and str(value).isdigit() else None
                db.execute('INSERT OR REPLACE INTO channel_statistics VALUES(?,?,?,?)', (item['id'], subscribers, int(bool(statistics.get('hiddenSubscriberCount', False))), time.time()))
    def channel_statistics(self):
        with self.connect() as db:
            return {row[0]:{'subscribers':row[1],'hidden':bool(row[2]),'checked_at':row[3]} for row in db.execute('SELECT id,subscribers,hidden,checked_at FROM channel_statistics')}
