#!/usr/bin/env python3
"""
Simple whitespace cleaner for Batch 1:
- Remove trailing whitespace (spaces/tabs) at end of lines
- Replace lines that contain only whitespace with an empty line
- Ensure file ends with a single newline
- Operate on all .py files under backend/
- Print list of changed files
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / 'backend'

changed = []

for path in sorted(BACKEND.rglob('*.py')):
    try:
        text = path.read_text(encoding='utf-8')
    except Exception:
        # fallback to latin-1
        text = path.read_text(encoding='latin-1')
    lines = text.splitlines()
    new_lines = []
    modified = False
    for ln in lines:
        # Remove trailing spaces/tabs
        stripped_trail = ln.rstrip(' \t')
        # If line contained only whitespace, make it empty
        if stripped_trail.strip() == '':
            if stripped_trail != '':
                # had spaces/tabs only -> normalize to empty
                stripped_trail = ''
        if stripped_trail != ln:
            modified = True
        new_lines.append(stripped_trail)
    # Ensure single trailing newline at EOF
    new_text = '\n'.join(new_lines) + '\n'
    if new_text != text:
        path.write_text(new_text, encoding='utf-8')
        changed.append(str(path.relative_to(ROOT)))

# Print summary
if changed:
    print('Changed files:')
    for p in changed:
        print(p)
    print(f'Total changed: {len(changed)}')
    sys.exit(0)
else:
    print('No files changed')
    sys.exit(0)
