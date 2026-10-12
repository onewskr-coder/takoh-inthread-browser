"""Synchronize extension assets only; never build or copy Python/runtime data."""
import argparse
import logging
import os
from pathlib import Path
import threading

from build import EXTENSION_FILES

SOURCE = Path(__file__).resolve().parent
DEFAULT_TARGET = SOURCE.parents[1] / 'TAKOH_Development_Extension'


def sync_extension(source=SOURCE, destination=DEFAULT_TARGET):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if destination == source or source.is_relative_to(destination):
        raise ValueError('Extension destination must be separate from the source tree')
    names = [name for name in EXTENSION_FILES if name != 'manifest.json']
    names += [p.relative_to(source).as_posix() for p in (source / 'icons').rglob('*')
              if p.is_file() and not any(part.startswith('_') for part in p.relative_to(source).parts)]
    names.append('manifest.json')
    # Validate all inputs before writing so a missing asset is visible immediately.
    for name in names:
        if not (source / name).is_file():
            raise FileNotFoundError(source / name)
    changed = []
    for name in names:
        content = (source / name).read_bytes()
        target = destination / name
        if target.is_file() and target.read_bytes() == content:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + '.sync-tmp')
        temporary.write_bytes(content)
        os.replace(temporary, target)
        changed.append(name)
    return changed


def watch_extension(destination, interval=1):
    stop = threading.Event()

    def run():
        while not stop.wait(interval):
            try:
                changed = sync_extension(destination=destination)
                if changed:
                    print('Extension assets updated. Reload the extension and site.', flush=True)
            except Exception:
                logging.exception('Extension synchronization failed')

    threading.Thread(target=run, name='extension-assets', daemon=True).start()
    return stop


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--destination', type=Path, default=DEFAULT_TARGET)
    args = parser.parse_args()
    changed = sync_extension(destination=args.destination)
    print(f'Extension folder: {args.destination.resolve()} ({len(changed)} files updated)')
