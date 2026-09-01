"""Static, version-controlled Thailand province reference data."""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

import pandas as pd


REQUIRED_COLUMNS = [
    "Province_TH",
    "Province_EN",
    "Province_Code",
    "Region",
    "Latitude",
    "Longitude",
    "Coordinate_Source",
]


def normalize_province_name(value: object) -> str:
    """Normalize Thai/English province names for deterministic lookup."""
    if value is None:
        return ""
    try:
        if bool(pd.isna(value)):
            return ""
    except (TypeError, ValueError):
        pass
    text = unicodedata.normalize("NFKC", str(value)).strip().lower()
    text = re.sub(r"^จังหวัด\s*", "", text)
    text = re.sub(r"\s*province\s*$", "", text)
    text = re.sub(r"[\s_\-–—./()]+", "", text)
    return text


class ProvinceReference:
    """Load and query the static province reference table."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.data = pd.read_csv(self.path, dtype={"Province_Code": "string"}, encoding="utf-8")
        missing = [column for column in REQUIRED_COLUMNS if column not in self.data.columns]
        if missing:
            raise ValueError(f"Province reference is missing columns: {', '.join(missing)}")
        self.data["Latitude"] = pd.to_numeric(self.data["Latitude"], errors="coerce")
        self.data["Longitude"] = pd.to_numeric(self.data["Longitude"], errors="coerce")
        self._lookup: dict[str, dict] = {}
        for row in self.data.to_dict("records"):
            for name in (row["Province_TH"], row["Province_EN"]):
                self._lookup[normalize_province_name(name)] = row
        self._add_aliases()

    def _add_aliases(self) -> None:
        aliases = {
            "กรุงเทพ": "กรุงเทพมหานคร",
            "bangkok": "กรุงเทพมหานคร",
            "krungthep": "กรุงเทพมหานคร",
            "อยุธยา": "พระนครศรีอยุธยา",
            "ayutthaya": "พระนครศรีอยุธยา",
            "phranakhonsiayutthaya": "พระนครศรีอยุธยา",
            "chonburi": "ชลบุรี",
            "buriram": "บุรีรัมย์",
            "sisaket": "ศรีสะเกษ",
            "srisaket": "ศรีสะเกษ",
            "lopburi": "ลพบุรี",
            "prachinburi": "ปราจีนบุรี",
            "ratchaburi": "ราชบุรี",
            "suphanburi": "สุพรรณบุรี",
            "samutsakhon": "สมุทรสาคร",
            "samutsongkhram": "สมุทรสงคราม",
            "samutprakan": "สมุทรปราการ",
            "sakaeo": "สระแก้ว",
            "nakhonratchasima": "นครราชสีมา",
        }
        for alias, target in aliases.items():
            row = self._lookup.get(normalize_province_name(target))
            if row:
                self._lookup[normalize_province_name(alias)] = row

    def lookup(self, name: object) -> dict | None:
        """Return a reference row for a Thai or English name."""
        return self._lookup.get(normalize_province_name(name))

    def __len__(self) -> int:
        return len(self.data)
