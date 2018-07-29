if [ $# -eq 0 ]
then
if [ -d "node" ];
then
PRIVATE_CONFIG=./cnode/constellation.conf geth --datadir ./node --mine --port 23000 --rpc --rpccorsdomain "*" --rpcaddr 0.0.0.0 --rpcapi "admin,debug,eth,miner,net,personal,shh,txpool,web3,istanbul" --rpcport 8545  --ipcpath "geth.ipc" --gasprice 0 --targetgaslimit 999999999999999999
fi

if [ ! -d "node" ];
then
mkdir node
mkdir node/keystore
mkdir node/geth
cd node
istanbul setup --num 1 --nodes --verbose --save
mv ./0/nodekey ./
cd ..
cp ./node/nodekey ./node/geth/
mv ./node/genesis.json ./node/genesis-temp.json
#cat ./node/genesis-temp.json | jq --arg assetsContract_code "$assetsContract_code" --arg streamsContract_code "$streamsContract_code" --arg atomicSwapContract_code "$atomicSwapContract_code" '.gasLimit="0xde0b6b3a763ffff" | .alloc["0000000000000000000000000000000000000001"].balance="0x446c3b15f9926687d2c40534fdb564000000000000" | .alloc["0000000000000000000000000000000000000002"].balance="0x446c3b15f9926687d2c40534fdb564000000000000" | .alloc["0000000000000000000000000000000000000003"].balance="0x446c3b15f9926687d2c40534fdb564000000000000"  | .alloc["0000000000000000000000000000000000000001"].constructor=$assetsContract_code | .alloc["0000000000000000000000000000000000000002"].constructor=$streamsContract_code | .alloc["0000000000000000000000000000000000000003"].constructor=$atomicSwapContract_code' >> ./node/genesis.json
cat ./node/genesis-temp.json | jq '.gasLimit="0xde0b6b3a763ffff"' >> ./node/genesis.json
rm ./node/genesis-temp.json
geth --datadir ./node init ./node/genesis.json
rm ./node/nodekey
PRIVATE_CONFIG=./cnode/constellation.conf geth --datadir ./node --mine --port 23000 --rpc --rpccorsdomain "*" --rpcaddr 0.0.0.0 --rpcapi "admin,debug,eth,miner,net,personal,shh,txpool,web3,istanbul" --rpcport 8545  --ipcpath "geth.ipc" --gasprice 0 --targetgaslimit 999999999999999999
fi
fi





if [ $# -eq 2 ]
then
if [ -d "node" ];
then
PRIVATE_CONFIG=./cnode/constellation.conf geth --datadir ./node --port 23000 --rpc --rpccorsdomain "*" --rpcaddr 0.0.0.0 --rpcapi "admin,debug,eth,miner,net,personal,shh,txpool,web3,istanbul" --rpcport 8545  --ipcpath "geth.ipc" --gasprice 0 --targetgaslimit 999999999999999999
fi

if [ ! -d "node" ];
then
mkdir node
mkdir node/keystore
mkdir node/geth
cd node
istanbul setup --num 1 --nodes --verbose --save
mv ./0/nodekey ./
cd ..
cp ./node/nodekey ./node/geth/
cat <<EOF >./node/static-nodes.json
$1
EOF
rm -rf ./node/genesis.json
cat <<EOF >./node/genesis.json
$2
EOF
geth --datadir ./node init ./node/genesis.json
rm ./node/nodekey
PRIVATE_CONFIG=./cnode/constellation.conf geth --datadir ./node --port 23000 --rpc --rpccorsdomain "*" --rpcaddr 0.0.0.0 --rpcapi "admin,debug,eth,miner,net,personal,shh,txpool,web3,istanbul" --rpcport 8545  --ipcpath "geth.ipc" --gasprice 0 --targetgaslimit 999999999999999999
fi
fi





if [ $# -eq 3 ]
then
if [ -d "node" ];
then
PRIVATE_CONFIG=./cnode/constellation.conf geth --datadir ./node --mine --port 23000 --rpc --rpccorsdomain "*" --rpcaddr 0.0.0.0 --rpcapi "admin,debug,eth,miner,net,personal,shh,txpool,web3,istanbul" --rpcport 8545  --ipcpath "geth.ipc" --gasprice 0 --targetgaslimit 999999999999999999
fi

if [ ! -d "node" ];
then
mkdir node
mkdir node/keystore
mkdir node/geth
cd node
istanbul setup --num 1 --nodes --verbose --save
mv ./0/nodekey ./
cd ..
cp ./node/nodekey ./node/geth/
cat <<EOF >./node/static-nodes.json
$1
EOF
rm -rf ./node/genesis.json
cat <<EOF >./node/genesis.json
$2
EOF
geth --datadir ./node init ./node/genesis.json
rm ./node/nodekey
PRIVATE_CONFIG=./cnode/constellation.conf geth --datadir ./node --mine --port 23000 --rpc --rpccorsdomain "*" --rpcaddr 0.0.0.0 --rpcapi "admin,debug,eth,miner,net,personal,shh,txpool,web3,istanbul" --rpcport 8545  --ipcpath "geth.ipc" --gasprice 0 --targetgaslimit 999999999999999999
fi
fi
