
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir .

RUN groupadd --gid 10001 stillwild \
    && useradd --uid 10001 --gid stillwild --no-create-home stillwild \
    && mkdir -p /data \
    && chown stillwild:stillwild /data
# Installed application files remain readable and executable by the service user.
USER stillwild:stillwild
ENV STILLWILD_DB_PATH=/data/stillwild.db

CMD ["uvicorn", "stillwild.api:app", "--host", "0.0.0.0", "--port", "8000"]
