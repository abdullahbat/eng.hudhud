import json
import math
import os
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = "."

FLOORS_META = [
    {
        "id": "ground",
        "name": "الدور الأرضي",
        "order": 0,
        "prefix": "G",
        "mapImage": "maps/floor-ground.webp",
        "attribution": "© خريطة تجريبية — كلية الهندسة (الدور الأرضي)",
    },
    {
        "id": "first",
        "name": "الدور الأول",
        "order": 1,
        "prefix": "F1",
        "mapImage": "maps/floor-first.webp",
        "attribution": "© خريطة تجريبية — كلية الهندسة (الدور الأول)",
    },
    {
        "id": "second",
        "name": "الدور الثاني",
        "order": 2,
        "prefix": "F2",
        "mapImage": "maps/floor-second.webp",
        "attribution": "© خريطة تجريبية — كلية الهندسة (الدور الثاني)",
    },
]

# Orthogonal T-shaped corridor spine on each floor (1000x700 image, 10px = 1m -> scale = 0.1 m/px)
# Horizontal main corridor at y = 250 from x = 150 to x = 850 (70m total)
# Vertical wing corridor at x = 500 from y = 250 to y = 550 (30m total)
SPINE_X = [150, 250, 350, 450, 500, 550, 650, 750, 850]
SPINE_Y = [250, 350, 450, 550]


def build_campus_data():
    floors = []
    nodes = []
    edges = []
    facilities = []

    for fmeta in FLOORS_META:
        fid = fmeta["id"]
        pref = fmeta["prefix"]

        floors.append({
            "id": fid,
            "name": fmeta["name"],
            "order": fmeta["order"],
            "mapImage": fmeta["mapImage"],
            "width": 1000,
            "height": 700,
            "attribution": fmeta["attribution"],
            "scale": {
                "p1": {"x": 150, "y": 250},
                "p2": {"x": 850, "y": 250},
                "distanceMeters": 70.0
            },
            "demo": True
        })

        # Create horizontal corridor junction nodes
        for x in SPINE_X:
            nodes.append({
                "id": f"{fid}-h-{x}",
                "floorId": fid,
                "x": x,
                "y": 250,
                "kind": "junction",
                "demo": True
            })

        # Connect horizontal spine edges
        for i in range(len(SPINE_X) - 1):
            x1, x2 = SPINE_X[i], SPINE_X[i + 1]
            dist_m = round(abs(x2 - x1) * 0.1, 2)
            edge_obj = {
                "id": f"{fid}-eh-{x1}-{x2}",
                "floorId": fid,
                "from": f"{fid}-h-{x1}",
                "to": f"{fid}-h-{x2}",
                "computedLengthMeters": dist_m,
                "demo": True
            }
            # Add a valid manual measurement on one main segment per floor
            if i == 0:
                edge_obj["manualLengthMeters"] = 10.0
            edges.append(edge_obj)

        # Create vertical corridor junction nodes (y = 350, 450, 550 at x = 500)
        for y in SPINE_Y[1:]:
            nodes.append({
                "id": f"{fid}-v-{y}",
                "floorId": fid,
                "x": 500,
                "y": y,
                "kind": "junction",
                "demo": True
            })

        # Connect vertical spine edges
        prev_node = f"{fid}-h-500"
        prev_y = 250
        for y in SPINE_Y[1:]:
            curr_node = f"{fid}-v-{y}"
            dist_m = round(abs(y - prev_y) * 0.1, 2)
            edges.append({
                "id": f"{fid}-ev-{prev_y}-{y}",
                "floorId": fid,
                "from": prev_node,
                "to": curr_node,
                "computedLengthMeters": dist_m,
                "demo": True
            })
            prev_node = curr_node
            prev_y = y

        def add_door_facility(code, ftype, name, hx, hy, door_x, door_y, parent_node_id, connector_group=None, kind="door"):
            nid = f"{fid}-door-{code}"
            nodes.append({
                "id": nid,
                "floorId": fid,
                "x": door_x,
                "y": door_y,
                "kind": kind,
                "demo": True
            })
            px_dist = math.hypot(door_x - hx, door_y - hy)
            dist_m = round(px_dist * 0.1, 2)
            edges.append({
                "id": f"{fid}-edoor-{code}",
                "floorId": fid,
                "from": parent_node_id,
                "to": nid,
                "computedLengthMeters": dist_m,
                "demo": True
            })
            fac = {
                "code": code,
                "type": ftype,
                "name": name,
                "floorId": fid,
                "nodeId": nid,
                "demo": True
            }
            if connector_group:
                fac["connectorGroup"] = connector_group
            facilities.append(fac)

        # 1. Rooms & Offices (10 numbered rooms/offices per floor: 01 to 10)
        # North side of horizontal corridor (y = 210, connected to y = 250):
        north_rooms = [
            ("01", 250, "room", f"قاعة دراسية {pref}-01"),
            ("02", 350, "room", f"قاعة دراسية {pref}-02"),
            ("03", 450, "room", f"معمل هندسي {pref}-03"),
            ("04", 550, "room", f"قاعة دراسية {pref}-04"),
            ("05", 650, "room", f"قاعة دراسية {pref}-05"),
            ("06", 750, "room", f"معمل حاسب {pref}-06"),
        ]
        for num, x, rtype, rname in north_rooms:
            code = f"{pref}-{num}"
            add_door_facility(code, rtype, rname, x, 250, x, 210, f"{fid}-h-{x}")

        # South side of horizontal corridor (y = 290, connected to y = 250):
        south_rooms = [
            ("07", 250, "room", f"قاعة محاضرات {pref}-07"),
            ("08", 750, "office" if fid != "ground" else "room", f"مكتب {pref}-08" if fid != "ground" else f"قاعة ندوات {pref}-08"),
        ]
        for num, x, rtype, rname in south_rooms:
            code = f"{pref}-{num}"
            add_door_facility(code, rtype, rname, x, 250, x, 290, f"{fid}-h-{x}")

        # Vertical wing rooms/offices (connected to x = 500 at y = 350 and y = 450):
        wing_rooms = [
            ("09", 350, 460, "office", f"مكتب عضو هيئة تدريس {pref}-09"),
            ("10", 450, 460, "office", f"مكتب عضو هيئة تدريس {pref}-10"),
        ]
        for num, y, dx, rtype, rname in wing_rooms:
            code = f"{pref}-{num}"
            add_door_facility(code, rtype, rname, 500, y, dx, y, f"{fid}-v-{y}")

        # Extra offices on First and Second floors (11)
        if fid in ("first", "second"):
            code = f"{pref}-11"
            add_door_facility(code, "office", f"مكتب عضو هيئة تدريس {pref}-11", 500, 350, 540, 350, f"{fid}-v-350")

        # 2. Two Stairs with constant connectorGroup names across all floors
        add_door_facility(
            f"STAIR-E-{pref}", "stairs", "درج-شرق",
            850, 250, 850, 210, f"{fid}-h-850",
            connector_group="درج-شرق", kind="stairs"
        )
        add_door_facility(
            f"STAIR-W-{pref}", "stairs", "درج-غرب",
            150, 250, 150, 210, f"{fid}-h-150",
            connector_group="درج-غرب", kind="stairs"
        )

        # 3. One Elevator at central intersection (x=500, y=210)
        add_door_facility(
            f"ELEV-1-{pref}", "elevator", "مصعد-1",
            500, 250, 500, 210, f"{fid}-h-500",
            connector_group="مصعد-1", kind="elevator"
        )

        # 4. Men's and Women's Restrooms on every floor
        add_door_facility(
            f"WC-M-{pref}", "wc_men", f"دورة مياه رجال ({fmeta['name']})",
            350, 250, 350, 290, f"{fid}-h-350"
        )
        add_door_facility(
            f"WC-W-{pref}", "wc_women", f"دورة مياه نساء ({fmeta['name']})",
            650, 250, 650, 290, f"{fid}-h-650"
        )

        # 5. Ground floor specific facilities: Prayer room & 2 Entrances
        if fid == "ground":
            add_door_facility(
                "PRAYER-G", "prayer", "المصلى الرئيسي",
                500, 450, 540, 450, "ground-v-450"
            )
            add_door_facility(
                "ENT-MAIN", "entrance", "المدخل الرئيسي (الجنوبي)",
                500, 550, 500, 590, "ground-v-550", kind="entrance"
            )
            add_door_facility(
                "ENT-EAST", "entrance", "المدخل الشرقي",
                850, 250, 890, 250, "ground-h-850", kind="entrance"
            )

    # 5 Landmarks
    landmarks = [
        {
            "id": "lm-main-gate",
            "name": "البوابة الرئيسية (بهو الكلية)",
            "floorId": "ground",
            "nodeId": "ground-door-ENT-MAIN",
            "demo": True
        },
        {
            "id": "lm-prayer",
            "name": "المصلى",
            "floorId": "ground",
            "nodeId": "ground-door-PRAYER-G",
            "demo": True
        },
        {
            "id": "lm-central-elev",
            "name": "بهو المصعد المركزي",
            "floorId": "ground",
            "nodeId": "ground-h-500",
            "demo": True
        },
        {
            "id": "lm-first-labs",
            "name": "جناح معامل الدور الأول",
            "floorId": "first",
            "nodeId": "first-h-450",
            "demo": True
        },
        {
            "id": "lm-second-offices",
            "name": "جناح مكاتب أعضاء هيئة التدريس (الدور الثاني)",
            "floorId": "second",
            "nodeId": "second-v-350",
            "demo": True
        }
    ]

    # 6 Fictional Doctors
    doctors = [
        {
            "id": "doc-1",
            "name": "د. تجريبي أحمد المنصور",
            "officeCode": "G-09",
            "demo": True
        },
        {
            "id": "doc-2",
            "name": "د. تجريبي خالد العتيبي",
            "officeCode": "G-10",
            "demo": True
        },
        {
            "id": "doc-3",
            "name": "د. تجريبي سارة الزهراني",
            "officeCode": "F1-09",
            "demo": True
        },
        {
            "id": "doc-4",
            "name": "د. تجريبي فهد الشمري",
            "officeCode": "F1-10",
            "demo": True
        },
        {
            "id": "doc-5",
            "name": "د. تجريبي نورة القحطاني",
            "officeCode": "F2-09",
            "demo": True
        },
        {
            "id": "doc-6",
            "name": "د. تجريبي عبدالله السبيعي",
            "officeCode": "F2-10",
            "demo": True
        }
    ]

    return {
        "floors": floors,
        "nodes": nodes,
        "edges": edges,
        "facilities": facilities,
        "landmarks": landmarks,
        "doctors": doctors
    }


def draw_floor_maps_and_checks(data):
    font_reg = ImageFont.truetype("/usr/share/fonts/truetype/noto/NotoKufiArabic-Regular.ttf", 13)
    font_bold = ImageFont.truetype("/usr/share/fonts/truetype/noto/NotoKufiArabic-Bold.ttf", 14)
    font_title = ImageFont.truetype("/usr/share/fonts/truetype/noto/NotoKufiArabic-Bold.ttf", 22)
    font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 12)

    nodes_by_id = {n["id"]: n for n in data["nodes"]}

    for floor in data["floors"]:
        fid = floor["id"]
        w, h = floor["width"], floor["height"]

        # 1. Clean architectural floor map (saved as WebP in public/maps/)
        img = Image.new("RGB", (w, h), (248, 250, 252))
        draw = ImageDraw.Draw(img)

        # Subtle grid background
        for gx in range(0, w, 50):
            draw.line([(gx, 0), (gx, h)], fill=(238, 242, 246), width=1)
        for gy in range(0, h, 50):
            draw.line([(0, gy), (w, gy)], fill=(238, 242, 246), width=1)

        # Outer building shell
        draw.rectangle([90, 120, 910, 360], fill=(226, 232, 240), outline=(71, 85, 105), width=3)
        draw.rectangle([410, 355, 590, 600], fill=(226, 232, 240), outline=(71, 85, 105), width=3)

        # Corridor walkable area (T-shape)
        draw.rectangle([130, 225, 870, 275], fill=(255, 255, 255), outline=(148, 163, 184), width=2)
        draw.rectangle([475, 225, 525, 575], fill=(255, 255, 255), outline=(148, 163, 184), width=2)
        # Clear intersection border
        draw.rectangle([476, 226, 524, 274], fill=(255, 255, 255))

        # Draw room boxes around each facility door
        floor_facs = [f for f in data["facilities"] if f["floorId"] == fid]
        for fac in floor_facs:
            nd = nodes_by_id[fac["nodeId"]]
            dx, dy = nd["x"], nd["y"]
            ftype = fac["type"]

            if ftype in ("stairs", "elevator"):
                box_color = (224, 242, 254)
                border_color = (2, 132, 199)
            elif ftype in ("wc_men", "wc_women"):
                box_color = (243, 232, 255)
                border_color = (147, 51, 234)
            elif ftype == "prayer":
                box_color = (220, 252, 231)
                border_color = (22, 163, 74)
            elif ftype == "entrance":
                box_color = (254, 243, 199)
                border_color = (217, 119, 6)
            elif ftype == "office":
                box_color = (254, 249, 195)
                border_color = (161, 98, 7)
            else:
                box_color = (241, 245, 249)
                border_color = (100, 116, 139)

            # Determine room rectangle relative to corridor
            if dy < 225:
                rx1, ry1, rx2, ry2 = dx - 42, 130, dx + 42, 225
            elif dy > 275 and dx != 500 and dy < 330:
                rx1, ry1, rx2, ry2 = dx - 42, 275, dx + 42, 350
            elif dx < 475:
                rx1, ry1, rx2, ry2 = 415, dy - 38, 475, dy + 38
            elif dx > 525 and dy > 300:
                rx1, ry1, rx2, ry2 = 525, dy - 38, 585, dy + 38
            else:
                rx1, ry1, rx2, ry2 = dx - 38, dy - 22, dx + 38, dy + 22

            draw.rectangle([rx1, ry1, rx2, ry2], fill=box_color, outline=border_color, width=2)
            cx, cy = (rx1 + rx2) // 2, (ry1 + ry2) // 2
            draw.text((cx, cy), fac["code"], font=font_small, fill=(15, 23, 42), anchor="mm")

        # Title & attribution on base map
        draw.text((500, 50), f"خريطة {floor['name']} (كلية الهندسة — نموذج تجريبي)", font=font_title, fill=(15, 23, 42), anchor="mm")
        draw.text((20, h - 25), floor["attribution"], font=font_reg, fill=(100, 116, 139), anchor="lm")

        webp_path = os.path.join(BASE_DIR, "public", floor["mapImage"])
        os.makedirs(os.path.dirname(webp_path), exist_ok=True)
        img.save(webp_path, "WEBP", quality=85)

        # 2. Verification Image (docs/check-<floor>.png)
        check_img = img.copy()
        cdraw = ImageDraw.Draw(check_img)

        # Banner at top showing this is a verification image
        cdraw.rectangle([0, 0, w, 32], fill=(15, 23, 42))
        cdraw.text((500, 16), f"صورة تحقق الشبكة والمرافق — {floor['name']} ({fid})", font=font_bold, fill=(248, 250, 252), anchor="mm")

        # Draw edges with lengths in meters
        floor_edges = [e for e in data["edges"] if e["floorId"] == fid]
        for edge in floor_edges:
            n1 = nodes_by_id[edge["from"]]
            n2 = nodes_by_id[edge["to"]]
            x1, y1, x2, y2 = n1["x"], n1["y"], n2["x"], n2["y"]
            is_door_edge = edge["id"].startswith(f"{fid}-edoor-")
            line_color = (245, 158, 11) if is_door_edge else (2, 132, 199)
            cdraw.line([(x1, y1), (x2, y2)], fill=line_color, width=3 if not is_door_edge else 2)

            length_m = edge.get("manualLengthMeters", edge["computedLengthMeters"])
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            if not is_door_edge:
                cdraw.rectangle([mx - 18, my - 10, mx + 18, my + 10], fill=(255, 255, 255), outline=(2, 132, 199), width=1)
                cdraw.text((mx, my), f"{length_m:g}m", font=font_small, fill=(3, 105, 161), anchor="mm")

        # Draw nodes
        floor_nodes = [n for n in data["nodes"] if n["floorId"] == fid]
        for nd in floor_nodes:
            nx, ny = nd["x"], nd["y"]
            r = 4 if nd["kind"] == "junction" else 5
            col = (2, 132, 199) if nd["kind"] == "junction" else (220, 38, 38)
            cdraw.ellipse([nx - r, ny - r, nx + r, ny + r], fill=col, outline=(255, 255, 255), width=1)

        # Draw facility door code badges right at the door node
        for fac in floor_facs:
            nd = nodes_by_id[fac["nodeId"]]
            dx, dy = nd["x"], nd["y"]
            label = fac["code"]
            cdraw.rectangle([dx - 28, dy - 9, dx + 28, dy + 9], fill=(254, 242, 242), outline=(220, 38, 38), width=1)
            cdraw.text((dx, dy), label, font=font_small, fill=(153, 27, 27), anchor="mm")

        check_path = os.path.join(BASE_DIR, "docs", f"check-{fid}.png")
        check_img.save(check_path, "PNG", optimize=True)
        print(f"Generated {webp_path} ({os.path.getsize(webp_path)} B) and {check_path} ({os.path.getsize(check_path)} B)")


if __name__ == "__main__":
    campus = build_campus_data()
    out_json = os.path.join(BASE_DIR, "data", "campus.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(campus, f, ensure_ascii=False, indent=2)
    print(f"Saved {out_json} with {len(campus['floors'])} floors, {len(campus['nodes'])} nodes, {len(campus['edges'])} edges, {len(campus['facilities'])} facilities.")
    draw_floor_maps_and_checks(campus)
