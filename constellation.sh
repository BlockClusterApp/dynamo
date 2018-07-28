if [ $# -eq 0 ]
then
if [ -d "cnode" ];
then
constellation-node cnode/constellation.conf
fi

if [ ! -d "cnode" ];
then
mkdir cnode
printf '\n' | constellation-node --generatekeys=node
mv node.key ./cnode
mv node.pub ./cnode/
cat <<EOF >./cnode/constellation.conf
url = "http://127.0.0.1:9001/"
port = 9001
storage = "dir:./cnode/"
socket = "./cnode/constellation_node.ipc"
othernodes = []
publickeys = ["./cnode/node.pub"]
privatekeys = ["./cnode/node.key"]
tls = "off"
EOF
sleep 5
constellation-node cnode/constellation.conf
fi
fi

if [ $# -eq 1 ]
then
if [ -d "cnode" ];
then
constellation-node cnode/constellation.conf
fi

if [ ! -d "cnode" ];
then
mkdir cnode
printf '\n' | constellation-node --generatekeys=node
mv node.key ./cnode
mv node.pub ./cnode/
cat <<EOF >./cnode/constellation.conf
url = "http://127.0.0.1:9001/"
port = 9001
storage = "dir:./cnode/"
socket = "./cnode/constellation_node.ipc"
othernodes = $1
publickeys = ["./cnode/node.pub"]
privatekeys = ["./cnode/node.key"]
tls = "off"
EOF
sleep 5
constellation-node cnode/constellation.conf
fi
fi
