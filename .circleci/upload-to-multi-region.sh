#!/usr/bin/env bash

. ./.circleci/export-env-vars.sh

eval $(aws ecr get-login --no-include-email --region us-west-2)

docker pull "402432300121.dkr.ecr.us-west-2.amazonaws.com/dynamo:$NODE_ENV"

docker tag "402432300121.dkr.ecr.us-west-2.amazonaws.com/dynamo:$NODE_ENV" "402432300121.dkr.ecr.ap-south-1.amazonaws.com/dynamo:$NODE_ENV"

eval $(aws ecr get-login --no-include-email --region ap-south-1)

docker push "402432300121.dkr.ecr.ap-south-1.amazonaws.com/dynamo:$NODE_ENV"