"use client";

import dynamic from "next/dynamic";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { inputWorkbookToGeoJson, normalizeGeoJson, workbookRowsToGeoJson } from "@/lib/geojson";
import { sampleRoutes } from "@/lib/sample-routes";
import type { RouteFeatureCollection } from "@/lib/types";

const RouteMap = dynamic(() => import("./route-map"), {
  ssr: false,
  loading: () => <div className="map-loading">กำลังเตรียมแผนที่…</div>,
});

const ALL = "ทั้งหมด";

export function RoutingDashboard() {
  const [dataset, setDataset] = useState<RouteFeatureCollection>(() => sampleRoutes);
  const [province, setProvince] = useState(ALL);
  const [region, setRegion] = useState(ALL);
  const [hub, setHub] = useState(ALL);
  const [method, setMethod] = useState(ALL);
  const [maxDistance, setMaxDistance] = useState(300);
  const [notice, setNotice] = useState("ข้อมูลตัวอย่าง 10 สาขา · Offline Demo");
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => {
    const unique = (values: string[]) => [ALL, ...new Set(values)].sort((a, b) => a.localeCompare(b, "th"));
    return {
      provinces: unique(dataset.features.map((f) => f.properties.Province)),
      regions: unique(dataset.features.map((f) => f.properties.Region)),
      hubs: unique(dataset.features.map((f) => f.properties.Hub_Name)),
      methods: unique(dataset.features.map((f) => f.properties.Location_Method)),
    };
  }, [dataset]);

  const filtered = useMemo(() => dataset.features.filter((feature) => {
    const p = feature.properties;
    return (province === ALL || p.Province === province)
      && (region === ALL || p.Region === region)
      && (hub === ALL || p.Hub_Name === hub)
      && (method === ALL || p.Location_Method === method)
      && p.Distance_km <= maxDistance;
  }), [dataset, hub, maxDistance, method, province, region]);

  const stats = useMemo(() => {
    let totalDistance = 0;
    let longest = 0;
    const provinces = new Set<string>();
    const hubs = new Set<string>();
    let exact = 0;
    for (const feature of filtered) {
      const p = feature.properties;
      totalDistance += p.Distance_km;
      longest = Math.max(longest, p.Distance_km);
      provinces.add(p.Province);
      hubs.add(p.Hub_ID);
      if (!p.Location_Method.toLowerCase().includes("province")) exact += 1;
    }
    return {
      branches: filtered.length,
      provinces: provinces.size,
      hubs: hubs.size,
      average: filtered.length ? totalDistance / filtered.length : 0,
      longest,
      exact,
      reference: filtered.length - exact,
    };
  }, [filtered]);

  const resetFilters = () => {
    setProvince(ALL);
    setRegion(ALL);
    setHub(ALL);
    setMethod(ALL);
    setMaxDistance(300);
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      let nextDataset: RouteFeatureCollection;
      if (/\.xlsx$/i.test(file.name)) {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        if (workbook.Sheets.Branches && workbook.Sheets.Regional_Hubs) {
          nextDataset = inputWorkbookToGeoJson(
            XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Branches),
            XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Regional_Hubs),
          );
        } else {
          const sheet = workbook.Sheets.Route_Results ?? workbook.Sheets[workbook.SheetNames[0]];
          nextDataset = workbookRowsToGeoJson(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet));
        }
        if (!nextDataset.features.length) throw new Error("ไม่พบพิกัดสาขาและ Hub ที่ใช้สร้างเส้นบนแผนที่");
      } else {
        nextDataset = normalizeGeoJson(JSON.parse(await file.text()));
      }
      setDataset(nextDataset);
      resetFilters();
      setNotice(`${file.name} · ${nextDataset.features.length.toLocaleString("th-TH")} เส้นทาง`);
    } catch (error) {
      setNotice(error instanceof Error ? `เปิดไฟล์ไม่ได้: ${error.message}` : "เปิดไฟล์ไม่ได้");
    } finally {
      event.target.value = "";
    }
  };

  const downloadFiltered = () => {
    const content = JSON.stringify({ type: "FeatureCollection", name: "Filtered routes", features: filtered }, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: "application/geo+json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "filtered-routes.geojson";
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcel = async () => {
    if (!filtered.length) return;
    const XLSX = await import("xlsx");
    const routes = filtered.map(({ properties: p }) => ({
      Branch_ID: p.Branch_ID,
      Branch_Name: p.Branch_Name,
      Province: p.Province,
      Assigned_Hub_ID: p.Hub_ID,
      Assigned_Hub_Name: p.Hub_Name,
      Hub_Region: p.Region,
      Location_Method: p.Location_Method,
      Distance_km: Number.isFinite(p.Distance_km) ? Number(p.Distance_km.toFixed(2)) : "",
      Duration_min: Number.isFinite(p.Duration_min) ? Number(p.Duration_min.toFixed(1)) : "",
      Distance_Band: p.Distance_Band,
      Routing_Source: p.Routing_Source ?? "",
      Coordinate_Source: p.Coordinate_Source ?? "",
      Geometry_Source: p.Geometry_Source ?? "",
    }));
    const hubs = [...new Set(routes.map((route) => route.Assigned_Hub_Name))];
    const matrix = routes.map((route) => ({
      Branch_ID: route.Branch_ID,
      Branch_Name: route.Branch_Name,
      Province: route.Province,
      ...Object.fromEntries(hubs.map((hubName) => [hubName, route.Assigned_Hub_Name === hubName ? route.Distance_km : ""])),
    }));
    const hubSummary = hubs.map((hubName) => {
      const assigned = routes.filter((route) => route.Assigned_Hub_Name === hubName);
      const distances = assigned.map((route) => Number(route.Distance_km)).filter(Number.isFinite);
      return {
        Hub_Name: hubName,
        Hub_ID: assigned[0]?.Assigned_Hub_ID ?? "",
        Region: assigned[0]?.Hub_Region ?? "",
        Assigned_Branches: assigned.length,
        Covered_Provinces: new Set(assigned.map((route) => route.Province)).size,
        Average_Distance_km: distances.length ? Number((distances.reduce((total, value) => total + value, 0) / distances.length).toFixed(2)) : "",
        Longest_Distance_km: distances.length ? Number(Math.max(...distances).toFixed(2)) : "",
      };
    });
    const dataQuality = [
      { Metric: "Displayed routes", Value: filtered.length, Note: "Current filters applied" },
      { Metric: "Input dataset", Value: dataset.features.length, Note: notice },
      { Metric: "Exact coordinates", Value: stats.exact, Note: "Coordinates supplied in source" },
      { Metric: "Province reference", Value: stats.reference, Note: "Static province reference point" },
      { Metric: "Distance interpretation", Value: "See Routing_Source", Note: "Input preview uses a straight-line nearest-hub estimate" },
    ];
    const workbook = XLSX.utils.book_new();
    const addSheet = (name: string, rows: Record<string, unknown>[]) => {
      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet["!cols"] = Object.keys(rows[0] ?? {}).map((key) => ({ wch: Math.min(Math.max(key.length + 2, 14), 34) }));
      XLSX.utils.book_append_sheet(workbook, sheet, name);
    };
    addSheet("Executive_Summary", [
      { Metric: "Routes displayed", Value: stats.branches },
      { Metric: "Provinces covered", Value: stats.provinces },
      { Metric: "Assigned hubs", Value: stats.hubs },
      { Metric: "Average distance (km)", Value: Number(stats.average.toFixed(2)) },
      { Metric: "Longest distance (km)", Value: Number(stats.longest.toFixed(2)) },
      { Metric: "Exported at", Value: new Date().toLocaleString("th-TH") },
    ]);
    addSheet("Route_Summary", routes);
    addSheet("Assignment_Matrix", matrix);
    addSheet("Hub_Summary", hubSummary);
    addSheet("Data_Quality", dataQuality);
    XLSX.writeFile(workbook, `route-intelligence-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
    setNotice(`ส่งออก Excel สำเร็จ · ${filtered.length.toLocaleString("th-TH")} เส้นทาง · 5 ชีต`);
  };

  return (
    <main>
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true"><span>TH</span></div>
        <div className="brand-copy"><strong>Route Intelligence</strong><span>Thailand network planning</span></div>
        <div className="topbar-status"><span className="status-dot" /> Analysis workspace</div>
      </header>

      <section className="hero">
        <div className="hero-copy-wrap">
          <p className="eyebrow">BRANCH → REGIONAL HUB</p>
          <h1>ตัดสินใจเรื่อง<br /><em>เส้นทางอย่างมั่นใจ</em></h1>
          <p className="hero-copy">รวมข้อมูลสาขา Hub และระยะทางไว้ในมุมมองเดียว เพื่อค้นหาเส้นทางที่ควรทบทวนและส่งออกเป็นรายงาน Excel ได้ทันที</p>
          <div className="hero-tags"><span>Thailand coverage</span><span>Route audit ready</span><span>Excel export</span></div>
        </div>
        <div className="hero-actions">
          <input ref={inputRef} className="visually-hidden" type="file" accept=".geojson,.json,.xlsx" onChange={handleFile} />
          <button className="button primary" type="button" onClick={() => inputRef.current?.click()}><span>↑</span> อัปโหลดข้อมูล</button>
          <button className="button secondary" type="button" onClick={downloadExcel} disabled={!filtered.length}>ส่งออก Excel</button>
          <button className="button text-button" type="button" onClick={downloadFiltered} disabled={!filtered.length}>ดาวน์โหลด GeoJSON →</button>
          <small>รองรับ `Branches` + `Regional_Hubs`, route_results.xlsx และ routes.geojson</small>
        </div>
      </section>

      <section className="metrics" aria-label="ตัวชี้วัด">
        <Metric label="สาขาที่แสดง" value={stats.branches.toLocaleString("th-TH")} note={`จาก ${dataset.features.length.toLocaleString("th-TH")} สาขา`} accent />
        <Metric label="จังหวัด" value={stats.provinces.toLocaleString("th-TH")} note={`${stats.hubs} Regional Hubs`} />
        <Metric label="ระยะทางเฉลี่ย" value={`${stats.average.toLocaleString("th-TH", { maximumFractionDigits: 1 })} km`} note={`ไกลสุด ${stats.longest.toLocaleString("th-TH", { maximumFractionDigits: 1 })} km`} />
        <Metric label="คุณภาพพิกัด" value={`${stats.exact} Exact`} note={`${stats.reference} Province reference`} />
      </section>

      <section className="workspace">
        <aside className="filters">
          <div className="panel-heading"><div><p className="eyebrow">CONTROL PANEL</p><h2>ตัวกรองข้อมูล</h2></div><button onClick={resetFilters}>ล้างค่า</button></div>
          <Filter label="จังหวัด" value={province} values={options.provinces} onChange={setProvince} />
          <Filter label="ภูมิภาคของ Hub" value={region} values={options.regions} onChange={setRegion} />
          <Filter label="Regional Hub" value={hub} values={options.hubs} onChange={setHub} />
          <Filter label="วิธีระบุตำแหน่ง" value={method} values={options.methods} onChange={setMethod} />
          <label className="range-field">
            <span><b>ระยะทางสูงสุด</b><output>{maxDistance} km</output></span>
            <input type="range" min="0" max="500" step="10" value={maxDistance} onChange={(e) => setMaxDistance(Number(e.target.value))} />
            <i><span>0</span><span>500+ km</span></i>
          </label>
          <div className="data-note"><span className="status-dot" /><div><b>ชุดข้อมูลปัจจุบัน</b><p>{notice}</p><small>Input preview เป็นเส้นตรงเพื่อดูภาพรวม; ใช้ Route Results สำหรับผลระยะถนนที่ผ่านการคำนวณ</small></div></div>
        </aside>

        <div className="map-panel">
          <div className="map-toolbar">
            <div><p className="eyebrow">NETWORK MAP</p><h2>เส้นทางที่จัดสรรแล้ว</h2></div>
            <div className="legend"><span><i className="legend-exact" /> Exact coordinate</span><span><i className="legend-reference" /> Province reference</span><span><i className="legend-hub" /> Hub</span></div>
          </div>
          <div className="map-wrap">
            {filtered.length ? <RouteMap features={filtered} /> : <div className="empty-map"><b>ไม่พบเส้นทางตามตัวกรอง</b><span>ลองเพิ่มระยะทางสูงสุดหรือล้างตัวกรอง</span></div>}
            <div className="map-count"><b>{filtered.length}</b><span>routes visible</span></div>
          </div>
        </div>
      </section>

      <section className="insights">
        <div><p className="eyebrow">DECISION SUPPORT</p><h2>จากแผนที่สู่การตัดสินใจ</h2></div>
        <Insight number="01" title="มองจุดเสี่ยง" text="กรองเส้นทางไกลหรือข้ามภูมิภาค เพื่อหาสาขาที่ควรตรวจสอบก่อน" />
        <Insight number="02" title="ส่งต่อรายงาน" text="Excel มี summary, route details, assignment matrix และ quality notes พร้อมใช้งาน" />
        <Insight number="03" title="รักษา Audit trail" text="เก็บแหล่งพิกัด วิธีระบุตำแหน่ง และชนิดของระยะทางไว้ทุกครั้งที่ส่งออก" />
      </section>

      <section className="route-table-section">
        <div className="table-title"><div><p className="eyebrow">ROUTE REGISTER</p><h2>รายละเอียดเส้นทาง</h2></div><span>เรียงตามระยะทางมากไปน้อย</span></div>
        <div className="table-scroll"><table><thead><tr><th>สาขา</th><th>จังหวัด</th><th>Assigned Hub</th><th>Region</th><th>วิธีระบุตำแหน่ง</th><th>ระยะทาง</th></tr></thead><tbody>
          {[...filtered].sort((a, b) => b.properties.Distance_km - a.properties.Distance_km).map(({ properties: p }) => (
            <tr key={p.Branch_ID}><td><b>{p.Branch_ID}</b><span>{p.Branch_Name}</span></td><td>{p.Province}</td><td>{p.Hub_Name}</td><td><span className="region-pill">{p.Region}</span></td><td><span className={p.Location_Method.toLowerCase().includes("province") ? "method reference" : "method exact"}>{p.Location_Method}</span></td><td><b>{p.Distance_km.toLocaleString("th-TH", { maximumFractionDigits: 1 })}</b> km</td></tr>
          ))}
        </tbody></table></div>
      </section>

      <footer><span>Thailand Route Intelligence · Visualization layer</span><span>Routing calculations remain in the audited Python engine</span></footer>
    </main>
  );
}

function Metric({ label, value, note, accent = false }: { label: string; value: string; note: string; accent?: boolean }) {
  return <article className={accent ? "metric accent" : "metric"}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function Filter({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return <label className="select-field"><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)}>{values.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function Insight({ number, title, text }: { number: string; title: string; text: string }) {
  return <article><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></article>;
}
