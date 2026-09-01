# Architecture and Processing Flow

เอกสารนี้อธิบาย flow การทำงานและโครงสร้างของ Thailand Branch Routing Analysis ด้วย Mermaid โดยแผนภาพจะแสดงลำดับตั้งแต่รับ Excel จนถึง export ผลลัพธ์

## 0. Hybrid deployment overview

```mermaid
flowchart LR
    INPUT[Branches + Regional Hubs Excel] --> PY[Python routing engine]
    ORS[OpenRouteService] <--> PY
    CACHE[(SQLite cache)] <--> PY
    PY --> XLSX[route_results.xlsx]
    PY --> GEO[routes.geojson]
    PY --> HTML[route_map.html]
    XLSX --> WEB[Next.js + TypeScript dashboard]
    GEO --> WEB
    WEB --> MAP[Leaflet + OpenStreetMap]
    WEB --> VERCEL[Vercel deployment]
    MAP --> DECISION[TOR audit / service-area review / planning]
```

Python เป็น calculation and audit layer ส่วน TypeScript เป็น visualization layer จึงไม่ต้องย้าย ORS key, SQLite cache หรือ business rules ไปไว้ใน browser

## 1. End-to-end application flow

```mermaid
flowchart TD
    A[User uploads Excel / CLI input] --> B[Excel Loader]
    B --> C{Required sheets and columns present?}
    C -- No --> C1[Report input error]
    C -- Yes --> D[Validate rows and coordinates]
    D --> E{Analysis level}
    E -- Branch Level --> F[Keep one logical record per branch]
    E -- Province Level --> G[Deduplicate provinces and create PROV-code records]
    F --> H[Resolve branch and hub locations]
    G --> H
    H --> I{Location mode}
    I -- Auto Detect --> I1[Exact coordinates first; province point if both blank]
    I -- Exact Only --> I2[Accept valid exact coordinates only]
    I -- Province Only --> I3[Use static province reference points]
    I1 --> J[Keep invalid records for audit]
    I2 --> J
    I3 --> J
    J --> K[Build branch x hub road-distance matrix]
    K --> L[Read/write SQLite route cache]
    L --> M[Rank valid hubs by Road_Distance_km]
    M --> N[Select Rank 1 assigned hub]
    N --> O[Request detailed geometry for assigned hub only]
    O --> P[Build summaries and distance bands]
    P --> Q[Excel export]
    P --> R[GeoJSON export]
    P --> S[Folium HTML map]
    P --> T[Streamlit tables, KPIs, filters and downloads]
```

## 2. Location resolution decision

```mermaid
flowchart TD
    A[Read one record] --> B{Location mode}
    B -- Province Only --> C[Lookup Province in static 77-province table]
    B -- Exact Lat/Long Only --> D{Both coordinates valid?}
    B -- Auto Detect --> E{Both coordinates valid?}
    C --> C1{Province found?}
    C1 -- Yes --> F[Province Reference Point]
    C1 -- No --> X[Invalid Location + Validation Error]
    D -- Yes --> G[Exact Coordinate]
    D -- No --> X
    E -- Yes --> G
    E -- No --> H{Both coordinates blank?}
    H -- Yes --> C
    H -- No --> X
    G --> I[Coordinate_Source = Input Excel]
    F --> J[Coordinate_Source = Static province reference]
    I --> K[Routeable record]
    J --> K
```

## 3. Routing and cache flow

```mermaid
sequenceDiagram
    participant UI as Streamlit / CLI
    participant Pipeline
    participant Cache as SQLite cache
    participant Provider as RoutingProvider
    participant ORS as OpenRouteService v2

    UI->>Pipeline: run_analysis(branches, hubs, settings)
    Pipeline->>Cache: lookup each coordinate pair
    alt Cached metrics available
        Cache-->>Pipeline: distance and duration
    else Cache miss
        Pipeline->>Provider: calculate_matrix(batch origins, all hubs)
        Provider->>ORS: POST /v2/matrix/{profile}
        ORS-->>Provider: distances and durations
        Provider-->>Pipeline: road metrics
        Pipeline->>Cache: persist successful pair metrics
    end
    Pipeline->>Pipeline: rank all hubs by road distance
    Pipeline->>Provider: get_route(origin, assigned hub)
    Provider->>ORS: POST /v2/directions/{profile}/geojson
    ORS-->>Provider: assigned route geometry
    Provider-->>Pipeline: geometry
    Pipeline-->>UI: results, summaries and export artifacts
```

## 4. Program structure

```mermaid
flowchart LR
    subgraph EntryPoints
        APP[app.py<br/>Streamlit GUI]
        CLI[cli.py<br/>Batch CLI]
    end

    subgraph CorePipeline[src/pipeline.py]
        LOAD[src/excel_loader.py]
        VALID[src/validation.py]
        LOC[src/location_resolver.py]
        MATRIX[src/route_matrix.py]
        RANK[src/route_ranker.py]
        GEOM[src/route_geometry.py]
    end

    subgraph ReferenceAndRouting
        PROV[src/province_reference.py<br/>province_resolver.py]
        ROUTE[src/routing_provider.py]
        ORS[src/ors_provider.py]
        CACHE[src/cache.py]
    end

    subgraph Outputs
        XLSX[src/excel_export.py]
        GEO[src/geojson_export.py]
        MAP[src/map_builder.py]
        SUM[src/province_summary.py<br/>hub_summary.py]
    end

    APP --> LOAD
    CLI --> LOAD
    LOAD --> VALID
    VALID --> LOC
    LOC --> PROV
    LOC --> MATRIX
    MATRIX --> ROUTE
    ROUTE --> ORS
    MATRIX --> CACHE
    MATRIX --> RANK
    RANK --> GEOM
    GEOM --> CACHE
    GEOM --> ROUTE
    RANK --> SUM
    GEOM --> XLSX
    GEOM --> GEO
    GEOM --> MAP
    SUM --> XLSX
```

## 5. Output and audit model

```mermaid
flowchart TD
    R[Route_Results] --> A[Decision audit]
    R --> B[Branch-level map and GIS]
    R --> C[Province_Summary]
    R --> D[Hub_Summary]
    M[Distance_Matrix + Duration_Matrix] --> A
    V[Validation_Errors] --> A
    F[Failed_Routes] --> A
    A --> A1[Location_Method]
    A --> A2[Coordinate_Source]
    A --> A3[Road_Distance_km]
    A --> A4[Routing_Source / Profile]
    A --> A5[Calculation_Date / Version]
```

## Design rules

1. `Road_Distance_km` from the routing provider is the assignment criterion; Haversine is a reference check only.
2. The number of hubs is discovered from input data; routing logic does not assume seven hubs.
3. Matrix routing is batched and cached. Detailed route geometry is requested only after Rank 1 is known.
4. Invalid rows are retained in outputs and reported in `Validation_Errors`; one failed route does not stop the complete run.
5. Province coordinates come from the static UTF-8 `data/thailand_provinces.csv` file so calculations remain reproducible.
