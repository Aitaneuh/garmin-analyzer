# ---- build the Nuxt app ----
FROM node:22-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- run: Node (dashboard) + Python (Garmin Connect helper) ----
FROM python:3.13-slim-trixie
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates libstdc++6 \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --uid 1000 --create-home --shell /usr/sbin/nologin app
COPY --from=build /usr/local/bin/node /usr/local/bin/node

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NUXT_DATA_DIR=/data \
    PYTHON_BIN=python3 \
    GARMIN_BRIDGE=/app/garmin/bridge.py \
    PYTHONDONTWRITEBYTECODE=1

COPY --from=build /app/.output ./.output
COPY garmin ./garmin
# Installed after the app is copied on purpose: every rebuild pulls the newest garminconnect,
# which is what you want when Garmin changes its login.
RUN pip install --no-cache-dir --upgrade "garminconnect>=0.3.20" \
 && mkdir -p /data /import && chown -R app:app /data

USER app
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
