"""Create the documented development sample workbook."""

from pathlib import Path

import pandas as pd


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    output = root / "input" / "sample_locations.xlsx"
    output.parent.mkdir(parents=True, exist_ok=True)
    branches = pd.DataFrame([
        {"Branch_ID": "B001", "Branch_Name": "Station Rayong 01", "Province": "ระยอง", "Latitude": 12.681, "Longitude": 101.281},
        {"Branch_ID": "B002", "Branch_Name": "Station Chiang Mai 01", "Province": "เชียงใหม่", "Latitude": None, "Longitude": None},
        {"Branch_ID": "B003", "Branch_Name": "Station Khon Kaen 01", "Province": "ขอนแก่น", "Latitude": 16.441, "Longitude": 102.835},
        {"Branch_ID": "B004", "Branch_Name": "Station Phuket 01", "Province": "ภูเก็ต", "Latitude": None, "Longitude": None},
        {"Branch_ID": "B005", "Branch_Name": "Station Chonburi 01", "Province": "ชลบุรี", "Latitude": 13.361, "Longitude": 100.985},
        {"Branch_ID": "B006", "Branch_Name": "Station Songkhla 01", "Province": "Songkhla", "Latitude": None, "Longitude": None},
        {"Branch_ID": "B007", "Branch_Name": "Station Bangkok 01", "Province": "Bangkok", "Latitude": 13.7563, "Longitude": 100.5018},
        {"Branch_ID": "B008", "Branch_Name": "Station Nakhon Sawan 01", "Province": "นครสวรรค์", "Latitude": None, "Longitude": None},
        {"Branch_ID": "B009", "Branch_Name": "Station Surat Thani 01", "Province": "สุราษฎร์ธานี", "Latitude": 9.138, "Longitude": 99.322},
        {"Branch_ID": "B010", "Branch_Name": "Station Udon Thani 01", "Province": "อุดรธานี", "Latitude": None, "Longitude": None},
    ])
    hubs = pd.DataFrame([
        {"Hub_ID": "H01", "Region": "Central", "Hub_Name": "Bangkok Regional Hub", "Province": "กรุงเทพมหานคร", "Latitude": 13.7563, "Longitude": 100.5018},
        {"Hub_ID": "H02", "Region": "North", "Hub_Name": "Chiang Mai Regional Hub", "Province": "เชียงใหม่", "Latitude": 18.7883, "Longitude": 98.9853},
        {"Hub_ID": "H03", "Region": "Northeast", "Hub_Name": "Khon Kaen Regional Hub", "Province": "ขอนแก่น", "Latitude": 16.4419, "Longitude": 102.8350},
        {"Hub_ID": "H04", "Region": "East", "Hub_Name": "Rayong Regional Hub", "Province": "ระยอง", "Latitude": 12.6825, "Longitude": 101.2750},
        {"Hub_ID": "H05", "Region": "West", "Hub_Name": "Kanchanaburi Regional Hub", "Province": "กาญจนบุรี", "Latitude": 14.0228, "Longitude": 99.5328},
        {"Hub_ID": "H06", "Region": "South Upper", "Hub_Name": "Surat Thani Regional Hub", "Province": "สุราษฎร์ธานี", "Latitude": 9.1382, "Longitude": 99.3217},
        {"Hub_ID": "H07", "Region": "South Lower", "Hub_Name": "Songkhla Regional Hub", "Province": "สงขลา", "Latitude": 7.1898, "Longitude": 100.5954},
    ])
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        branches.to_excel(writer, sheet_name="Branches", index=False)
        hubs.to_excel(writer, sheet_name="Regional_Hubs", index=False)
    print(output)


if __name__ == "__main__":
    main()
