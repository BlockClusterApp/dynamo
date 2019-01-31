if [ $# -eq 0 ]
then
	pkill screen
	screen -d -m ./quorum-node.sh
  pm2 start ./apis/ecosystem.config.js
	sleep 10;
  screen -d -m bash -i -c "node ./apis/init.js 2>&1 | tee /dynamo/bcData/init.log"
	screen -d -m bash -i -c "./indexer.sh 2>&1 | tee /dynamo/bcData/indexer.log"
	while true;
	do
		REMOTEHOST=127.0.0.1
		REMOTEPORTETH=23000
		REMOTEPORTRPC=8545
		REMOTEPORTREADFILE=6382
    REMOTEPORTSCANNER=5742
		TIMEOUT=5

		if nc -zv $REMOTEHOST $REMOTEPORTETH; then
			sleep 5;
		else
			echo "Failed due to 23000";
	    exit
		fi

		if nc -zv $REMOTEHOST $REMOTEPORTRPC; then
			sleep 5;
		else
			echo "Failed due to 8545";
	    exit
		fi
	done
fi

if [ $# -eq 2 ]
then
	pkill screen
  screen -d -m ./quorum-node.sh $1 $2
  pm2 start ./apis/ecosystem.config.js
	sleep 10;
  screen -d -m bash -i -c 'node ./apis/init.js 2>&1 | tee /dynamo/bcData/init.log'
	screen -d -m bash -i -c "./indexer.sh 2>&1 | tee /dynamo/bcData/indexer.log"
	while true;
	do
		REMOTEHOST=127.0.0.1
		REMOTEPORTETH=23000
		REMOTEPORTRPC=8545
		REMOTEPORTREADFILE=6382
    REMOTEPORTSCANNER=5742
		TIMEOUT=5

		if nc -zv $REMOTEHOST $REMOTEPORTETH; then
			sleep 5;
		else
			echo "Failed due to 23000";
	    exit
		fi

		if nc -zv $REMOTEHOST $REMOTEPORTRPC; then
			sleep 5;
		else
			echo "Failed due to 8545";
	    exit
		fi
	done
fi

if [ $# -eq 3 ]
then
	pkill screen
  screen -d -m ./quorum-node.sh $1 $2 $3
  pm2 start ./apis/ecosystem.config.js
	sleep 10;
  screen -d -m bash -i -c "node ./apis/init.js 2>&1 | tee /dynamo/bcData/init.log"
	screen -d -m bash -i -c "./indexer.sh 2>&1 | tee /dynamo/bcData/indexer.log"
	while true;
	do
		REMOTEHOST=127.0.0.1
		REMOTEPORTETH=23000
		REMOTEPORTRPC=8545
		REMOTEPORTREADFILE=6382
    REMOTEPORTSCANNER=5742
		TIMEOUT=5

		if nc -zv $REMOTEHOST $REMOTEPORTETH; then
			sleep 5;
		else
			echo "Failed due to 23000";
      exit
		fi

		if nc -zv $REMOTEHOST $REMOTEPORTRPC; then
			sleep 5;
		else
			echo "Failed due to 8545";
	    exit
		fi
	done
fi
