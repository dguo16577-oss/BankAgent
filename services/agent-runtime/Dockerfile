FROM python:3.12-slim-trixie

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY services/agent-runtime/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --disable-pip-version-check -r requirements.txt \
    && groupadd --gid 10001 agent \
    && useradd --uid 10001 --gid agent --no-create-home agent

COPY --chown=agent:agent services/agent-runtime/app ./app
ARG ASTER_SOURCE_SHA256=unknown
LABEL io.aster.source.sha256=$ASTER_SOURCE_SHA256
USER agent
EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
