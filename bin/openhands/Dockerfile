# Shipyard OpenHands sandbox image (built by bin/openhands-step.sh, tagged by content hash).
# BASE_IMAGE is the profile's toolchain image (OPENHANDS_BASE_IMAGE in profiles/<name>/profile.env),
# e.g. maven:3.9-eclipse-temurin-21 or node:22-bookworm, so the agent can build and test the app.
# The OpenHands SDK lives in its own venv (/opt/openhands) with a uv-managed Python, independent
# of whatever Python the base image has.
ARG BASE_IMAGE=debian:bookworm-slim
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.8.17
FROM ${UV_IMAGE} AS uv
FROM ${BASE_IMAGE}
USER root
ARG EXTRA_PACKAGES=""
# git + tmux (terminal tool) + certificates; works on Debian/Ubuntu (apt) and Alpine (apk) bases.
RUN set -eux; \
    if command -v apt-get >/dev/null; then \
      apt-get update; DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        git tmux ca-certificates curl procps ${EXTRA_PACKAGES}; rm -rf /var/lib/apt/lists/*; \
    elif command -v apk >/dev/null; then \
      apk add --no-cache git tmux ca-certificates curl procps bash ${EXTRA_PACKAGES}; \
    fi
COPY --from=uv /uv /usr/local/bin/uv
ARG OPENHANDS_SDK_VERSION=1.56.0
ENV UV_PYTHON_INSTALL_DIR=/opt/uv-python UV_NO_CACHE=1
RUN uv venv --python 3.12 --python-preference only-managed /opt/openhands \
 && uv pip install --python /opt/openhands/bin/python \
      "openhands-sdk==${OPENHANDS_SDK_VERSION}" "openhands-tools==${OPENHANDS_SDK_VERSION}" \
 && chmod -R a+rX /opt/openhands /opt/uv-python
COPY runner.py /opt/shipyard/runner.py
# Runs as the host user (docker run --user), HOME on a writable tmpfs.
ENV HOME=/tmp/home PYTHONUNBUFFERED=1 OPENHANDS_SUPPRESS_BANNER=1
WORKDIR /workspace
ENTRYPOINT ["/opt/openhands/bin/python", "/opt/shipyard/runner.py"]
