#!/usr/bin/env bash

. ./.circleci/export-env-vars.sh

eval $(aws ecr get-login --no-include-email --region us-west-2)

docker push "${IMAGE_NAME}:latest"

docker push "${IMAGE_NAME}:${NODE_ENV}"

if [ "$NODE_ENV" = "dev" ];
then
    docker push "${IMAGE_NAME}:development"
fi