# Thailand Branch Routing Analysis

ระบบวิเคราะห์การจัดสรรสาขาไปยัง Regional Hub ของประเทศไทย สำหรับงาน TOR, การวางแผนพื้นที่บริการ และการวิเคราะห์ระยะทางขนส่งระดับจังหวัด แอปพลิเคชันใช้ระยะทางถนนจริงจาก OpenRouteService (ORS) เป็นเกณฑ์หลักในการเลือก Hub ที่ใกล้ที่สุด และเก็บวิธีระบุตำแหน่งไว้ในผลลัพธ์เพื่อการตรวจสอบย้อนหลัง

## ความสามารถหลัก

- นำเข้า Excel สองชีต: `Branches` และ `Regional_Hubs`
- รองรับข้อมูลสาขาแบบ Exact Latitude/Longitude, Province-only และข้อมูลผสมในไฟล์เดียว
- รองรับชื่อจังหวัดไทย อังกฤษ และชื่อย่อที่พบบ่อย ครบ 77 จังหวัด
- ตรวจสอบข้อมูลโดยไม่หยุดทั้งงานเมื่อพบแถวผิดพลาด พร้อมชีต `Validation_Errors`
- ใช้ ORS Matrix API แบบ batching และ Directions API เฉพาะ Branch → Assigned Hub
- จัดอันดับ Hub ตาม `Road_Distance_km` พร้อม Rank 2 และ Rank 3
- SQLite cache สำหรับระยะทาง เวลา และ geometry
- สร้าง Excel, GeoJSON และ Folium/Leaflet HTML map
- Streamlit GUI พร้อม KPI, filters, map และ download buttons
- Next.js/TypeScript web dashboard สำหรับเปิดดูแผนที่บน Vercel
- มี Branch Level และ Province Level analysis

## Architecture

```text
Excel
  -> excel_loader / validation
  -> province_reference / location_resolver
  -> route_matrix (batched ORS + SQLite cache)
  -> route_ranker (road distance ascending)
  -> route_geometry (assigned routes only)
  -> summaries / excel_export / geojson_export / map_builder
```

โค้ดหลักอยู่ใน `src/` และแยก business logic ออกจาก Streamlit เพื่อให้ใช้ซ้ำผ่าน CLI และการทดสอบได้

ดูแผนภาพ Mermaid สำหรับ flow การทำงาน, location decision, routing/cache sequence, program structure และ output audit ได้ที่ [`docs/architecture.md`](docs/architecture.md)

## Web map สำหรับ Vercel

โฟลเดอร์ `web/` เป็น visualization layer แบบ Next.js/TypeScript แยกจาก calculation engine ของ Python หน้าเว็บเปิดพร้อมแผนที่ประเทศไทยและข้อมูล Offline Demo ทันที โดยแสดง Branch → Hub routes, KPI, filters, popup audit details และตารางเรียงระยะทาง

หน้าเว็บรับผลลัพธ์จาก Python ได้สองรูปแบบ:

- `output/routes.geojson`: แสดง route geometry ที่ export จาก routing provider โดยตรง
- `output/route_results.xlsx`: สร้างเส้นตรงสำหรับการมองภาพรวมจากพิกัดสาขาไป Hub และระบุ `Geometry_Source` ว่าเป็น display line

เริ่ม web dashboard ในเครื่อง:

```powershell
cd web
npm install
npm run dev
```

Production build:

```powershell
cd web
npm ci
npm run build
```

เมื่อตั้ง Vercel project ให้กำหนด Root Directory เป็น `web` ไม่ต้องใส่ `ORS_API_KEY` ใน frontend เพราะ web dashboard อ่านเฉพาะไฟล์ผลลัพธ์ ส่วนการเรียก ORS และเก็บ cache ยังคงทำใน Python engine เพื่อไม่เปิดเผย API key และรักษา audit flow เดิม

## Installation (Windows 10/11)

ต้องใช้ Python 3.11 ขึ้นไป (ทดสอบใน environment นี้ด้วย Python 3.14)

```powershell
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

ตั้งค่า `ORS_API_KEY` ใน `.env` หากต้องการคำนวณระยะทางถนนจริงจาก ORS ห้าม commit ไฟล์ `.env`

## รูปแบบ Excel

ชีต `Branches` ต้องมีคอลัมน์:

`Branch_ID`, `Branch_Name`, `Province`, `Latitude`, `Longitude`

ชีต `Regional_Hubs` ต้องมีคอลัมน์:

`Hub_ID`, `Region`, `Hub_Name`, `Province`, `Latitude`, `Longitude`

Latitude/Longitude ของสาขาเว้นว่างได้เมื่อมี Province ที่รู้จัก ส่วน Hub ก็ใช้ Province reference ได้เมื่อไม่มีพิกัด แต่ควรใช้พิกัดจริงสำหรับงาน TOR หากมี

ตัวอย่าง:

```text
B001 | Station Rayong 01   | ระยอง     | 12.681 | 101.281
B002 | Station Chiang Mai  | เชียงใหม่ |         |
```

ดูไฟล์ตัวอย่างที่ `input/sample_locations.xlsx` โดย Hub ในไฟล์ตัวอย่างเป็นข้อมูลพัฒนา ไม่ใช่ตำแหน่งองค์กรอย่างเป็นทางการ

## วิธีระบุตำแหน่ง

- `Auto Detect`: ใช้ Exact coordinates เมื่อ Latitude และ Longitude ถูกต้องทั้งคู่ มิฉะนั้นใช้จุดอ้างอิงจังหวัดเมื่อพิกัดทั้งคู่เว้นว่าง
- `Exact Lat/Long Only`: แถวที่ไม่มีพิกัดถูกทำเป็น `Invalid Location`
- `Province Only`: ใช้จุดอ้างอิงจังหวัดแม้ Input Excel จะมีพิกัดอยู่

ผลลัพธ์ทุกแถวมี `Location_Method` และ `Coordinate_Source` เสมอ โดย `Exact Coordinate` ไม่ถูกแทนที่ด้วยจุดจังหวัดใน Auto Detect

## จุดอ้างอิง 77 จังหวัด

เก็บแบบ static และ version-controlled ที่ `data/thailand_provinces.csv` โดยใช้จุดศูนย์กลางเมือง/ศูนย์ราชการจังหวัดที่กำหนดคงที่เป็น representative point ไม่ทำการ geocode ใหม่ระหว่างรัน จึงทำซ้ำผลลัพธ์ได้ โดยแต่ละแถวระบุ `Coordinate_Source`

## Routing และการจัดสรร Hub

Production provider คือ OpenRouteService v2:

- Matrix: `/v2/matrix/{profile}`
- Geometry: `/v2/directions/{profile}/geojson`
- ค่าเริ่มต้น profile: `driving-car`

ระบบส่ง origins หลายรายการและ destinations ของ Hub เป็น batch, retry เมื่อ timeout/connection/HTTP 429/5xx และใช้ exponential backoff ระยะทางถนนจาก Matrix เป็นเกณฑ์หลัก ไม่ใช้ Haversine, ชื่อจังหวัด, region หรือ traffic แบบ real-time ในการตัดสินใจ

Haversine ถูกส่งออกเป็น `Straight_Line_Distance_km` เพื่อ sanity check เท่านั้น

`Offline Demo` และ `--offline` เป็น deterministic approximation สำหรับทดสอบ/สาธิตเท่านั้น ไม่ใช่ actual road distance และไม่ควรใช้เป็นหลักฐาน TOR

## Cache

ค่าเริ่มต้นใช้ SQLite ที่ `cache/routing.sqlite3` โดย cache key ประกอบด้วย origin, destination, profile และ provider ระบบแยก cache ระหว่าง ORS กับ Offline Demo ให้เลือก `Force recalculation` หรือ `--force-recalculate` เมื่อจำเป็น

## เริ่มใช้งาน

### Streamlit

```powershell
python -m streamlit run app.py
```

หรือดับเบิลคลิก `run_app.bat` จาก Windows Explorer จากนั้น upload workbook, เลือก Analysis Level/Location Mode และกด `Calculate Routes`

### CLI กับ ORS

```powershell
python cli.py --input input/locations.xlsx --output-dir output
```

### CLI แบบ offline สำหรับ development

```powershell
python cli.py --input input/sample_locations.xlsx --output-dir output --offline --force-recalculate
```

ตัวเลือกสำคัญ: `--location-mode`, `--analysis-level`, `--no-cache`, `--force-recalculate`

## Output files

- `output/route_results.xlsx`: `Route_Results`, `Distance_Matrix`, `Duration_Matrix`, `Province_Summary`, `Hub_Summary`, `Validation_Errors`, `Failed_Routes`
- `output/routes.geojson`: LineString/MultiLineString ของเส้นทางที่จัดสรรแล้ว พร้อม properties สำหรับ QGIS, ArcGIS และ Power BI
- `output/route_map.html`: Folium/Leaflet แสดง Branches, Hubs, routes, region layers และ popup

`Route_Results` เก็บ Calculation_Date, Application_Version, Routing_Profile, Routing_Source, Location_Method และ Coordinate_Source เพื่อ audit TOR

Distance bands ตั้งค่าใน `config/settings.py` ค่าเริ่มต้นคือ 0–50, >50–100, >100–150, >150–200, >200–300 และ >300 km

## Province Level

เลือก `Province Level` เพื่อ deduplicate จังหวัดจากชีต Branches และคำนวณจาก static Province Reference Point ไปยัง Hub ทุกแห่ง ผลลัพธ์ยังอยู่ใน `Route_Results` พร้อม `Analysis_Level = Province` และ `Branch_ID` รูปแบบ `PROV-<Province_Code>` ไม่ควรปะปนกับจำนวนสาขาจริงในรายงาน Branch Level

## Logging และการตรวจสอบ

Log อ่านง่ายอยู่ที่ `logs/application.log` ครอบคลุม startup, validation, province resolution, matrix batch, API status/failure, cache, ranking และ export

รันชุดทดสอบ:

```powershell
pytest -q
```

ตรวจ syntax/import:

```powershell
python -m compileall app.py cli.py src config tests
python -c "import app; import cli; import src.pipeline"
```

## GIS / Power BI

เปิด `routes.geojson` ใน QGIS หรือ ArcGIS ได้โดยตรง ส่วน Power BI สามารถใช้ GeoJSON ผ่าน visual/connector ที่รองรับ GeoJSON และใช้ fields ใน properties เป็น filter/tooltip

แผนที่ใช้ OpenStreetMap tiles และควรรักษา attribution ของ OpenStreetMap เมื่อเผยแพร่ผลลัพธ์

## ข้อจำกัดและ troubleshooting

- ORS มี quota/rate limit; ปรับ `MATRIX_BATCH_SIZE`, timeout และ retry ใน `.env`/`config/settings.py`
- หากไม่มี API key ให้ใช้ Offline Demo เพื่อทดสอบ flow เท่านั้น
- ORS อาจไม่คืนเส้นทางสำหรับพิกัดที่อยู่ห่างถนนหรือข้อมูลผิดพลาด แถวที่ได้รับผลกระทบจะอยู่ใน `Failed_Routes`
- ผล Province Mode เป็น representative point ไม่ใช่ตำแหน่งสาขาจริง
- เขตเตือนพิกัดประเทศไทยเป็น warning ไม่ได้ลบข้อมูลอัตโนมัติ
