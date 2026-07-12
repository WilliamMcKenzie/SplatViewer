from math import cos, sin, sqrt
from typing import List

from fastapi import FastAPI
from pydantic import BaseModel


app = FastAPI(title="CraftBot Worker")


class Frame(BaseModel):
    heading: float
    pitch: float
    fov: float
    mime: str
    data: str


class ReconstructRequest(BaseModel):
    lat: float
    lng: float
    panoId: str
    voxelSize: float = 1.0
    frames: List[Frame]


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/reconstruct")
def reconstruct(req: ReconstructRequest):
    voxels = []
    seed = int(abs(req.lat * 1000) + abs(req.lng * 1000)) % 32

    for x in range(-12, 13):
        for z in range(-12, 13):
            dist = sqrt(x * x + z * z)
            if dist > 13 or (x + z + seed) % 5 == 0:
                continue

            height = 1 + int(3 + 2 * sin((x + seed) * 0.45) + 2 * cos((z - seed) * 0.35))
            if dist < 4:
                height = 1

            for y in range(max(1, height)):
                t = y / max(1, height - 1)
                voxels.append(
                    {
                        "x": x,
                        "y": y,
                        "z": z,
                        "r": int(80 + (x + 12) * 4),
                        "g": int(110 + t * 80),
                        "b": int(120 + (z + 12) * 3),
                        "a": 1,
                    }
                )

    return {
        "source": "runpod",
        "panoId": req.panoId,
        "lat": req.lat,
        "lng": req.lng,
        "voxels": voxels,
    }
