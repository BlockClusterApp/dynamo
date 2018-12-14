FROM node:8.12
EXPOSE 23000
EXPOSE 8545
EXPOSE 9001
EXPOSE 6328
RUN apt-get update && apt-get install -y --no-install-recommends apt-utils build-essential
RUN apt-get install -y libdb-dev libleveldb-dev libsodium-dev zlib1g-dev libtinfo-dev
RUN apt-get install -y screen netcat git curl jq sudo
RUN curl -sL https://deb.nodesource.com/setup_8.x | bash -
RUN apt-get install -y nodejs

RUN mkdir /dynamo
WORKDIR /dynamo

RUN wget https://www.python.org/ftp/python/3.6.3/Python-3.6.3.tgz && tar xvf Python-3.6.3.tgz && cd Python-3.6.3 && ./configure --with-ensurepip=install --enable-optimizations && make -j8 && sudo make altinstall
RUN sudo apt-get install -y make build-essential libssl-dev zlib1g-dev libbz2-dev libreadline-dev libsqlite3-dev wget curl llvm libncurses5-dev libncursesw5-dev xz-utils tk-dev libffi-dev liblzma-dev
RUN apt-get install -y python3-pip
RUN sudo pip3 install pipenv
RUN git clone https://github.com/nucypher/pyUmbral.git
ENV LANGUAGE=en_US.UTF-8 LC_ALL=C.UTF-8 LANG=C.UTF-8
RUN cd pyUmbral && pipenv install --system --deploy --skip-lock --ignore-pipfile && python3 setup.py install
RUN npm install mongo-dynamic-indexer -g --unsafe-perm

COPY install.sh .
COPY quorum-node.sh .
COPY setup.sh .
COPY indexer.sh .
RUN chmod 755 quorum-node.sh
RUN chmod 755 setup.sh
RUN chmod 755 install.sh
RUN chmod 755 indexer.sh

RUN ./install.sh

RUN mkdir ./smart-contracts
ADD smart-contracts ./smart-contracts
RUN mkdir ./apis
ADD apis/package.json ./apis/package.json
RUN cd apis && npm install
ADD apis ./apis
RUN cd apis && npm install
RUN mkdir bcData
