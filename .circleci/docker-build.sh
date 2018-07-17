#!/usr/bin/env bash
. ./.circleci/export-env-vars.sh

docker build -f Dockerfile \
    -t "${IMAGE_NAME}:latest" \
    .