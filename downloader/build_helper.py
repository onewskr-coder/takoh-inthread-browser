"""Rebuild the Windows helper before running build.py (requires PyInstaller)."""
import os
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
subprocess.run([
    sys.executable, '-m', 'PyInstaller', '--noconfirm', '--onefile',
    '--name', 'TAKOH_Helper', '--distpath', str(root / 'helper_build_dist'),
    '--workpath', str(root / 'helper_build_work'), '--specpath', str(root / 'helper_build_spec'),
    '--icon', 'NONE', '--collect-all', 'yt_dlp', '--copy-metadata', 'flask',
    '--add-data', f'{root / "studio_web"}{os.pathsep}studio_web',
    '--copy-metadata', 'werkzeug', '--exclude-module', 'numpy',
    '--exclude-module', 'PIL', '--exclude-module', 'pytest',
    '--exclude-module', 'playwright', '--exclude-module', 'tkinter', str(root / 'app.py')
], cwd=root, check=True)
