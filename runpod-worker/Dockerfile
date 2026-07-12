FROM runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update --yes && \
    DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends \
        curl git libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

COPY runpod-worker/requirements.txt /app/requirements.txt
RUN python -m pip install --upgrade pip && \
    python -m pip install -r /app/requirements.txt

ARG SPACE_REVISION=ba0266e99be1906af1597e13a7f975eed9546a97
RUN curl -fsSL \
    "https://huggingface.co/spaces/WilliamQM/craftbot-lingbot-map/resolve/${SPACE_REVISION}/pipeline.py" \
    -o /app/pipeline.py

COPY runpod-worker/handler.py /app/handler.py

CMD ["python", "-u", "/app/handler.py"]
