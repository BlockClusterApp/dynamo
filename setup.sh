if [ $# -eq 0 ]
then
  	pkill screen
	screen -d -m ./constellation.sh
	sleep 5
	screen -L -d -m ./quorum-node.sh
	screen -L -d -m node ./apis/app.js
	sleep 10;
    screen -L -d -m node ./apis/init.js
	while true;
	do
		REMOTEHOST=127.0.0.1
		REMOTEPORTETH=23000
		REMOTEPORTRPC=8545
		REMOTEPORTCONSTELLATION=9001
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

		if nc -zv $REMOTEHOST $REMOTEPORTCONSTELLATION; then
			sleep 5;
		else
			echo "Failed due to 9001";
		    exit
		fi

        if nc -zv $REMOTEHOST $REMOTEPORTSCANNER; then
			sleep 5;
		else
			echo "Failed due to 5742";
		    exit
		fi

		if nc -zv $REMOTEHOST $REMOTEPORTREADFILE; then
			sleep 5;
		else
			echo "Failed due to 6382";
		    exit
		fi
	done
fi

if [ $# -eq 3 ]
then
  	pkill screen
	screen -d -m ./constellation.sh $1
	sleep 5
	screen -L -d -m ./quorum-node.sh $2 $3
	screen -L -d -m node ./apis/app.js
	sleep 10;
    screen -L -d -m node ./apis/init.js
	while true;
	do
		REMOTEHOST=127.0.0.1
		REMOTEPORTETH=23000
		REMOTEPORTRPC=8545
		REMOTEPORTCONSTELLATION=9001
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

		if nc -zv $REMOTEHOST $REMOTEPORTCONSTELLATION; then
			sleep 5;
		else
			echo "Failed due to 9001";
		    exit
		fi

        if nc -zv $REMOTEHOST $REMOTEPORTSCANNER; then
			sleep 5;
		else
			echo "Failed due to 5742";
		    exit
		fi

		if nc -zv $REMOTEHOST $REMOTEPORTREADFILE; then
			sleep 5;
		else
			echo "Failed due to 6382";
		    exit
		fi
	done
fi

if [ $# -eq 4 ]
then
  	pkill screen
	screen -d -m ./constellation.sh $1
	sleep 5
	screen -L -d -m ./quorum-node.sh $2 $3 $4
	screen -L -d -m node ./apis/app.js
	sleep 10;
    screen -L -d -m node ./apis/init.js
	while true;
	do
		REMOTEHOST=127.0.0.1
		REMOTEPORTETH=23000
		REMOTEPORTRPC=8545
		REMOTEPORTCONSTELLATION=9001
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

		if nc -zv $REMOTEHOST $REMOTEPORTCONSTELLATION; then
			sleep 5;
		else
			echo "Failed due to 9001";
		    exit
		fi

        if nc -zv $REMOTEHOST $REMOTEPORTSCANNER; then
			sleep 5;
		else
			echo "Failed due to 5742";
		    exit
		fi

		if nc -zv $REMOTEHOST $REMOTEPORTREADFILE; then
			sleep 5;
		else
			echo "Failed due to 6382";
		    exit
		fi
	done
fi
