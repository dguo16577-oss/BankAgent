FROM python:3.12-slim-trixie

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HF_HOME=/opt/aster-model \
    OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 TOKENIZERS_PARALLELISM=false HF_HUB_OFFLINE=1
WORKDIR /app
COPY services/knowledge-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --disable-pip-version-check torch==2.8.0+cpu --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir --disable-pip-version-check -r requirements.txt \
    && groupadd --gid 10002 knowledge \
    && useradd --uid 10002 --gid knowledge --no-create-home knowledge
COPY services/knowledge-service/app ./app
COPY --from=embedding-cache / /opt/aster-model/hub/models--intfloat--multilingual-e5-small/
COPY services/knowledge-service/ingest_cli.py ./ingest_cli.py
COPY services/knowledge-service/query_cli.py ./query_cli.py
# The model is baked into the image; runtime retrieval does not download weights.
RUN python -c "from app.embedding import embed; assert len(embed(['test'])[0]) > 0" \
    && chown -R knowledge:knowledge /opt/aster-model
USER knowledge
EXPOSE 8002
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002", "--workers", "1"]
