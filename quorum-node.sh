if [ $# -eq 0 ]
then
if [ -d "bcData/node" ];
then
PRIVATE_CONFIG=./bcData/cnode/constellation.conf geth --datadir ./bcData/node --mine --port 23000 --rpc --rpccorsdomain "*" --rpcaddr 0.0.0.0 --rpcapi "admin,debug,eth,miner,net,personal,shh,txpool,web3,istanbul" --rpcport 8545  --ipcpath "geth.ipc" --gasprice 0 --targetgaslimit 999999999999999999 --permissioned --verbosity 2 &>>  /dynamo/bcData/geth.log
fi

if [ ! -d "bcData/node" ];
then
mkdir bcData/node
mkdir bcData/node/keystore
mkdir bcData/node/geth
cd bcData/node
istanbul setup --num 1 --nodes --verbose --save
mv ./0/nodekey ./
cd ../..
cp ./bcData/node/nodekey ./bcData/node/geth/
mv ./bcData/node/genesis.json ./bcData/node/genesis-temp.json
#cat ./node/genesis-temp.json | jq --arg assetsContract_code "$assetsContract_code" --arg streamsContract_code "$streamsContract_code" --arg atomicSwapContract_code "$atomicSwapContract_code" '.gasLimit="0xde0b6b3a763ffff" | .alloc["0000000000000000000000000000000000000001"].balance="0x446c3b15f9926687d2c40534fdb564000000000000" | .alloc["0000000000000000000000000000000000000002"].balance="0x446c3b15f9926687d2c40534fdb564000000000000" | .alloc["0000000000000000000000000000000000000003"].balance="0x446c3b15f9926687d2c40534fdb564000000000000"  | .alloc["0000000000000000000000000000000000000001"].constructor=$assetsContract_code | .alloc["0000000000000000000000000000000000000002"].constructor=$streamsContract_code | .alloc["0000000000000000000000000000000000000003"].constructor=$atomicSwapContract_code' >> ./node/genesis.json
cat ./bcData/node/genesis-temp.json | jq '.gasLimit="0xde0b6b3a763ffff"' >> ./bcData/node/genesis.json
rm ./bcData/node/genesis-temp.json
geth --datadir ./bcData/node init ./bcData/node/genesis.json
rm ./bcData/node/nodekey
echo '[]' >./bcData/node/permissioned-nodes.json
PRIVATE_CONFIG=./bcData/cnode/constellation.conf geth --datadir ./bcData/node --mine --port 23000 --rpc --rpccorsdomain "*" --rpcaddr 0.0.0.0 --rpcapi "admin,debug,eth,miner,net,personal,shh,txpool,web3,istanbul" --rpcport 8545  --ipcpath "geth.ipc" --gasprice 0 --targetgaslimit 999999999999999999 --permissioned --verbosity 2 &>>  /dynamo/bcData/geth.log
fi
fi





if [ $# -eq 2 ]
then
if [ -d "bcData/node" ];
then
PRIVATE_CONFIG=./bcData/cnode/constellation.conf geth --datadir ./bcData/node --port 23000 --rpc --rpccorsdomain "*" --rpcaddr 0.0.0.0 --rpcapi "admin,debug,eth,miner,net,personal,shh,txpool,web3,istanbul" --rpcport 8545  --ipcpath "geth.ipc" --gasprice 0 --targetgaslimit 999999999999999999 --permissioned --verbosity 2 &>>  /dynamo/bcData/geth.log
fi

if [ ! -d "bcData/node" ];
then
mkdir bcData/node
mkdir bcData/node/keystore
mkdir bcData/node/geth
cd bcData/node
istanbul setup --num 1 --nodes --verbose --save
mv ./0/nodekey ./
cd ../..
cp ./bcData/node/nodekey ./bcData/node/geth/
cat <<EOF >./bcData/node/static-nodes.json
$1
EOF
cat <<EOF >./bcData/node/permissioned-nodes.json
$1
EOF
rm -rf ./bcData/node/genesis.json
cat <<EOF >./bcData/node/genesis.json
$2
EOF
geth --datadir ./bcData/node init ./bcData/node/genesis.json
rm ./bcData/node/nodekey
PRIVATE_CONFIG=./bcData/cnode/constellation.conf geth --datadir ./bcData/node --port 23000 --rpc --rpccorsdomain "*" --rpcaddr 0.0.0.0 --rpcapi "admin,debug,eth,miner,net,personal,shh,txpool,web3,istanbul" --rpcport 8545  --ipcpath "geth.ipc" --gasprice 0 --targetgaslimit 999999999999999999 --permissioned --verbosity 2 &>>  /dynamo/bcData/geth.log
fi
fi





if [ $# -eq 3 ]
then
if [ -d "bcData/node" ];
then
PRIVATE_CONFIG=./bcData/cnode/constellation.conf geth --datadir ./bcData/node --mine --port 23000 --rpc --rpccorsdomain "*" --rpcaddr 0.0.0.0 --rpcapi "admin,debug,eth,miner,net,personal,shh,txpool,web3,istanbul" --rpcport 8545  --ipcpath "geth.ipc" --gasprice 0 --targetgaslimit 999999999999999999 --permissioned --verbosity 2 &>>  /dynamo/bcData/geth.log
fi

if [ ! -d "bcData/node" ];
then
mkdir bcData/node
mkdir bcData/node/keystore
mkdir bcData/node/geth
cd bcData/node
istanbul setup --num 1 --nodes --verbose --save
mv ./0/nodekey ./
cd ../..
cp ./bcData/node/nodekey ./bcData/node/geth/
cat <<EOF >./bcData/node/static-nodes.json
$1
EOF
cat <<EOF >./bcData/node/permissioned-nodes.json
$1
EOF
rm -rf ./bcData/node/genesis.json
cat <<EOF >./bcData/node/genesis.json
$2
EOF
geth --datadir ./bcData/node init ./bcData/node/genesis.json
rm ./bcData/node/nodekey
PRIVATE_CONFIG=./bcData/cnode/constellation.conf geth --datadir ./bcData/node --mine --port 23000 --rpc --rpccorsdomain "*" --rpcaddr 0.0.0.0 --rpcapi "admin,debug,eth,miner,net,personal,shh,txpool,web3,istanbul" --rpcport 8545  --ipcpath "geth.ipc" --gasprice 0 --targetgaslimit 999999999999999999 --permissioned --verbosity 2 &>>  /dynamo/bcData/geth.log
fi
fi
