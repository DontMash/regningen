# Assemble only an already validated output. Build it outside Docker using
# Node 26.8.1 / pnpm 11.25.0 and the intended deployment configuration.
FROM node:26.8.1-bookworm-slim

ARG SOURCE
ARG COMMIT
ARG VERSION
ARG ORIGIN
ARG TRUST_PROXY
ARG HSTS_STAGE
LABEL org.opencontainers.image.source="${SOURCE}" \
      org.opencontainers.image.revision="${COMMIT}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      io.regningen.origin="${ORIGIN}" \
      io.regningen.trust-proxy="${TRUST_PROXY}" \
      io.regningen.hsts-stage="${HSTS_STAGE}"

WORKDIR /app
COPY --chown=node:node .output/ .output/
# Fail packaging if the validated distribution is incomplete; never rebuild it.
RUN test -f .output/server/index.mjs \
    && test -s .output/LICENSE \
    && test -s .output/public/third-party-notices.txt

ENV NODE_ENV=production \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000 \
    ORIGIN="${ORIGIN}" \
    TRUST_PROXY="${TRUST_PROXY}" \
    HSTS_STAGE="${HSTS_STAGE}"
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
