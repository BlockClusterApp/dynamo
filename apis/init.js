let smartContracts = require("../smart-contracts/index.js");

var Web3 = require("web3");
var MongoClient = require("mongodb").MongoClient;
var fs = require('fs');
var lightwallet = require("eth-lightwallet");

let instanceId = process.env.instanceId;
let db = null;

function instanceIDGenerate() {
    var ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
    var ID_LENGTH = 8;

    var rtn = '';
    for (var i = 0; i < ID_LENGTH; i++) {
        rtn += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
    }
    return rtn;
}

async function upsertAccounts(query, set) {
    return new Promise((resolve, reject) => {
        db.collection("bcAccounts").updateOne(query, { $set: set }, {upsert: true, safe: false}, function(err, res) {
            if(err) {
                reject(err)
            } else {
                resolve()
            }
        });
    })
}

async function upsertNetwork(query, set) {
    return new Promise((resolve, reject) => {
        db.collection("networks").updateOne(query, { $set: set }, {upsert: true, safe: false}, function(err, res) {
            if(err) {
                reject(err)
            } else {
                resolve()
            }
        });
    })
}

MongoClient.connect("mongodb://mongo.default.svc.cluster.local:27017", {reconnectTries : Number.MAX_VALUE, autoReconnect : true}, function(err, database) {
    if(!err) {
        db = database.db("admin");

        //deploy contracts and create nodes
        let deployInitNode = function() {
            db.collection("networks").findOne({instanceId: instanceId}, function(err, node) {
                if (!err) {
                    let web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:8545"));

                    if(!node.genesisBlockHash) {
                        let firstAccPass = instanceIDGenerate();

                        web3.currentProvider.sendAsync({
                            method: "personal_newAccount",
                            params: [firstAccPass],
                            jsonrpc: "2.0",
                            id: new Date().getTime()
                        }, async (error, result) => {
                            try {
                                await upsertAccounts({
                                    instanceId: instanceId,
                                    address: result.result
                                }, {
                                    password: firstAccPass
                                })

                                web3.currentProvider.sendAsync({
                                    method: "personal_unlockAccount",
                                    params: [result.result, firstAccPass, 0],
                                    jsonrpc: "2.0",
                                    id: new Date().getTime()
                                }, (error) => {
                                    if(!error) {

                                        var genesis = fs.readFileSync('../node/genesis.json', 'utf8');
                                        var nodekey = fs.readFileSync('../node/geth/nodekey', 'utf8');
                                        var constellationPublicKey = fs.readFileSync('../cnode/node.pub', 'utf8');

                                        web3.currentProvider.sendAsync({
                                            method: "admin_nodeInfo",
                                            params: [],
                                            jsonrpc: "2.0",
                                            id: new Date().getTime()
                                        }, (error, result) => {
                                            if(!error) {
                                                var nodeId = result.result.id;
                                                web3.currentProvider.sendAsync({
                                                    method: "istanbul_getValidators",
                                                    params: [],
                                                    jsonrpc: "2.0",
                                                    id: new Date().getTime()
                                                }, function(error, result) {
                                                    if (error) {
                                                        console.log(error)
                                                        setTimeout(deployInitNode, 100)
                                                    } else {
                                                        let currentValidators = result.result;


                                                        if(process.env.assetsContractAddress && process.env.atomicSwapContractAddress && process.env.streamsContractAddress) {
                                                            web3.eth.getBlock(0, async (error, block) => {
                                                                if(error) {
                                                                    console.log(error)
                                                                    setTimeout(deployInitNode, 100)
                                                                } else {
                                                                    await upsertNetwork({
                                                                        instanceId: instanceId,
                                                                    }, {
                                                                        "assetsContractAddress": process.env.assetsContractAddress,
                                                                        "atomicSwapContractAddress": process.env.atomicSwapContractAddress,
                                                                        "streamsContractAddress": process.env.streamsContractAddress,
                                                                        "genesisBlockHash": block.hash,
                                                                        "genesisBlock": genesis,
                                                                        "nodeKey": nodekey,
                                                                        "nodeEthAddress": "0x" + lightwallet.keystore._computeAddressFromPrivKey(nodekey),
                                                                        "constellationPubKey": constellationPublicKey,
                                                                        "nodeId": nodeId,
                                                                        "currentValidators": currentValidators,
                                                                        "status": "running"
                                                                    })
                                                                }
                                                            })

                                                        } else {
                                                            var assetsContract = web3.eth.contract(smartContracts.assets.abi);

                                                            var assets = assetsContract.new({
                                                                from: web3.eth.accounts[0],
                                                                data: smartContracts.assets.bytecode,
                                                                gas: '999999999999999999'
                                                            }, function(error, contract) {
                                                                if (error) {
                                                                    console.log(error)
                                                                    setTimeout(deployInitNode, 100)
                                                                } else {
                                                                    if (typeof contract.address !== 'undefined') {
                                                                        var assetsContractAddress = contract.address;

                                                                        var assetsContractAddress = contract.address;
                                                                        var atomicSwapContract = web3.eth.contract(smartContracts.atomicSwap.abi);
                                                                        var atomicSwap = atomicSwapContract.new(assetsContractAddress, {
                                                                            from: web3.eth.accounts[0],
                                                                            data: smartContracts.atomicSwap.bytecode,
                                                                            gas: '999999999999999999'
                                                                        }, (error, contract) => {
                                                                            if (error) {
                                                                                console.log(error)
                                                                                setTimeout(deployInitNode, 100)
                                                                            } else {
                                                                                if (typeof contract.address !== 'undefined') {
                                                                                    var atomicSwapContractAddress = contract.address;
                                                                                    var streamsContract = web3.eth.contract(smartContracts.streams.abi);
                                                                                    var streams = streamsContract.new({
                                                                                        from: web3.eth.accounts[0],
                                                                                        data: smartContracts.streams.bytecode,
                                                                                        gas: '999999999999999999'
                                                                                    }, (error, contract) => {
                                                                                        if (error) {
                                                                                            console.log(error)
                                                                                            setTimeout(deployInitNode, 100)
                                                                                        } else {
                                                                                            if (typeof contract.address !== 'undefined') {
                                                                                                var streamsContractAddress = contract.address;

                                                                                                web3.eth.getBlock(0, async (error, block) => {
                                                                                                    if(error) {
                                                                                                        console.log(error)
                                                                                                        setTimeout(deployInitNode, 100)
                                                                                                    } else {
                                                                                                        await upsertNetwork({
                                                                                                            instanceId: instanceId,
                                                                                                        }, {
                                                                                                            "assetsContractAddress": assetsContractAddress,
                                                                                                            "atomicSwapContractAddress": atomicSwapContractAddress,
                                                                                                            "streamsContractAddress": streamsContractAddress,
                                                                                                            "genesisBlockHash": block.hash,
                                                                                                            "genesisBlock": genesis,
                                                                                                            "nodeKey": nodekey,
                                                                                                            "nodeEthAddress": "0x" + lightwallet.keystore._computeAddressFromPrivKey(nodekey),
                                                                                                            "constellationPubKey": constellationPublicKey,
                                                                                                            "nodeId": nodeId,
                                                                                                            "currentValidators": currentValidators,
                                                                                                            "status": "running"
                                                                                                        })
                                                                                                    }
                                                                                                })
                                                                                            }
                                                                                        }
                                                                                    })
                                                                                }
                                                                            }
                                                                        })
                                                                    }
                                                                }
                                                            })
                                                        }
                                                    }
                                                })
                                            } else {
                                                console.log(error)
                                                setTimeout(deployInitNode, 100)
                                            }
                                        })
                                    } else {
                                        console.log(error)
                                        setTimeout(deployInitNode, 100)
                                    }
                                })
                            } catch(e) {
                                console.log(e)
                                setTimeout(deployInitNode, 100)
                            }
                        })
                    }
                } else {
                    console.log(err)
                    setTimeout(deployInitNode, 100)
                }
            })
        }

        deployInitNode()
    }
})
