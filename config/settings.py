"""Central configuration for the Thailand routing application."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional in minimal environments
    load_dotenv = None


BASE_DIR = Path(__file__).resolve().parents[1]
if load_dotenv:
    load_dotenv(BASE_DIR / ".env")

DEFAULT_DISTANCE_BANDS: tuple[tuple[float, float | None], ...] = (
    (0.0, 50.0),
    (50.0, 100.0),
    (100.0, 150.0),
    (150.0, 200.0),
    (200.0, 300.0),
    (300.0, None),
)


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


@dataclass(frozen=True)
class Settings:
    """Runtime settings; paths are resolved relative to the project root."""

    base_dir: Path = BASE_DIR
    app_version: str = os.getenv("APP_VERSION", "1.0.0")
    routing_provider: str = os.getenv("ROUTING_PROVIDER", "openrouteservice")
    routing_profile: str = os.getenv("ROUTING_PROFILE", "driving-car")
    ors_api_key: str = os.getenv("ORS_API_KEY", "")
    ors_base_url: str = os.getenv("ORS_BASE_URL", "https://api.openrouteservice.org")
    request_timeout_seconds: float = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "30"))
    retry_count: int = int(os.getenv("RETRY_COUNT", "3"))
    retry_backoff_seconds: float = float(os.getenv("RETRY_BACKOFF_SECONDS", "1.0"))
    matrix_batch_size: int = int(os.getenv("MATRIX_BATCH_SIZE", "25"))
    cache_enabled: bool = _env_bool("CACHE_ENABLED", True)
    cache_path: Path = field(default_factory=lambda: BASE_DIR / "cache" / "routing.sqlite3")
    log_dir: Path = field(default_factory=lambda: BASE_DIR / "logs")
    output_dir: Path = field(default_factory=lambda: BASE_DIR / "output")
    default_map_center: tuple[float, float] = (13.75, 100.50)
    default_zoom: int = 6
    thailand_warning_bounds: tuple[float, float, float, float] = (5.0, 21.5, 97.0, 106.5)
    distance_bands: tuple[tuple[float, float | None], ...] = DEFAULT_DISTANCE_BANDS

    @property
    def matrix_url(self) -> str:
        return f"{self.ors_base_url.rstrip('/')}/v2/matrix/{self.routing_profile}"

    @property
    def directions_geojson_url(self) -> str:
        return f"{self.ors_base_url.rstrip('/')}/v2/directions/{self.routing_profile}/geojson"

    def ensure_directories(self) -> None:
        """Create runtime directories used by the application."""
        for path in (self.cache_path.parent, self.log_dir, self.output_dir):
            path.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_directories()
    return settings


def distance_band(distance_km: float | int | None, bands: tuple[tuple[float, float | None], ...] = DEFAULT_DISTANCE_BANDS) -> str:
    """Return the configured TOR distance band for a distance in kilometres."""
    if distance_km is None:
        return "Not Available"
    try:
        value = float(distance_km)
    except (TypeError, ValueError):
        return "Not Available"
    if value < 0:
        return "Not Available"
    for index, (lower, upper) in enumerate(bands):
        is_last = index == len(bands) - 1
        if (value >= lower and upper is None) or (value >= lower and upper is not None and (value <= upper or is_last)):
            if upper is None:
                return f"> {lower:g} km"
            if lower == 0:
                return f"0-{upper:g} km"
            return f"> {lower:g}-{upper:g} km"
    return f"> {bands[-1][0]:g} km"
