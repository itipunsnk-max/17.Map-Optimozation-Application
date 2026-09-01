"use client";

import dynamic from "next/dynamic";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { normalizeGeoJson, workbookRowsToGeoJson } from "@/lib/geojson";
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
        const sheet = workbook.Sheets.Route_Results ?? workbook.Sheets[workbook.SheetNames[0]];
        nextDataset = workbookRowsToGeoJson(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet));
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

  return (
    <main>
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true"><span>TH</span></div>
        <div className="brand-copy"><strong>Route Intelligence</strong><span>Thailand network planning</span></div>
        <div className="topbar-status"><span className="status-dot" /> Analysis workspace</div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">BRANCH → REGIONAL HUB</p>
          <h1>มองเห็นทุกเส้นทาง<br /><em>ก่อนตัดสินใจ</em></h1>
          <p className="hero-copy">เปลี่ยนผลคำนวณระยะทางให้เป็นภาพรวมที่ตรวจสอบได้ เปรียบเทียบพื้นที่บริการ และค้นหาสาขาที่ควรทบทวนบนแผนที่เดียว</p>
        </div>
        <div className="hero-actions">
          <input ref={inputRef} className="visually-hidden" type="file" accept=".geojson,.json,.xlsx" onChange={handleFile} />
          <button className="button primary" onClick={() => inputRef.current?.click()}><span>＋</span> เปิดผลลัพธ์</button>
          <button className="button secondary" onClick={downloadFiltered}>ดาวน์โหลด GeoJSON</button>
          <small>รองรับ routes.geojson และ route_results.xlsx</small>
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
          <div className="data-note"><span className="status-dot" /><div><b>ชุดข้อมูลปัจจุบัน</b><p>{notice}</p></div></div>
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
        <div><p className="eyebrow">DECISION SUPPORT</p><h2>ใช้ข้อมูลนี้ตัดสินใจอะไรได้บ้าง</h2></div>
        <Insight number="01" title="ตรวจ TOR" text="เก็บระยะทาง แหล่งพิกัด วิธีคำนวณ และ Hub ที่ได้รับเลือกไว้ตรวจสอบย้อนหลัง" />
        <Insight number="02" title="ทบทวนพื้นที่บริการ" text="กรองเส้นทางไกลหรือข้ามภูมิภาค เพื่อมองหาการจัดสรร Hub ที่ควรตรวจเพิ่ม" />
        <Insight number="03" title="วางแผนสัญญาและขนส่ง" text="ใช้ distance band แบ่งโซนค่าบริการ ประเมินภาระงาน และส่งต่อ QGIS หรือ Power BI" />
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
