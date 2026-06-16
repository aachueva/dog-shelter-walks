FROM python:3.11-slim

WORKDIR /app

COPY server.py walk_stats.py sample-data.csv ./
COPY public ./public

ENV HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080

CMD ["python3", "server.py"]
