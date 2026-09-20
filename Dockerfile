FROM python:3.12-slim

WORKDIR /app

COPY app/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ .

ENV DB_PATH=/data/jiefangku.db \
    SECRET_KEY=jiefangku-change-me

EXPOSE 8107

CMD ["python", "-m", "waitress", "--listen=0.0.0.0:8107", "app:app"]
