"""RunPod Serverless worker for CraftBot's real LingBot-Map reconstruction."""

from __future__ import annotations

import base64
import glob
import math
import os
import tempfile
from pathlib import Path

import numpy as np
import runpod
import torch
from huggingface_hub import hf_hub_download

import pipeline as P


MODEL_ID = os.environ.get("MODEL_NAME", "robbyant/lingbot-map")
MODEL_FILE = os.environ.get("MODEL_FILE", "lingbot-map-long.pt")
HF_CACHE_ROOT = os.environ.get(
    "HF_CACHE_ROOT",
    "/runpod-volume/huggingface-cache/hub",
)


def resolve_checkpoint() -> str:
    org, name = MODEL_ID.split("/", 1)
    pattern = os.path.join(
        HF_CACHE_ROOT,
        f"models--{org}--{name}",
        "snapshots",
        "*",
        MODEL_FILE,
    )
    matches = sorted(glob.glob(pattern))
    if matches:
        return matches[-1]
    return hf_hub_download(repo_id=MODEL_ID, filename=MODEL_FILE)


print(f"[startup] loading {MODEL_ID}/{MODEL_FILE}")
MODEL = P.build_model(
    resolve_checkpoint(),
    device="cuda",
    camera_num_iterations=4,
    use_sdpa=True,
)
if getattr(MODEL, "aggregator", None) is not None:
    MODEL.aggregator = MODEL.aggregator.to(dtype=torch.bfloat16)
print("[startup] LingBot-Map ready")


def decode_frames(frames: list[dict], directory: str) -> list[str]:
    paths = []
    for index, frame in enumerate(frames[:16]):
        mime = str(frame.get("mime", "image/jpeg"))
        suffix = ".png" if "png" in mime else ".jpg"
        path = os.path.join(directory, f"{index:03d}{suffix}")
        Path(path).write_bytes(base64.b64decode(frame["data"], validate=True))
        paths.append(path)
    if len(paths) < 2:
        raise ValueError("LingBot-Map needs at least two frames")
    return paths


def aligned_points(rec: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    points = np.asarray(rec["points"], dtype=np.float64)
    colors = np.asarray(rec["colors"], dtype=np.uint8)
    confidence = np.asarray(rec["conf"], dtype=np.float64)
    threshold = np.percentile(confidence, 65) if confidence.size else 0
    keep = (confidence >= threshold) & (confidence > 1e-5)
    points, colors, confidence = points[keep], colors[keep], confidence[keep]

    # LingBot exposes camera extrinsics as [S, 3, 4]; the alignment helper
    # operates on homogeneous [S, 4, 4] world-to-camera matrices.
    _, w2c = P._camera_centers_world(rec["extrinsic"])
    transform = P._alignment_transform(w2c)
    homogeneous = np.concatenate(
        [points, np.ones((len(points), 1), dtype=np.float64)],
        axis=1,
    )
    points = (homogeneous @ transform.T)[:, :3]
    finite = np.isfinite(points).all(axis=1)
    return points[finite], colors[finite], confidence[finite]


def voxelize(points: np.ndarray, colors: np.ndarray, requested_size: float) -> list[dict]:
    if len(points) == 0:
        return []

    sample_step = max(1, len(points) // 20_000)
    sample = points[::sample_step]
    x_lo, x_hi = np.percentile(sample[:, 0], [1, 99])
    y_lo, y_hi = np.percentile(sample[:, 1], [1, 99.5])
    z_lo, z_hi = np.percentile(sample[:, 2], [1, 99])
    span = max(x_hi - x_lo, z_hi - z_lo)
    cell_size = max(float(requested_size or 0.05), span / 32, (y_hi - y_lo) / 24)
    if not math.isfinite(cell_size) or cell_size <= 0:
        cell_size = 0.05

    bounded = (
        (points[:, 0] >= x_lo) & (points[:, 0] <= x_hi)
        & (points[:, 1] >= y_lo) & (points[:, 1] <= y_hi)
        & (points[:, 2] >= z_lo) & (points[:, 2] <= z_hi)
    )
    points, colors = points[bounded], colors[bounded]

    center_x = (x_lo + x_hi) / 2
    center_z = (z_lo + z_hi) / 2
    center_cell_x = math.floor(center_x / cell_size)
    center_cell_z = math.floor(center_z / cell_size)
    ground_cell_y = math.floor(y_lo / cell_size)
    keys = np.column_stack(
        (
            np.floor(points[:, 0] / cell_size).astype(np.int32) - center_cell_x,
            np.floor(points[:, 1] / cell_size).astype(np.int32) - ground_cell_y,
            np.floor(points[:, 2] / cell_size).astype(np.int32) - center_cell_z,
        )
    )
    inside = (
        (keys[:, 0] >= -18) & (keys[:, 0] <= 18)
        & (keys[:, 1] >= 0) & (keys[:, 1] <= 24)
        & (keys[:, 2] >= -18) & (keys[:, 2] <= 18)
    )
    keys, colors = keys[inside], colors[inside]
    if len(keys) == 0:
        return []

    unique, inverse, counts = np.unique(keys, axis=0, return_inverse=True, return_counts=True)
    sums = np.column_stack(
        [np.bincount(inverse, weights=colors[:, channel]) for channel in range(3)]
    )
    averages = np.floor(sums / counts[:, None]).astype(np.uint8)
    order = np.argsort(counts)[::-1][:12_000]

    return [
        {
            "x": int(unique[index, 0]),
            "y": int(unique[index, 1]),
            "z": int(unique[index, 2]),
            "r": int(averages[index, 0]),
            "g": int(averages[index, 1]),
            "b": int(averages[index, 2]),
            "a": 1,
        }
        for index in order
    ]


def handler(event: dict) -> dict:
    payload = event.get("input") or {}
    frames = payload.get("frames") or []
    with tempfile.TemporaryDirectory(prefix="craftbot_frames_") as directory:
        paths = decode_frames(frames, directory)
        images = P.preprocess_paths(paths)
        rec = P.reconstruct_points(
            MODEL,
            images,
            num_scale_frames=min(8, len(paths)),
            keyframe_interval=1,
            max_return_points=3_000_000,
        )

    points, colors, _ = aligned_points(rec)
    voxels = voxelize(points, colors, float(payload.get("voxelSize") or 0.05))
    if not voxels:
        raise RuntimeError("LingBot returned no usable voxels")
    return {
        "source": "runpod-serverless",
        "panoId": payload.get("panoId", ""),
        "lat": float(payload.get("lat") or 0),
        "lng": float(payload.get("lng") or 0),
        "voxels": voxels,
    }


runpod.serverless.start({"handler": handler})
