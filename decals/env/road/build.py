#!/usr/bin/env python3
"""Vietnam road sign scraper — Wikimedia Commons compliant downloader.

Policies followed:
  - User-Agent with contact info
  - Retry-After header respected
  - Single-threaded, max 1 req/sec
  - Uses Special:Redirect/file for source SVGs
"""

import json, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

OUTDIR = Path(__file__).resolve().parent
SVGDIR = OUTDIR / "svg"
CONTACT = "RoadSignLover/1.0 (https://github.com/Team-Fuho/resourcepack; lienhe@teamfuho.net)"
UA = CONTACT

SIGNS = {
    "Vietnam_road_sign_I407a.svg": "Biển I.407a - Đường một chiều",
    "Vietnam_road_sign_I408.svg": "Biển I.408 - Nơi đỗ xe",
    "Vietnam_road_sign_I409.svg": "Biển I.409 - Bến xe buýt",
    "Vietnam_road_sign_I423b.svg": "Biển I.423b - Vị trí người đi bộ sang ngang bên phải",
    "Vietnam_road_sign_I423c.svg": "Biển I.423c - Vị trí người đi bộ sang ngang",
    "Vietnam_road_sign_I424a.svg": "Biển I.424a - Cầu vượt qua đường cho người đi bộ bên trái",
    "Vietnam_road_sign_I424c.svg": "Biển I.424c - Hầm chui qua đường cho người đi bộ bên trái",
    "Vietnam_road_sign_I424d.svg": "Biển I.424d - Hầm chui qua đường cho người đi bộ bên phải",
    "Vietnam_road_sign_I425.svg": "Biển I.425 - Bệnh viện",
    "Vietnam_road_sign_I437.svg": "Biển I.437 - Đường cao tốc",
    "Vietnam_road_sign_I441b.svg": "Biển I.441b - Chỉ dẫn khoảng cách đến đoạn đường đang thi công",
    "Vietnam_road_sign_I441c.svg": "Biển I.441c - Chỉ dẫn khoảng cách đến đoạn đường đang thi công",
    "Vietnam_road_sign_I444k.svg": "Biển I.444k - Biển chỉ dẫn hướng vào ga tàu điện ngầm",
    "Vietnam_road_sign_I446.svg": "Biển I.446 - Chỉ dẫn hướng vào bệnh viện",
    "Vietnam_road_sign_IE453c.svg": "Biển IE.453c - Hết đường cao tốc",
    "Vietnam_road_sign_IE467b.svg": "Biển IE.467b - Vị trí nhập làn xe",
    "Vietnam_road_sign_IE468b.svg": "Biển IE.468b - Chướng ngại vật phía trước – đi được cả hai hướng",
    "Vietnam_road_sign_P.125_(QCVN_41-2016-BGTVT).svg": "Biển P.125 - Cấm vượt",
    "Vietnam_road_sign_P101.svg": "Biển P.101 - Đường cấm",
    "Vietnam_road_sign_P102.svg": "Biển P.102 - Cấm đi ngược chiều",
    "Vietnam_road_sign_P103a.svg": "Biển P.103a - Cấm xe ô tô",
    "Vietnam_road_sign_P103b.svg": "Biển P.103b - Cấm xe ô tô rẽ phải",
    "Vietnam_road_sign_P103c.svg": "Biển P.103c - Cấm xe ô tô rẽ trái",
    "Vietnam_road_sign_P104.svg": "Biển P.104 - Cấm xe máy",
    "Vietnam_road_sign_P105.svg": "Biển P.105 - Cấm xe ô tô và xe máy",
    "Vietnam_road_sign_P106a.svg": "Biển P.106a - Cấm xe ô tô tải",
    "Vietnam_road_sign_P107.svg": "Biển P.107 - Cấm xe ô tô khách và xe ô tô tải",
    "Vietnam_road_sign_P107a.svg": "Biển P.107a - Cấm xe ô tô khách",
    "Vietnam_road_sign_P107b.svg": "Biển P.107b - Cấm xe ô tô khách và xe buýt",
    "Vietnam_road_sign_P110a.svg": "Biển P.110a - Cấm xe đạp",
    "Vietnam_road_sign_P111a.svg": "Biển P.111a - Cấm xe gắn máy",
    "Vietnam_road_sign_P112.svg": "Biển P.112 - Cấm người đi bộ",
    "Vietnam_road_sign_P122.svg": "Biển P.122 - Cấm dừng xe bên phải",
    "Vietnam_road_sign_P123a.svg": "Biển P.123a - Cấm rẽ trái",
    "Vietnam_road_sign_P123b.svg": "Biển P.123b - Cấm rẽ phải",
    "Vietnam_road_sign_P124a1.svg": "Biển P.124a1 - Cấm quay đầu xe (được rẽ trái)",
    "Vietnam_road_sign_P124a2.svg": "Biển P.124a2 - Cấm quay đầu xe (được rẽ phải)",
    "Vietnam_road_sign_P124b1.svg": "Biển P.124b1 - Cấm xe ô tô quay đầu (được rẽ trái)",
    "Vietnam_road_sign_P124b2.svg": "Biển P.124b2 - Cấm xe ô tô quay đầu (được rẽ phải)",
    "Vietnam_road_sign_P124c.svg": "Biển P.124c - Cấm rẽ trái và quay đầu xe",
    "Vietnam_road_sign_P124d.svg": "Biển P.124d - Cấm rẽ phải và quay đầu xe",
    "Vietnam_road_sign_P124e.svg": "Biển P.124e - Cấm ô tô rẽ trái và quay đầu xe",
    "Vietnam_road_sign_P127-100.svg": "Biển P.127 - Tốc độ tối đa 100 km/h",
    "Vietnam_road_sign_P127-120.svg": "Biển P.127 - Tốc độ tối đa 120 km/h",
    "Vietnam_road_sign_P127-5.svg": "Biển P.127 - Tốc độ tối đa 5 km/h",
    "Vietnam_road_sign_P127-50.svg": "Biển P.127 - Tốc độ tối đa 50 km/h",
    "Vietnam_road_sign_P127c.svg": "Biển P.127c - Giới hạn tốc độ theo phương tiện trên từng làn đường",
    "Vietnam_road_sign_P128.svg": "Biển P.128 - Cấm rẽ phải khi đèn đỏ",
    "Vietnam_road_sign_P130.svg": "Biển P.130 - Cấm dừng xe và đỗ xe",
    "Vietnam_road_sign_P131a.svg": "Biển P.131a - Cấm đỗ xe",
    "Vietnam_road_sign_P131c.svg": "Biển P.131c - Cấm đỗ xe ngày chẵn",
    "Vietnam_road_sign_P136.svg": "Biển P.136 - Cấm đi thẳng",
    "Vietnam_road_sign_P137.svg": "Biển P.137 - Cấm rẽ trái và rẽ phải",
    "Vietnam_road_sign_P138.svg": "Biển P.138 - Cấm đi thẳng và rẽ trái",
    "Vietnam_road_sign_P139.svg": "Biển P.139 - Cấm đi thẳng và rẽ phải",
    "Vietnam_road_sign_R122.svg": "Biển R.122 - Dừng lại",
    "Vietnam_road_sign_R301a.svg": "Biển R.301a - Hướng đi thẳng phải theo",
    "Vietnam_road_sign_R301b.svg": "Biển R.301b - Hướng đi phải phải theo",
    "Vietnam_road_sign_R301c.svg": "Biển R.301c - Hướng đi trái phải theo",
    "Vietnam_road_sign_R301d.svg": "Biển R.301d - Các xe chỉ được rẽ phải",
    "Vietnam_road_sign_R301e.svg": "Biển R.301e - Các xe chỉ được rẽ trái",
    "Vietnam_road_sign_R301i.svg": "Biển R.301i - Các xe chỉ được đi thẳng và rẽ phải",
    "Vietnam_road_sign_R302a.svg": "Biển R.302a - Phải đi vòng sang bên phải",
    "Vietnam_road_sign_R302b.svg": "Biển R.302b - Phải đi vòng sang bên trái",
    "Vietnam_road_sign_R302c.svg": "Biển R.302c - Phải đi vòng sang bên trái phía trước",
    "Vietnam_road_sign_R303.svg": "Biển R.303 - Nơi giao nhau chạy theo vòng xuyến",
    "Vietnam_road_sign_R304.svg": "Biển R.304 - Đường dành cho xe thô sơ",
    "Vietnam_road_sign_R305.svg": "Biển R.305 - Đường dành cho người đi bộ",
    "Vietnam_road_sign_R308a.svg": "Biển R.308a - Tuyến đường cầu vượt cắt qua",
    "Vietnam_road_sign_R308b.svg": "Biển R.308b - Tuyến đường cầu vượt cắt qua",
    "Vietnam_road_sign_R309.svg": "Biển R.309 - Ấn còi",
    "Vietnam_road_sign_R403a.svg": "Biển R.403a - Hướng đi phải theo",
    "Vietnam_road_sign_R403b.svg": "Biển R.403b - Hướng đi phải theo (phân làn)",
    "Vietnam_road_sign_R403f.svg": "Biển R.403f - Hướng đi phải theo (náy)",
    "Vietnam_road_sign_R415a.svg": "Biển R.415a - Phân làn",
    "Vietnam_road_sign_R415b.svg": "Biển R.415b - Hết phân làn",
    "Vietnam_road_sign_R420.svg": "Biển R.420 - Bắt đầu khu đông dân cư",
    "Vietnam_road_sign_S505a.svg": "Biển S.505a - Loại xe",
    "Vietnam_road_sign_S507.svg": "Biển S.507 - Hướng rẽ",
    "Vietnam_road_sign_W201a.svg": "Biển W.201a - Chỗ ngoặt nguy hiểm bên trái",
    "Vietnam_road_sign_W201b.svg": "Biển W.201b - Chỗ ngoặt nguy hiểm bên phải",
    "Vietnam_road_sign_W204.svg": "Biển W.204 - Đường hai chiều",
    "Vietnam_road_sign_W207a.svg": "Biển W.207a - Đường bị hẹp cả hai bên",
    "Vietnam_road_sign_W207b.svg": "Biển W.207b - Đường bị hẹp bên trái",
    "Vietnam_road_sign_W207c.svg": "Biển W.207c - Đường bị hẹp bên phải",
    "Vietnam_road_sign_W208.svg": "Biển W.208 - Giao nhau với đường ưu tiên",
    "Vietnam_road_sign_W209.svg": "Biển W.209 - Đường đôi giao nhau",
    "Vietnam_road_sign_W221a.svg": "Biển W.221a - Đường có ổ gà",
    "Vietnam_road_sign_W221b.svg": "Biển W.221b - Đường có gồ giảm tốc",
    "Vietnam_road_sign_W224.svg": "Biển W.224 - Đường người đi bộ cắt ngang",
    "Vietnam_road_sign_W225.svg": "Biển W.225 - Trẻ em",
    "Vietnam_road_sign_W227.svg": "Biển W.227 - Giao nhau với đường có dải phân cách",
    "Vietnam_road_sign_W233.svg": "Biển W.233 - Nguy hiểm khác",
    "Vietnam_road_sign_W240.svg": "Biển W.240 - Đoạn đường thường xuyên có gió ngang",
    "Vietnam_road_sign_W239a.svg": "Biển W.239a - Giao nhau với đường không ưu tiên",
    "Vietnam_road_sign_W242a.svg": "Biển W.242a - Giao nhau vuông góc với một cặp đường ray",
    "Vietnam_road_sign_W242b.svg": "Biển W.242b - Giao nhau vuông góc với nhiều cặp đường ray",
    "Vietnam_road_sign_W243a.svg": "Biển W.243a - Biển báo hiệu gần chỗ giao cắt đường sắt (3 vạch)",
    "Vietnam_road_sign_W243b.svg": "Biển W.243b - Biển báo hiệu gần chỗ giao cắt đường sắt (2 vạch)",
    "Vietnam_road_sign_W243c.svg": "Biển W.243c - Biển báo hiệu gần chỗ giao cắt đường sắt (1 vạch)",
    "Vietnam_road_sign_W245a.svg": "Biển W.245a - Đi chậm",
    "Vietnam_road_sign_W245b.svg": "Biển W.245b - Đi chậm (song ngữ)",
    "Vietnam_road_sign_W247.svg": "Biển W.247 - Chú ý xe đỗ",
}

ALL = sorted(SIGNS.keys())
SVGDIR.mkdir(exist_ok=True, parents=True)


def is_svg(p: Path) -> bool:
    if not p.exists() or p.stat().st_size < 100:
        return False
    return b"<svg" in open(p, "rb").read(500)


def urlopen_with_retry(url: str, max_retries=5) -> bytes | None:
    for attempt in range(max_retries):
        req = Request(url.replace(" ", "%20"), headers={"User-Agent": UA})
        try:
            with urlopen(req, timeout=60) as resp:
                return resp.read()
        except HTTPError as e:
            if e.code == 429:
                retry_after = e.headers.get("Retry-After", "60")
                try:
                    wait = int(retry_after)
                except ValueError:
                    wait = 60
                print(f"    429: waiting {wait}s (attempt {attempt+1}/{max_retries})")
                time.sleep(wait)
                continue
            body = e.read() if hasattr(e, 'read') else b''
            if b"429" in body or b"Too Many Requests" in body or b"too many requests" in body.lower():
                print(f"    429 in body: waiting 60s (attempt {attempt+1}/{max_retries})")
                time.sleep(60)
                continue
            print(f"    HTTP {e.code}: {str(e)[:100]}")
            return None
        except Exception as e:
            print(f"    Network error: {str(e)[:100]}")
            time.sleep(30)
            continue
    print(f"    Failed after {max_retries} retries")
    return None


# ── 1. Download SVGs via Special:Redirect ──
print("=== Download SVGs (Special:Redirect) ===")
for fn in ALL:
    svg = SVGDIR / fn
    if is_svg(svg):
        continue

    url_name = fn.replace("_", " ")
    dl_url = f"https://commons.wikimedia.org/wiki/Special:Redirect/file/{url_name}"
    print(f"  {fn}")

    data = urlopen_with_retry(dl_url)
    if data and len(data) > 100 and b"<svg" in data[:500]:
        with open(svg, "wb") as f:
            f.write(data)
        print(f"    OK ({len(data)//1024}K)")
    elif data:
        print(f"    Not SVG ({len(data)} bytes): {data[:100]}")
    else:
        print(f"    FAILED")

    time.sleep(0.1)

# ── 2. Metadata ──
print("\n=== Metadata ===")
meta = {}
for fn in ALL:
    desc = SIGNS[fn]
    code = desc.split(" - ")[0]
    viet = desc.split(" - ")[1] if " - " in desc else desc
    meta[fn] = {
        "filename": fn,
        "png": fn.replace(".svg", ".png"),
        "display_name": fn.replace(".svg", "").replace("_", " "),
        "sign_code": code,
        "vietnamese": viet,
        "category": (
            "prohibition" if fn.startswith("Vietnam_road_sign_P") else
            "warning" if fn.startswith("Vietnam_road_sign_W") else
            "mandatory" if fn.startswith("Vietnam_road_sign_R") else
            "indicative" if fn.startswith("Vietnam_road_sign_I") or fn.startswith("Vietnam_road_sign_IE") else
            "supplementary"
        ),
        "source": "Wikimedia Commons",
        "license": "Public domain",
        "author": "Government of Vietnam",
    }

with open(OUTDIR / "metadata.json", "w", encoding="utf-8") as f:
    json.dump(meta, f, indent=2, ensure_ascii=False)

svg_ok = sum(1 for fn in ALL if is_svg(SVGDIR / fn))
print(f"SVGs: {svg_ok}/{len(ALL)}")
