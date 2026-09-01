"""Excel workbook loading with sheet and column checks."""

from __future__ import annotations

from pathlib import Path
from typing import BinaryIO

import pandas as pd

from .validation import BRANCH_COLUMNS, HUB_COLUMNS, canonicalize_columns


class ExcelInputError(ValueError):
    """Raised when the workbook cannot provide the required input tables."""


def _find_sheet(sheet_names: list[str], expected: str) -> str | None:
    key = "".join(ch for ch in expected.lower() if ch.isalnum())
    for sheet in sheet_names:
        if "".join(ch for ch in str(sheet).lower() if ch.isalnum()) == key:
            return sheet
    return None


def load_workbook(source: str | Path | BinaryIO, allow_province_only: bool = False) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Load Branches and Regional_Hubs sheets and canonicalize common headers."""
    try:
        workbook = pd.ExcelFile(source, engine="openpyxl")
    except Exception as exc:
        raise ExcelInputError(f"Unable to open Excel workbook: {exc}") from exc
    branch_sheet = _find_sheet(workbook.sheet_names, "Branches")
    hub_sheet = _find_sheet(workbook.sheet_names, "Regional_Hubs")
    missing_sheets = [label for label, sheet in (("Branches", branch_sheet), ("Regional_Hubs", hub_sheet)) if sheet is None]
    if missing_sheets:
        raise ExcelInputError(f"Workbook is missing required sheet(s): {', '.join(missing_sheets)}")
    branches = canonicalize_columns(pd.read_excel(workbook, sheet_name=branch_sheet, dtype=object))
    hubs = canonicalize_columns(pd.read_excel(workbook, sheet_name=hub_sheet, dtype=object))
    # Province-level workbooks may intentionally contain only a Province column.
    # Missing branch fields are filled so the pipeline can report row-level issues
    # at Branch Level while still supporting Province Level analysis.
    missing_branch = [column for column in BRANCH_COLUMNS if column not in branches.columns]
    if allow_province_only and "Province" in branches.columns:
        for column in missing_branch:
            branches[column] = ""
        missing_branch = []
    missing_hub = [column for column in HUB_COLUMNS if column not in hubs.columns]
    if missing_branch or missing_hub:
        details = []
        if missing_branch:
            details.append(f"Branches: {', '.join(missing_branch)}")
        if missing_hub:
            details.append(f"Regional_Hubs: {', '.join(missing_hub)}")
        raise ExcelInputError("Workbook is missing required column(s): " + "; ".join(details))
    return branches, hubs
