"""Command-line entry point for batch routing analysis."""

from __future__ import annotations

import argparse
from pathlib import Path

from config.settings import get_settings
from src.excel_export import export_analysis_excel
from src.geojson_export import write_geojson
from src.logger import configure_logging
from src.map_builder import save_map
from src.ors_provider import OpenRouteServiceProvider
from src.pipeline import run_analysis_from_excel
from src.routing_provider import OfflineRoutingProvider


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Thailand Branch Routing Analysis")
    parser.add_argument("--input", default="input/locations.xlsx", help="Input Excel workbook")
    parser.add_argument("--output-dir", default="output", help="Output directory")
    parser.add_argument("--location-mode", choices=["Auto Detect", "Exact Lat/Long Only", "Province Only"], default="Auto Detect")
    parser.add_argument("--analysis-level", choices=["Branch Level", "Province Level"], default="Branch Level")
    parser.add_argument("--offline", action="store_true", help="Use deterministic demo routing; not actual road distances")
    parser.add_argument("--no-cache", action="store_true", help="Disable the persistent route cache")
    parser.add_argument("--force-recalculate", action="store_true", help="Ignore existing cached metrics")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    settings = get_settings()
    logger = configure_logging(settings.log_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    if args.offline:
        provider = OfflineRoutingProvider()
    else:
        provider = OpenRouteServiceProvider(settings.ors_api_key, settings.matrix_url, settings.directions_geojson_url, settings.request_timeout_seconds, settings.retry_count, settings.retry_backoff_seconds, logger=logger)
        if not provider.health_check():
            raise SystemExit("ORS_API_KEY is not configured. Set it in .env or rerun with --offline for a development-only sample calculation.")
    result = run_analysis_from_excel(args.input, provider, settings=settings, location_mode=args.location_mode, analysis_level=args.analysis_level, use_cache=not args.no_cache, force_recalculate=args.force_recalculate, logger=logger)
    excel_path = output_dir / "route_results.xlsx"
    geojson_path = output_dir / "routes.geojson"
    map_path = output_dir / "route_map.html"
    export_analysis_excel(result, excel_path)
    write_geojson(result.route_results, geojson_path)
    save_map(result.route_results, result.metadata["hubs"], settings, map_path)
    logger.info("Exports complete: %s, %s, %s", excel_path, geojson_path, map_path)
    print(f"Completed: {len(result.route_results)} records; {int(result.route_results['Status'].astype(str).str.startswith('OK').sum())} assigned")
    print(f"Excel: {excel_path}")
    print(f"GeoJSON: {geojson_path}")
    print(f"HTML map: {map_path}")
    return 0


if __name__ == "__main__":
    main()
