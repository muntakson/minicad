"""MiniCAD DXF import/export backend."""

import io
import math
import uuid
from typing import Any

import ezdxf
from ezdxf.entities import DXFGraphic
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="MiniCAD DXF Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── ACI color index → hex (AutoCAD standard palette, first 7) ──

ACI_HEX = {
    1: "#ff0000",
    2: "#ffff00",
    3: "#00ff00",
    4: "#00ffff",
    5: "#0000ff",
    6: "#ff00ff",
    7: "#ffffff",
}


def aci_to_hex(aci: int) -> str:
    return ACI_HEX.get(aci, "#ffffff")


def hex_to_aci(hex_color: str) -> int:
    inv = {v: k for k, v in ACI_HEX.items()}
    return inv.get(hex_color.lower(), 7)


# ── DXF → frontend entity conversion ──


def _eid() -> str:
    return f"e{uuid.uuid4().hex[:8]}"


def _base(entity: DXFGraphic) -> dict[str, Any]:
    color_val = entity.dxf.get("color", 256)
    if color_val == 256:
        color = "bylayer"
    elif color_val == 0:
        color = "bylayer"
    else:
        color = aci_to_hex(color_val)

    lw = entity.dxf.get("lineweight", -1)
    if lw < 0:
        lw = 1

    lt = entity.dxf.get("linetype", "")
    if not lt or lt.upper() == "BYLAYER":
        lt = "continuous"
    elif lt.upper() in ("DASHED", "HIDDEN"):
        lt = "dashed"
    elif lt.upper() in ("CENTER", "DASHDOT"):
        lt = "center"
    else:
        lt = "continuous"

    return {
        "id": _eid(),
        "layer": entity.dxf.get("layer", "0"),
        "color": color,
        "lineweight": max(1, lw // 10) if lw > 0 else 1,
        "linetype": lt,
        "visible": True,
        "selected": False,
    }


def convert_entity(entity: DXFGraphic) -> list[dict[str, Any]]:
    """Convert a single DXF entity to frontend JSON. Returns a list (INSERT can expand)."""
    dtype = entity.dxftype()
    try:
        if dtype == "LINE":
            return [_convert_line(entity)]
        elif dtype == "CIRCLE":
            return [_convert_circle(entity)]
        elif dtype == "ARC":
            return [_convert_arc(entity)]
        elif dtype == "LWPOLYLINE":
            return [_convert_lwpolyline(entity)]
        elif dtype == "POLYLINE":
            return [_convert_polyline(entity)]
        elif dtype == "ELLIPSE":
            return [_convert_ellipse(entity)]
        elif dtype == "TEXT":
            return [_convert_text(entity)]
        elif dtype == "MTEXT":
            return [_convert_mtext(entity)]
        elif dtype == "DIMENSION":
            return [_convert_dimension(entity)]
        elif dtype == "POINT":
            return [_convert_point(entity)]
        elif dtype == "HATCH":
            return [_convert_hatch(entity)]
        elif dtype == "INSERT":
            return _convert_insert(entity)
    except Exception:
        pass
    return []


def _convert_line(e: DXFGraphic) -> dict:
    s = e.dxf.start
    d = e.dxf.end
    return {**_base(e), "type": "line", "start": {"x": s.x, "y": s.y}, "end": {"x": d.x, "y": d.y}}


def _convert_circle(e: DXFGraphic) -> dict:
    c = e.dxf.center
    return {**_base(e), "type": "circle", "center": {"x": c.x, "y": c.y}, "radius": e.dxf.radius}


def _convert_arc(e: DXFGraphic) -> dict:
    c = e.dxf.center
    return {
        **_base(e),
        "type": "arc",
        "center": {"x": c.x, "y": c.y},
        "radius": e.dxf.radius,
        "startAngle": math.radians(e.dxf.start_angle),
        "endAngle": math.radians(e.dxf.end_angle),
    }


def _convert_lwpolyline(e: DXFGraphic) -> dict:
    points = []
    bulges = []
    for x, y, _start_w, _end_w, bulge in e.get_points(format="xyseb"):
        points.append({"x": x, "y": y})
        bulges.append(bulge)
    return {
        **_base(e),
        "type": "polyline",
        "points": points,
        "bulges": bulges,
        "closed": e.closed,
    }


def _convert_polyline(e: DXFGraphic) -> dict:
    points = []
    bulges = []
    for v in e.vertices:
        loc = v.dxf.location
        points.append({"x": loc.x, "y": loc.y})
        bulges.append(v.dxf.get("bulge", 0.0))
    return {
        **_base(e),
        "type": "polyline",
        "points": points,
        "bulges": bulges,
        "closed": e.is_closed,
    }


def _convert_ellipse(e: DXFGraphic) -> dict:
    c = e.dxf.center
    major = e.dxf.major_axis
    return {
        **_base(e),
        "type": "ellipse",
        "center": {"x": c.x, "y": c.y},
        "majorX": major.x,
        "majorY": major.y,
        "ratio": e.dxf.ratio,
        "startParam": e.dxf.start_param,
        "endParam": e.dxf.end_param,
    }


def _convert_text(e: DXFGraphic) -> dict:
    ins = e.dxf.get("insert", ezdxf.math.Vec3(0, 0, 0))
    return {
        **_base(e),
        "type": "text",
        "position": {"x": ins.x, "y": ins.y},
        "text": e.dxf.get("text", ""),
        "height": e.dxf.get("height", 2.5),
        "rotation": e.dxf.get("rotation", 0),
    }


def _convert_mtext(e: DXFGraphic) -> dict:
    ins = e.dxf.get("insert", ezdxf.math.Vec3(0, 0, 0))
    return {
        **_base(e),
        "type": "text",
        "position": {"x": ins.x, "y": ins.y},
        "text": e.plain_text(),
        "height": e.dxf.get("char_height", 2.5),
        "rotation": e.dxf.get("rotation", 0),
    }


def _convert_dimension(e: DXFGraphic) -> dict:
    defpoint = e.dxf.get("defpoint", ezdxf.math.Vec3(0, 0, 0))
    defpoint2 = e.dxf.get("defpoint2", ezdxf.math.Vec3(0, 0, 0))
    defpoint3 = e.dxf.get("defpoint3", ezdxf.math.Vec3(0, 0, 0))
    text_midpoint = e.dxf.get("text_midpoint", ezdxf.math.Vec3(0, 0, 0))
    dim_type_flags = e.dxf.get("dimtype", 0) & 0x0F

    if dim_type_flags == 0:
        dim_type = "linear"
    elif dim_type_flags == 1:
        dim_type = "aligned"
    elif dim_type_flags == 4:
        dim_type = "radius"
    elif dim_type_flags == 3:
        dim_type = "diameter"
    else:
        dim_type = "linear"

    override = e.dxf.get("text", "")

    return {
        **_base(e),
        "type": "dimension",
        "dimType": dim_type,
        "p1": {"x": defpoint2.x, "y": defpoint2.y},
        "p2": {"x": defpoint3.x, "y": defpoint3.y},
        "textPos": {"x": text_midpoint.x, "y": text_midpoint.y},
        "textOverride": override if override else None,
    }


def _convert_point(e: DXFGraphic) -> dict:
    loc = e.dxf.location
    return {**_base(e), "type": "point", "position": {"x": loc.x, "y": loc.y}, "pdmode": 3, "pdsize": 5}


def _convert_hatch(e: DXFGraphic) -> dict:
    boundaries: list[list[dict]] = []
    for path in e.paths:
        pts: list[dict] = []
        if hasattr(path, "vertices"):
            for v in path.vertices:
                pts.append({"x": v[0], "y": v[1]})
        elif hasattr(path, "edges"):
            for edge in path.edges:
                if hasattr(edge, "start"):
                    pts.append({"x": edge.start[0], "y": edge.start[1]})
        if pts:
            boundaries.append(pts)
    pattern = e.dxf.get("pattern_name", "SOLID") or "SOLID"
    return {
        **_base(e),
        "type": "hatch",
        "boundaries": boundaries,
        "patternName": pattern,
        "patternScale": e.dxf.get("pattern_scale", 1.0),
        "patternAngle": e.dxf.get("pattern_angle", 0.0),
    }


def _convert_insert(e: DXFGraphic, depth: int = 0) -> list[dict]:
    if depth > 6:
        return []
    results = []
    try:
        for virtual in e.virtual_entities():
            if virtual.dxftype() == "INSERT":
                results.extend(_convert_insert(virtual, depth + 1))
            else:
                results.extend(convert_entity(virtual))
    except Exception:
        pass
    return results


# ── Frontend entity → DXF entity ──


def write_entity(msp: Any, ent: dict, doc: Any) -> None:
    """Add a frontend entity dict to the DXF modelspace."""
    etype = ent.get("type")
    dxf_attribs: dict[str, Any] = {"layer": ent.get("layer", "0")}

    color = ent.get("color", "bylayer")
    if color != "bylayer":
        dxf_attribs["color"] = hex_to_aci(color)

    lt = ent.get("linetype", "continuous")
    if lt == "dashed":
        dxf_attribs["linetype"] = "DASHED"
    elif lt == "center":
        dxf_attribs["linetype"] = "CENTER"

    if etype == "line":
        msp.add_line(
            (ent["start"]["x"], ent["start"]["y"]),
            (ent["end"]["x"], ent["end"]["y"]),
            dxfattribs=dxf_attribs,
        )
    elif etype == "circle":
        msp.add_circle(
            (ent["center"]["x"], ent["center"]["y"]),
            ent["radius"],
            dxfattribs=dxf_attribs,
        )
    elif etype == "arc":
        msp.add_arc(
            (ent["center"]["x"], ent["center"]["y"]),
            ent["radius"],
            math.degrees(ent["startAngle"]),
            math.degrees(ent["endAngle"]),
            dxfattribs=dxf_attribs,
        )
    elif etype == "polyline":
        pts = ent.get("points", [])
        bulges = ent.get("bulges", [])
        fmt_pts = []
        for i, p in enumerate(pts):
            b = bulges[i] if i < len(bulges) else 0
            fmt_pts.append((p["x"], p["y"], 0, 0, b))
        pline = msp.add_lwpolyline(fmt_pts, format="xyseb", dxfattribs=dxf_attribs)
        if ent.get("closed"):
            pline.close()
    elif etype == "rect":
        c1, c2 = ent["corner1"], ent["corner2"]
        x1, y1 = min(c1["x"], c2["x"]), min(c1["y"], c2["y"])
        x2, y2 = max(c1["x"], c2["x"]), max(c1["y"], c2["y"])
        pts = [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]
        pline = msp.add_lwpolyline(pts, dxfattribs=dxf_attribs)
        pline.close()
    elif etype == "text":
        text_content = ent.get("text", "")
        if "\n" in text_content:
            msp.add_mtext(
                text_content,
                dxfattribs={
                    **dxf_attribs,
                    "insert": (ent["position"]["x"], ent["position"]["y"]),
                    "char_height": ent.get("height", 2.5),
                    "rotation": ent.get("rotation", 0),
                },
            )
        else:
            msp.add_text(
                text_content,
                dxfattribs={
                    **dxf_attribs,
                    "insert": (ent["position"]["x"], ent["position"]["y"]),
                    "height": ent.get("height", 2.5),
                    "rotation": ent.get("rotation", 0),
                },
            )
    elif etype == "point":
        msp.add_point(
            (ent["position"]["x"], ent["position"]["y"]),
            dxfattribs=dxf_attribs,
        )
    elif etype == "hatch":
        pattern = ent.get("patternName", "SOLID")
        if pattern == "SOLID":
            hatch = msp.add_hatch(dxfattribs=dxf_attribs)
        else:
            hatch = msp.add_hatch(
                dxfattribs=dxf_attribs,
            )
            hatch.set_pattern_fill(
                pattern,
                scale=ent.get("patternScale", 1.0),
                angle=ent.get("patternAngle", 0.0),
            )
        for boundary in ent.get("boundaries", []):
            pts = [(p["x"], p["y"]) for p in boundary]
            if pts:
                hatch.paths.add_polyline_path(pts, is_closed=True)
    elif etype == "ellipse":
        msp.add_ellipse(
            (ent["center"]["x"], ent["center"]["y"]),
            (ent["majorX"], ent["majorY"], 0),
            ent["ratio"],
            ent.get("startParam", 0),
            ent.get("endParam", math.tau),
            dxfattribs=dxf_attribs,
        )
    elif etype == "dimension":
        dim_type = ent.get("dimType", "linear")
        p1 = (ent["p1"]["x"], ent["p1"]["y"])
        p2 = (ent["p2"]["x"], ent["p2"]["y"])
        tp = ent.get("textPos", {"x": 0, "y": 0})
        text_pos = (tp["x"], tp["y"])
        override = ent.get("textOverride")
        if dim_type in ("linear", "aligned"):
            dim = msp.add_linear_dim(p1, p2, distance=10, override={"dimtxt": 2.5})
            if override:
                dim.dimension.dxf.text = override
            dim.render()
        elif dim_type == "radius":
            r = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
            if r > 0:
                msp.add_radius_dim(p1, r, math.atan2(p2[1] - p1[1], p2[0] - p1[0]),
                                   override={"dimtxt": 2.5}).render()
        elif dim_type == "diameter":
            r = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
            if r > 0:
                msp.add_diameter_dim(p1, r, math.atan2(p2[1] - p1[1], p2[0] - p1[0]),
                                     override={"dimtxt": 2.5}).render()


# ── API Endpoints ──


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/dxf/import")
async def dxf_import(file: UploadFile = File(...)):
    contents = await file.read()
    stream = io.BytesIO(contents)
    try:
        doc = ezdxf.read(stream)
    except Exception as exc:
        return {"error": f"Failed to parse DXF: {exc}"}

    msp = doc.modelspace()
    entities: list[dict] = []
    for entity in msp:
        entities.extend(convert_entity(entity))

    layers: list[dict] = []
    for layer in doc.layers:
        layers.append({
            "name": layer.dxf.name,
            "color": aci_to_hex(layer.color),
            "visible": not layer.is_off,
            "locked": layer.is_locked,
            "current": layer.dxf.name == "0",
        })
    if not layers:
        layers.append({"name": "0", "color": "#ffffff", "visible": True, "locked": False, "current": True})

    return {"entities": entities, "layers": layers, "count": len(entities)}


class ExportPayload(BaseModel):
    entities: list[dict]
    layers: list[dict] = []
    filename: str = "drawing.dxf"


@app.post("/api/dxf/export")
async def dxf_export(payload: ExportPayload):
    doc = ezdxf.new(dxfversion="R2010", units=ezdxf.units.MM)
    msp = doc.modelspace()

    for layer_data in payload.layers:
        if layer_data["name"] != "0":
            doc.layers.add(layer_data["name"], color=hex_to_aci(layer_data.get("color", "#ffffff")))
        else:
            layer0 = doc.layers.get("0")
            if layer0:
                layer0.color = hex_to_aci(layer_data.get("color", "#ffffff"))

    for ent in payload.entities:
        write_entity(msp, ent, doc)

    buf = io.BytesIO()
    doc.write(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/dxf",
        headers={"Content-Disposition": f'attachment; filename="{payload.filename}"'},
    )
