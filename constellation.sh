if [ $# -eq 0 ]
then
if [ -d "bcData/cnode" ];
then
constellation-node --verbosity 0 bcData/cnode/constellation.conf
fi

if [ ! -d "bcData/cnode" ];
then
mkdir bcData/cnode
printf '\n' | constellation-node --generatekeys=node
mv node.key ./bcData/cnode
mv node.pub ./bcData/cnode/
cat <<EOF >./bcData/cnode/constellation.conf
url = "http://127.0.0.1:9001/"
port = 9001
storage = "dir:./bcData/cnode/"
socket = "./bcData/cnode/constellation_node.ipc"
othernodes = []
publickeys = ["./bcData/cnode/node.pub"]
privatekeys = ["./bcData/cnode/node.key"]
tls = "off"
EOF
sleep 5
constellation-node --verbosity 0 bcData/cnode/constellation.conf
fi
fi

if [ $# -eq 1 ]
then
if [ -d "bcData/cnode" ];
then
constellation-node --verbosity 0 bcData/cnode/constellation.conf
fi

if [ ! -d "bcData/cnode" ];
then
mkdir bcData/cnode
printf '\n' | constellation-node --generatekeys=node
mv node.key ./bcData/cnode
mv node.pub ./bcData/cnode/
cat <<EOF >./bcData/cnode/constellation.conf
url = "http://127.0.0.1:9001/"
port = 9001
storage = "dir:./bcData/cnode/"
socket = "./bcData/cnode/constellation_node.ipc"
othernodes = $1
publickeys = ["./bcData/cnode/node.pub"]
privatekeys = ["./bcData/cnode/node.key"]
tls = "off"
EOF
sleep 5
constellation-node --verbosity 0 bcData/cnode/constellation.conf
fi
fi
