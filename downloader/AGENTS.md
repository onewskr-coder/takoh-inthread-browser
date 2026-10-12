# Development workflow (from 3.5.4)

- Use this downloader directory as source only. Load ../../TAKOH_Development_Extension as the unpacked extension; dev_server.py synchronizes extension assets there without Python caches or runtime files.
- Use start_dev.bat or dev_server.py for development verification. Python reloads automatically; refresh the browser after reload. Reload the existing unpacked extension and site for extension edits.
- Do not routinely run build_helper.py, build.py, or create a ZIP after changes. Build release artifacts only when the user explicitly requests a distribution/release.
- Keep user data intact. Use --data-dir and a separate --port for isolated tests. Never terminate an existing helper or other port owner automatically.
- Verify behavior with focused tests and source runtime checks. Keep installed-extension, real provider and packaged-EXE evidence separate.
