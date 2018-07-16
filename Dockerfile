FROM ubuntu:16.04
EXPOSE 23000
EXPOSE 8545
EXPOSE 9001
EXPOSE 6328
RUN apt-get update && apt-get install -y --no-install-recommends apt-utils build-essential
RUN apt-get install -y libdb-dev libleveldb-dev libsodium-dev zlib1g-dev libtinfo-dev
RUN apt-get install -y screen
RUN apt-get install -y netcat
RUN apt-get install -y git
RUN apt-get install -y curl
RUN apt-get install -y jq
RUN curl -sL https://deb.nodesource.com/setup_8.x | bash -
RUN apt-get install -y nodejs
RUN mkdir ./smart-contracts
ADD smart-contracts ./smart-contracts
RUN mkdir ./apis
ADD apis ./apis
RUN cd apis && npm install
COPY constellation.sh .
COPY quorum-node.sh .
COPY setup.sh .
COPY Ubuntu/istanbul .
COPY Ubuntu/geth .
COPY Ubuntu/constellation-node .
RUN chmod 755 constellation.sh
RUN chmod 755 quorum-node.sh
RUN chmod 755 setup.sh
RUN chmod 755 istanbul
RUN chmod 755 geth
RUN chmod 755 constellation-node