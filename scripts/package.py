"""Build a deterministic, installable ZIP containing only extension files."""
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'extension/manifest.json').read_text())['version']
output = root / 'dist' / f'save-picture-as-{version}.zip'
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', compression=ZIP_DEFLATED) as archive:
    for path in sorted((root / 'extension').rglob('*')):
        if path.is_file():
            info = ZipInfo(path.relative_to(root / 'extension').as_posix(), (2026, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes())
print(output)
