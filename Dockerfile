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
RUN apt-get install -y sudo
RUN curl -sL https://deb.nodesource.com/setup_8.x | bash -
RUN apt-get install -y nodejs

RUN mkdir /dynamo
WORKDIR /dynamo

RUN apt-get install -y python3-pip
RUN sudo pip3 install pipenv
RUN git clone https://github.com/nucypher/pyUmbral.git
ENV LANGUAGE=en_US.UTF-8 LC_ALL=C.UTF-8 LANG=C.UTF-8
RUN cd pyUmbral && pipenv install --system --deploy --skip-lock --ignore-pipfile && python3 setup.py install
RUN npm install mongo-dynamic-indexer -g --unsafe-perm

COPY install.sh .
COPY quorum-node.sh .
COPY setup.sh .
RUN chmod 755 quorum-node.sh
RUN chmod 755 setup.sh
RUN chmod 755 install.sh

RUN ./install.sh

RUN mkdir ./smart-contracts
ADD smart-contracts ./smart-contracts
RUN mkdir ./apis
ADD apis/package.json ./apis/package.json
RUN cd apis && npm install
ADD apis ./apis
RUN cd apis && npm install
RUN mkdir bcData
