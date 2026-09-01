"""Streamlit user interface for Thailand Branch Routing Analysis."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pandas as pd
import streamlit as st

from config.settings import get_settings
from src.excel_export import export_analysis_excel
from src.excel_loader import ExcelInputError, load_workbook
from src.geojson_export import build_geojson
from src.logger import configure_logging
from src.map_builder import build_map
from src.ors_provider import OpenRouteServiceProvider
from src.pipeline import run_analysis
from src.routing_provider import OfflineRoutingProvider
from src.validation import validate_workbook_frames
from src.province_resolver import load_province_reference


settings = get_settings()
logger = configure_logging(settings.log_dir, name="thailand_routing_streamlit")
st.set_page_config(page_title="Thailand Branch Routing Analysis", page_icon="🗺️", layout="wide")
st.title("Thailand Branch Routing Analysis")
st.caption("TOR / Regional Service Area Planning")


def _provider(choice: str):
    if choice.startswith("Offline"):
        return OfflineRoutingProvider()
    return OpenRouteServiceProvider(settings.ors_api_key, settings.matrix_url, settings.directions_geojson_url, settings.request_timeout_seconds, settings.retry_count, settings.retry_backoff_seconds, logger=logger)


def _read_input(uploaded_file, use_sample: bool):
    if use_sample:
        sample_path = settings.base_dir / "input" / "sample_locations.xlsx"
        if sample_path.exists():
            return load_workbook(sample_path, allow_province_only=True)
        st.warning("Sample workbook has not been generated yet. Upload an Excel workbook.")
    if uploaded_file is not None:
        return load_workbook(BytesIO(uploaded_file.getvalue()), allow_province_only=True)
    return None


with st.sidebar:
    st.header("Analysis Settings")
    uploaded = st.file_uploader("Upload Excel / อัปโหลด Excel", type=["xlsx", "xlsm"])
    use_sample = st.checkbox("Use sample workbook", value=False)
    analysis_level = st.selectbox("Analysis Level / ระดับการวิเคราะห์", ["Branch Level", "Province Level"], index=0)
    location_mode = st.selectbox("Location Mode / วิธีระบุตำแหน่ง", ["Auto Detect", "Exact Lat/Long Only", "Province Only"], index=0)
    provider_choice = st.selectbox("Routing Provider", ["OpenRouteService", "Offline Demo (development)"])
    use_cache = st.checkbox("Use cached results", value=True)
    force_recalculate = st.checkbox("Force recalculation", value=False)
    validate_button = st.button("Validate Data / ตรวจสอบข้อมูล")
    calculate_button = st.button("Calculate Routes / คำนวณเส้นทาง", type="primary")

if location_mode == "Province Only":
    st.warning("Province Mode uses representative province coordinates and may not represent the actual branch location.")
if provider_choice == "OpenRouteService" and not settings.ors_api_key:
    st.info("ORS_API_KEY is not configured. Choose Offline Demo for a local development calculation, or configure .env before using actual road routing.")

try:
    loaded = _read_input(uploaded, use_sample)
except ExcelInputError as exc:
    st.error(str(exc))
    loaded = None

if loaded:
    branches, hubs = loaded
    st.subheader("Input Preview")
    left, right = st.columns(2)
    with left:
        st.write("Branches")
        st.dataframe(branches.head(20), use_container_width=True, hide_index=True)
    with right:
        st.write("Regional Hubs")
        st.dataframe(hubs.head(20), use_container_width=True, hide_index=True)
    if validate_button:
        validation = validate_workbook_frames(branches, hubs, load_province_reference())
        if validation.empty:
            st.success("No validation issues found.")
        else:
            st.warning(f"Found {len(validation)} validation item(s). Warnings and invalid rows are retained for audit.")
            st.dataframe(validation, use_container_width=True, hide_index=True)
    if calculate_button:
        provider = _provider(provider_choice)
        if provider_choice == "OpenRouteService" and not provider.health_check():
            st.error("ORS_API_KEY is missing. Configure it in .env or choose Offline Demo.")
        else:
            with st.status("Running analysis...", expanded=True) as status:
                st.write("Loading and validating input")
                st.write("Resolving exact/province locations")
                st.write("Calculating batched distance matrix")
                result = run_analysis(branches, hubs, provider, settings=settings, location_mode=location_mode, analysis_level=analysis_level, use_cache=use_cache, force_recalculate=force_recalculate, logger=logger)
                st.write("Ranking hubs and retrieving assigned-route geometry")
                st.write("Generating summaries and exports")
                status.update(label="Analysis complete", state="complete")
            st.session_state["analysis_result"] = result
            st.session_state["analysis_hubs"] = result.metadata["hubs"]

result = st.session_state.get("analysis_result")
if result is not None:
    results = result.route_results.copy()
    st.subheader("Key Performance Indicators")
    assigned = results[results["Status"].astype(str).str.startswith("OK")]
    kpis = [
        ("Total Branches", len(results)), ("Exact Coordinate", int((results["Location_Method"] == "Exact Coordinate").sum())),
        ("Province Mode", int((results["Location_Method"] == "Province Reference Point").sum())), ("Invalid Branches", int((results["Status"] == "Invalid Location").sum())),
        ("Total Provinces", results["Province"].nunique()), ("Regional Hubs", len(result.metadata["hubs"])),
        ("Average Road Distance", f"{pd.to_numeric(assigned['Road_Distance_km'], errors='coerce').mean():,.2f} km" if not assigned.empty else "N/A"),
        ("Maximum Road Distance", f"{pd.to_numeric(assigned['Road_Distance_km'], errors='coerce').max():,.2f} km" if not assigned.empty else "N/A"),
        ("Average Travel Time", f"{pd.to_numeric(assigned['Travel_Time_min'], errors='coerce').mean():,.2f} min" if not assigned.empty else "N/A"),
    ]
    for row_start in range(0, len(kpis), 5):
        cols = st.columns(min(5, len(kpis) - row_start))
        for col, (label, value) in zip(cols, kpis[row_start:row_start + 5]):
            col.metric(label, value)

    st.subheader("Filters")
    filter_cols = st.columns(5)
    province_filter = filter_cols[0].multiselect("Province", sorted(results["Province"].dropna().astype(str).unique()))
    region_filter = filter_cols[1].multiselect("Assigned Region", sorted(results["Assigned_Region"].dropna().astype(str).unique()))
    hub_filter = filter_cols[2].multiselect("Assigned Hub", sorted(results["Assigned_Hub_Name"].dropna().astype(str).unique()))
    method_filter = filter_cols[3].multiselect("Location Method", sorted(results["Location_Method"].dropna().astype(str).unique()))
    band_filter = filter_cols[4].multiselect("Distance Band", sorted(results["Distance_Band"].dropna().astype(str).unique()))
    status_filter = st.multiselect("Status", sorted(results["Status"].dropna().astype(str).unique()))
    distance_values = pd.to_numeric(results["Road_Distance_km"], errors="coerce").dropna()
    maximum_available_distance = max(100.0, float(distance_values.max())) if not distance_values.empty else 100.0
    max_distance = st.slider("Maximum road distance (km)", 0.0, maximum_available_distance, value=maximum_available_distance)
    mask = pd.Series(True, index=results.index)
    if province_filter: mask &= results["Province"].astype(str).isin(province_filter)
    if region_filter: mask &= results["Assigned_Region"].astype(str).isin(region_filter)
    if hub_filter: mask &= results["Assigned_Hub_Name"].astype(str).isin(hub_filter)
    if method_filter: mask &= results["Location_Method"].astype(str).isin(method_filter)
    if band_filter: mask &= results["Distance_Band"].astype(str).isin(band_filter)
    if status_filter: mask &= results["Status"].astype(str).isin(status_filter)
    mask &= pd.to_numeric(results["Road_Distance_km"], errors="coerce").fillna(0).le(max_distance) | ~results["Status"].astype(str).str.startswith("OK")
    filtered = results[mask]
    st.subheader("Route Results")
    display_columns = ["Branch_Name", "Province", "Location_Method", "Assigned_Hub_Name", "Assigned_Region", "Road_Distance_km", "Travel_Time_min", "Distance_Band", "Status"]
    st.dataframe(filtered[display_columns], use_container_width=True, hide_index=True)

    st.subheader("Interactive Map")
    map_obj = build_map(filtered, result.metadata["hubs"], settings)
    st.components.v1.html(map_obj.get_root().render(), height=650, scrolling=False)

    excel_buffer = BytesIO()
    export_analysis_excel(result, excel_buffer)
    geojson_bytes = __import__("json").dumps(build_geojson(result.route_results), ensure_ascii=False, indent=2).encode("utf-8")
    map_bytes = map_obj.get_root().render().encode("utf-8")
    st.subheader("Downloads")
    download_cols = st.columns(3)
    download_cols[0].download_button("Download Route Results Excel", excel_buffer.getvalue(), "route_results.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    download_cols[1].download_button("Download GeoJSON", geojson_bytes, "routes.geojson", "application/geo+json")
    download_cols[2].download_button("Download HTML Map", map_bytes, "route_map.html", "text/html")
else:
    st.info("Upload a workbook or select the sample workbook to begin.")
