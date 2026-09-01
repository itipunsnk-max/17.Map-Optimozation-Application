"""Public province resolution helpers."""

from __future__ import annotations

from pathlib import Path

from config.settings import BASE_DIR

from .province_reference import ProvinceReference, normalize_province_name


def load_province_reference(path: str | Path | None = None) -> ProvinceReference:
    return ProvinceReference(path or BASE_DIR / "data" / "thailand_provinces.csv")


__all__ = ["ProvinceReference", "load_province_reference", "normalize_province_name"]
