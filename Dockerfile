FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1 PORT=8501
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && groupadd --gid 10001 arcade \
    && useradd --uid 10001 --gid arcade --create-home arcade \
    && mkdir /data && chown arcade:arcade /data /app
COPY --chown=arcade:arcade app.py ./
COPY --chown=arcade:arcade brain_racer/ ./brain_racer/
COPY --chown=arcade:arcade assets/ ./assets/
COPY --chown=arcade:arcade static/ ./static/
COPY --chown=arcade:arcade data/questions.json ./data/questions.json
COPY --chown=arcade:arcade scripts/serve.py ./scripts/serve.py
COPY --chown=arcade:arcade .streamlit/config.toml ./.streamlit/config.toml
USER arcade
EXPOSE 8501
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8501')+'/_stcore/health',timeout=4)"
CMD ["python", "scripts/serve.py"]
