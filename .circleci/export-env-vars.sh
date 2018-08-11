#!/usr/bin/env bash

export COMMIT_HASH=${CIRCLE_SHA1}

if [ "$CIRCLE_BRANCH" = "master" ] || [ "$CIRCLE_TAG" = "production" ];
then
    export NODE_ENV="production"
    export API_HOST="https://app.blockcluster.io"
elif [ "$CIRCLE_BRANCH" = "staging" ] || [ "$CIRCLE_TAG" = "staging" ];
then 
    export NODE_ENV="staging"
    export API_HOST="https://staging.blockcluster.io"
elif [ "$CIRCLE_BRANCH" = "test" ] || [ "$CIRCLE_TAG" = "test" ];
then
    export NODE_ENV="test"
    export API_HOST="https://test.blockcluster.io"
else
    export NODE_ENV="dev"
    export API_HOST="https://dev.blockcluster.io"
fi


export IMAGE_NAME='402432300121.dkr.ecr.us-west-2.amazonaws.com/dynamo'
