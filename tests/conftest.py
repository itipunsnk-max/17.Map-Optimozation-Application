"""Keep pytest temporary files inside the writable project sandbox."""

from pathlib import Path

import pytest


@pytest.fixture
def tmp_path(request):
    path = Path(__file__).resolve().parents[1] / ".test-tmp" / request.node.name.replace("/", "_")
    path.mkdir(parents=True, exist_ok=True)
    return path
