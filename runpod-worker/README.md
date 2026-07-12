# CraftBot LingBot-Map RunPod Worker

Real LingBot-Map inference worker for RunPod Serverless. It accepts the CraftBot
frame payload, runs the long-sequence LingBot checkpoint, confidence-filters and
quantizes the point cloud, and returns solid averaged-color lattice voxels.

Deployment settings:

- Endpoint type: Queue
- Cached model: `robbyant/lingbot-map`
- GPU: 48 GB or larger (`L40`, `L40S`, `A40`, `RTX A6000`, or `A6000 Ada`)
- Active workers: `0`
- Max workers: `1`
- Container disk: at least `20 GB`
- Execution timeout: at least `300 seconds`
- Environment: `MODEL_NAME=robbyant/lingbot-map`

RunPod mounts the cached checkpoint below
`/runpod-volume/huggingface-cache/hub/`; the worker resolves
`lingbot-map-long.pt` from that cache and only falls back to a runtime download
when no cache is mounted.

The server sends requests through RunPod's `/runsync` envelope and expects a
`runpod-serverless` voxel response.
