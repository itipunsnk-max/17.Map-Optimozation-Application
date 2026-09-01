"""End-to-end analysis orchestration shared by CLI and Streamlit."""

from __future__ import annotations

from datetime import datetime

import pandas as pd

from config.settings import Settings, get_settings

from .excel_loader import load_workbook
from .hub_summary import build_hub_summary
from .location_resolver import LocationMode, resolve_locations
from .logger import configure_logging
from .models import AnalysisResult
from .province_resolver import load_province_reference
from .province_summary import build_province_summary
from .route_geometry import retrieve_assigned_geometry
from .route_matrix import calculate_distance_matrix
from .route_ranker import rank_hubs
from .routing_provider import RoutingProvider
from .validation import validate_records, validate_workbook_frames


def _province_level_branches(source: pd.DataFrame, reference) -> tuple[pd.DataFrame, pd.DataFrame]:
    rows, errors = [], []
    for raw in source.get("Province", pd.Series(dtype=object)).dropna().drop_duplicates().tolist():
        if str(raw).strip() == "":
            continue
        ref = reference.lookup(raw)
        if ref is None:
            rows.append({"Branch_ID": f"PROV-INVALID-{len(rows) + 1}", "Branch_Name": str(raw), "Province": raw, "Latitude": "", "Longitude": ""})
            errors.append({"Record_Type": "Province", "Record_ID": f"PROV-INVALID-{len(rows)}", "Branch_or_Hub_Name": str(raw), "Province": raw, "Latitude": "", "Longitude": "", "Error_Type": "Unknown Province", "Error_Message": f"Province is not found in the 77-province reference: {raw}."})
        else:
            rows.append({"Branch_ID": f"PROV-{ref['Province_Code']}", "Branch_Name": ref["Province_EN"], "Province": ref["Province_TH"], "Latitude": "", "Longitude": ""})
    frame = pd.DataFrame(rows, columns=["Branch_ID", "Branch_Name", "Province", "Latitude", "Longitude"])
    return frame, pd.DataFrame(errors, columns=["Record_Type", "Record_ID", "Branch_or_Hub_Name", "Province", "Latitude", "Longitude", "Error_Type", "Error_Message"])


def _enrich_hub_regions(hubs: pd.DataFrame, reference) -> pd.DataFrame:
    hubs = hubs.copy()
    if "Region" not in hubs.columns:
        hubs["Region"] = ""
    for index, row in hubs.iterrows():
        if str(row.get("Region", "")).strip() == "":
            ref = reference.lookup(row.get("Province"))
            if ref:
                hubs.at[index, "Region"] = ref["Region"]
    return hubs


def run_analysis(branches: pd.DataFrame, hubs: pd.DataFrame, provider: RoutingProvider, settings: Settings | None = None, location_mode: LocationMode = "Auto Detect", analysis_level: str = "Branch Level", use_cache: bool = True, force_recalculate: bool = False, logger=None) -> AnalysisResult:
    """Run validation, resolution, matrix routing, ranking, geometry and summaries."""
    settings = settings or get_settings()
    logger = logger or configure_logging(settings.log_dir)
    reference = load_province_reference()
    branches = branches.copy()
    hubs = _enrich_hub_regions(hubs, reference)
    if str(analysis_level).lower().startswith("province"):
        original_validation = validate_records(hubs, "Hub", reference, settings.thailand_warning_bounds)
        working_branches, province_errors = _province_level_branches(branches, reference)
        validation_errors = pd.concat([original_validation, province_errors], ignore_index=True)
        effective_mode: LocationMode = "Province Only"
        output_level = "Province"
    else:
        working_branches = branches
        validation_errors = validate_workbook_frames(working_branches, hubs, reference, settings.thailand_warning_bounds)
        effective_mode = location_mode
        output_level = "Branch"

    resolved_branches, branch_location_errors = resolve_locations(working_branches, "Branch", effective_mode, reference)
    resolved_hubs, hub_location_errors = resolve_locations(hubs, "Hub", effective_mode, reference)
    validation_errors = pd.concat([validation_errors, branch_location_errors, hub_location_errors], ignore_index=True)
    calculation_date = datetime.now().replace(microsecond=0)
    logger.info("Resolved locations branches=%s valid=%s hubs=%s valid=%s", len(resolved_branches), int(resolved_branches["Location_Valid"].sum()), len(resolved_hubs), int(resolved_hubs["Location_Valid"].sum()))
    metrics, distance_matrix, duration_matrix, failed_routes = calculate_distance_matrix(resolved_branches, resolved_hubs, provider, settings, use_cache=use_cache, force_recalculate=force_recalculate, logger=logger)
    results = rank_hubs(resolved_branches, resolved_hubs, metrics, settings, calculation_date, provider.name)
    results = retrieve_assigned_geometry(results, resolved_branches, resolved_hubs, provider, settings, use_cache=use_cache, force_recalculate=force_recalculate, logger=logger)
    results["Analysis_Level"] = output_level
    results["Reference_Latitude"] = results["Resolved_Latitude"] if output_level == "Province" else ""
    results["Reference_Longitude"] = results["Resolved_Longitude"] if output_level == "Province" else ""
    if "_Geometry_Error" in results.columns:
        geometry_failures = results[results["_Geometry_Error"].notna()]
        extra = pd.DataFrame([{"Branch_ID": row.get("Branch_ID", ""), "Branch_Name": row.get("Branch_Name", ""), "Province": row.get("Province", ""), "Hub_ID": row.get("Assigned_Hub_ID", ""), "Error_Type": "Geometry Request Failure", "Error_Message": row.get("_Geometry_Error", "")} for _, row in geometry_failures.iterrows()])
        failed_routes = pd.concat([failed_routes, extra], ignore_index=True)
    province_summary = build_province_summary(results)
    hub_summary = build_hub_summary(results, resolved_hubs)
    logger.info("Route ranking completed assigned=%s failed=%s", int(results["Status"].astype(str).str.startswith("OK").sum()), int((~results["Status"].astype(str).str.startswith("OK")).sum()))
    return AnalysisResult(results, distance_matrix, duration_matrix, province_summary, hub_summary, validation_errors, failed_routes, calculation_date, settings.app_version, settings.routing_profile, provider.name, metadata={"branches": resolved_branches, "hubs": resolved_hubs, "metrics": metrics, "location_mode": effective_mode, "analysis_level": output_level})


def run_analysis_from_excel(source, provider: RoutingProvider, **kwargs) -> AnalysisResult:
    analysis_level = kwargs.get("analysis_level", "Branch Level")
    branches, hubs = load_workbook(source, allow_province_only=str(analysis_level).lower().startswith("province"))
    return run_analysis(branches, hubs, provider, **kwargs)
