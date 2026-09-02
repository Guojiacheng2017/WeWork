import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas import normalize_workspace_assignment


VECTORS = json.loads((Path(__file__).parents[2] / "test-fixtures" / "workspace-assignment-conformance.json").read_text())


@pytest.mark.parametrize("vector", VECTORS, ids=lambda vector: vector["name"])
def test_workspace_assignment_conformance(vector):
    if vector["valid"]:
        assert normalize_workspace_assignment(vector["input"]) == vector.get("normalized")
    else:
        with pytest.raises((ValidationError, ValueError, TypeError)):
            normalize_workspace_assignment(vector["input"])
