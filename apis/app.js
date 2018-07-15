let smartContracts = require("../smart-contracts/index.js");
let scanner = require("./scanner.js");
const express = require('express')
const app = express()
var MongoClient = require("mongodb").MongoClient;
var fs = require('fs');
var getSize = require('get-folder-size');
var keythereum = require("keythereum");
var url = require('url');
var BigNumber = require('bignumber.js');
var jwt = require('jsonwebtoken');
var Web3 = require("web3");
var bodyParser = require('body-parser')

let instanceId = process.env.instanceId;
let db = null;
let network = null;

function generateSecret() {
    var ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    var ID_LENGTH = 8;

    var rtn = '';
    for (var i = 0; i < ID_LENGTH; i++) {
        rtn += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
    }
    return rtn;
}

function addZeros(s, n) {
    s = s.toString();
    for(let count = 0; count < n; count++) {
        s = s + "0";
    }

    return s;
}

MongoClient.connect("mongodb://mongo.default.svc.cluster.local:27017", {reconnectTries : Number.MAX_VALUE, autoReconnect : true}, function(err, database) {
    if(!err) {
        db = database.db("admin");

        let fetchNode = function() {
            db.collection("networks").findOne({instanceId: instanceId}, function(err, node) {
                if(!err) {
                    if(node.assetsContractAddress && node.atomicSwapContractAddress && node.streamsContractAddress) {
                        network = node;
                    } else {
                        setTimeout(fetchNode, 1000)
                    }
                } else {
                    console.log(err)
                }
            })
        }

        fetchNode();
    }
})

app.use(bodyParser.json())

app.post(`/api/node/${instanceId}/assets/issueSoloAsset`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);
    assets.issueSoloAsset.sendTransaction(req.body.assetName, req.body.toAccount, req.body.identifier, {
        from: req.body.fromAccount,
        gas: '4712388'
    }, function(error, txnHash){
        if(error) {
            res.send(JSON.stringify({"error": error.toString()}))
        } else {
            for(let key in req.body.data) {
                assets.addOrUpdateSoloAssetExtraData.sendTransaction(req.body.assetName, req.body.identifier, key, req.body.data[key], {
                    from: req.body.fromAccount,
                    gas: '4712388'
                })
            }

            res.send(JSON.stringify({"txnHash": txnHash}))
        }
    })
})


app.post(`/api/node/${instanceId}/assets/issueBulkAsset`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);
    var parts = assets.getBulkAssetParts.call(req.body.assetName)
    let units = (new BigNumber(req.body.units)).multipliedBy(addZeros(1, parts))
    assets.issueBulkAsset.sendTransaction(req.body.assetName, units, req.body.toAccount, {
        from: req.body.fromAccount,
        gas: '4712388'
    }, function(error, txnHash){
        if(error) {
            res.send(JSON.stringify({"error": error.toString()}))
        } else {
            res.send(JSON.stringify({"txnHash": txnHash}))
        }
    })
})

app.post(`/api/node/${instanceId}/assets/transferSoloAsset`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);
    assets.transferOwnershipOfSoloAsset.sendTransaction(req.body.assetName, req.body.identifier, req.body.toAccount, {
        from: req.body.fromAccount,
        gas: '4712388'
    }, function(error, txnHash){
        if(error) {
            res.send(JSON.stringify({"error": error.toString()}))
        } else {
            res.send(JSON.stringify({"txnHash": txnHash}))
        }
    })
})

app.post(`/api/node/${instanceId}/assets/transferBulkAsset`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);
    var parts = assets.getBulkAssetParts.call(req.body.assetName)
    let units = (new BigNumber(req.body.units)).multipliedBy(addZeros(1, parts))
    assets.transferBulkAssetUnits.sendTransaction(req.body.assetName, req.body.toAccount, units, {
        from: req.body.fromAccount,
        gas: '4712388'
    }, function(error, txnHash){
        if(error) {
            res.send(JSON.stringify({"error": error.toString()}))
        } else {
            res.send(JSON.stringify({"txnHash": txnHash}))
        }
    })
})

app.post(`/api/node/${instanceId}/assets/getSoloAssetInfo`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);

    assets.isSoloAssetClosed.call(req.body.assetName, req.body.identifier, {from: web3.eth.accounts[0]}, function(error, isClosed){
        if(!error) {
            assets.getSoloAssetOwner.call(req.body.assetName, req.body.identifier, {from: web3.eth.accounts[0]}, function(error, owner){
                if(!error) {

                    let extraData = {};

                    for(let count = 0; count < req.body.extraData.length; count++){
                        extraData[req.body.extraData[count]] = assets.getSoloAssetExtraData.call(req.body.assetName, req.body.identifier, req.body.extraData[count])
                    }

                    res.send(JSON.stringify({"details": {
                        isClosed: isClosed,
                        owner: owner,
                        extraData: extraData
                    }}))
                } else {
                    res.send(JSON.stringify({"error": error.toString()}))
                }
            })
        } else {
            res.send(JSON.stringify({"error": error.toString()}))
        }
    })
})

app.post(`/api/node/${instanceId}/assets/getBulkAssetBalance`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);
    var parts = assets.getBulkAssetParts.call(assetName)
    assets.getBulkAssetUnits.call(req.body.assetName, req.body.account, {from: web3.eth.accounts[0]}, function(error, units){
        if(error) {
            res.send(JSON.stringify({"error": error.toString()}))
        } else {
            units = (new BigNumber(units)).dividedBy(addZeros(1, parts)).toFixed(parseInt(parts))
            res.send(JSON.stringify({"units": units.toString()}))
        }
    })
})

app.post(`/api/node/${instanceId}/assets/updateAssetInfo`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);

    assets.addOrUpdateSoloAssetExtraData.sendTransaction(req.body.assetName, req.body.identifier, req.body.key, req.body.value, {
        from: req.body.fromAccount,
        gas: '4712388'
    }, function(error, txnHash){
        if(error) {
            res.send(JSON.stringify({"error": error.toString()}))
        } else {
            res.send(JSON.stringify({"txnHash": txnHash}))
        }
    })
})

app.post(`/api/node/${instanceId}/assets/closeAsset`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);

    assets.closeSoloAsset.sendTransaction(req.body.assetName, req.body.identifier, {
        from: req.body.fromAccount,
        gas: '4712388'
    }, function(error, txnHash){
        if(error) {
            res.send(JSON.stringify({"error": error.toString()}))
        } else {
            res.send(JSON.stringify({"txnHash": txnHash}))
        }
    })
})

app.post(`/api/node/${instanceId}/assets/placeOrder`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    var atomicSwapContract = web3.eth.contract(smartContracts.atomicSwap.abi);
    var atomicSwap = atomicSwapContract.at(network.atomicSwapContractAddress);
    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);
    var secret = generateSecret();

    db.collection("networks").findOne({instanceId: req.body.toNetworkId}, function(err, node) {
        if(!err && node) {
            var toGenesisBlockHash = node.genesisBlockHash;
            atomicSwap.calculateHash.call(secret, (error, hash) => {
                if (!error) {
                    db.collection("secrets").insertOne({
                        "instanceId": req.body.toNetworkId,
                        "secret": secret,
                        "hash": hash,
                    }, (err) => {
                        if(!err) {
                            assets.approve.sendTransaction(
                                req.body.fromAssetType,
                                req.body.fromAssetName,
                                req.body.fromAssetUniqueIdentifier,
                                req.body.fromAssetUnits,
                                network.atomicSwapContractAddress, {
                                    from: req.body.fromAddress,
                                    gas: '99999999999999999'
                                }, (error) => {
                                    if (!error) {
                                        atomicSwap.lock.sendTransaction(
                                            req.body.toAddress,
                                            hash,
                                            req.body.fromAssetLockMinutes,
                                            req.body.fromAssetType,
                                            req.body.fromAssetName,
                                            req.body.fromAssetUniqueIdentifier,
                                            req.body.fromAssetUnits,
                                            req.body.toAssetType,
                                            req.body.toAssetName,
                                            req.body.toAssetUnits,
                                            req.body.toAssetUniqueIdentifier,
                                            toGenesisBlockHash, {
                                                from: req.body.fromAddress,
                                                gas: '99999999999999999'
                                            }, (error, txnHash) => {

                                            if (!error) {
                                                res.send(JSON.stringify({"txnHash": txnHash, "orderId": hash}))
                                            } else {
                                                res.send(JSON.stringify({"error": error.toString()}))
                                            }
                                        })
                                    } else {
                                        res.send(JSON.stringify({"error": error.toString()}))
                                    }
                            })
                        } else {
                            res.send(JSON.stringify({"error": "Unknown Error Occured"}))
                        }
                    });
                } else {
                    res.send(JSON.stringify({"error": error.toString()}))
                }
            })
        } else {
            console.log(err);
            res.send(JSON.stringify({"error": "Unknown Error Occured"}))
        }
    })
})

app.post(`/api/node/${instanceId}/assets/fulfillOrder`, (req, res) => {
    let order = Orders.find({instanceId: instanceId, atomicSwapHash: req.body.orderId}).fetch()[0];
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
    var atomicSwapContract = web3.eth.contract(smartContracts.atomicSwap.abi);
    var atomicSwap = atomicSwapContract.at(toNetwork.atomicSwapContractAddress);
    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(toNetwork.assetsContractAddress);

    db.collection("networks").findOne({instanceId: req.body.toNetworkId, user: network.user}, function(err, node) {
        if(!err && node) {
            let toNetwork = node;

            if(toNetwork.genesisBlockHash === order.toGenesisBlockHash) {
                assets.approve.sendTransaction(
                    order.toAssetType,
                    order.toAssetName,
                    order.toAssetId,
                    order.toAssetUnits,
                    network.atomicSwapContractAddress, {
                        from: order.toAddress,
                        gas: '99999999999999999'
                    }, (error) => {
                        if (!error) {
                            atomicSwap.claim.sendTransaction(
                                req.body.orderId,
                                "", {
                                    from: order.toAddress,
                                    gas: '99999999999999999'
                                }, Meteor.bindEnvironment(function(error, txHash) {
                                    if (error) {
                                        res.send(JSON.stringify({"error": error.toString()}))
                                    } else {
                                        res.send(JSON.stringify({"txnHash": txHash}))
                                    }
                                }))
                        } else {
                            res.send(JSON.stringify({"error": error.toString()}))
                        }
                    }
                )
            } else {
                db.collection("acceptedOrders").insertOne({
                    "instanceId": instanceId,
                    "buyerInstanceId": req.body.toNetworkId,
                    "hash": req.body.orderId
                }, (err) => {
                    if(!err) {
                        assets.approve.sendTransaction(
                            order.toAssetType,
                            order.toAssetName,
                            order.toAssetId,
                            order.toAssetUnits,
                            toNetwork.atomicSwapContractAddress, {
                                from: order.toAddress,
                                gas: '99999999999999999'
                            }, (error) => {
                                if (!error) {

                                    let expiryTimestamp = order.fromLockPeriod;
                                    let currentTimestamp = new Date().getTime() / 1000;
                                    let newMin = null;

                                    if(expiryTimestamp - currentTimestamp <= 0) {
                                        res.send(JSON.stringify({"error": "Order has expired"}))
                                        return;
                                    } else {
                                        let temp = currentTimestamp + ((expiryTimestamp - currentTimestamp) / 2)
                                        temp = (temp - currentTimestamp) / 60;
                                        newMin = temp;
                                    }

                                    atomicSwap.lock.sendTransaction(
                                        order.fromAddress,
                                        req.body.orderId,
                                        newMin,
                                        order.toAssetType,
                                        order.toAssetName,
                                        order.toAssetId,
                                        order.toAssetUnits,
                                        order.fromAssetType,
                                        order.fromAssetName,
                                        order.fromAssetUnits,
                                        order.fromAssetId,
                                        network.genesisBlockHash, {
                                            from: order.toAddress,
                                            gas: '99999999999999999'
                                        },
                                        (error, txnHash) => {
                                            if (!error) {
                                                res.send(JSON.stringify({"txnHash": txnHash}))
                                            } else {
                                                res.send(JSON.stringify({"error": error.toString()}))
                                            }
                                        })
                                } else {
                                    res.send(JSON.stringify({"error": error.toString()}))
                                }
                            }
                        )
                    } else {
                        res.send(JSON.stringify({"error": error.toString()}))
                    }
                })
            }
        } else {
            console.log(err);
            res.send(JSON.stringify({"error": "Unknown Error Occured"}))
        }
    })
})

app.post(`/api/node/${instanceId}/assets/cancelOrder`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    var atomicSwapContract = web3.eth.contract(smartContracts.atomicSwap.abi);
    var atomicSwap = atomicSwapContract.at(network.atomicSwapContractAddress);
    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);

    let order = Orders.find({instanceId: instanceId, atomicSwapHash: req.body.orderId}).fetch()[0];

    atomicSwap.unlock.sendTransaction(
        req.body.orderId, {
            from: order.fromAddress,
            gas: '99999999999999999'
        },
        function(error, txHash) {
            if (error) {
                res.send(JSON.stringify({"error": error.toString()}))
            } else {
                res.send(JSON.stringify({"txnHash": txHash}))
            }
        }
    )
})

app.post(`/api/node/${instanceId}/assets/getOrderInfo`, (req, res) => {
    let order = Orders.find({instanceId: instanceId, atomicSwapHash: req.body.orderId}).fetch();

    if(order[0]) {
        res.send(JSON.stringify(order[0]))
    } else {
        res.send(JSON.stringify({"error": "Order not found"}))
    }
})

app.post(`/api/node/${instanceId}/assets/search`, (req, res) => {
    var query = req.body;
    query.instanceId = instanceId;

    db.collection("soloAssets").find(query, function(err, result) {
        if(err) {
            res.send(JSON.stringify({"error": "Search Error Occured"}))
        } else {
            res.send(JSON.stringify(result))
        }
    });
})

app.post(`/api/node/${instanceId}/streams/search`, (req, res) => {
    var query = req.body;
    query.instanceId = instanceId;

    db.collection("streamsItems").find(query, function(err, result) {
        if(err) {
            res.send(JSON.stringify({"error": "Search Error Occured"}))
        } else {
            res.send(JSON.stringify(result))
        }
    });
})

app.post(`/api/node/${instanceId}/streams/publish`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
    var streamsContract = web3.eth.contract(smartContracts.streams.abi);
    var streams = streamsContract.at(network.streamsContractAddress);

    streams.publish.sendTransaction(req.body.streamName, req.body.key, req.body.data, {
        from: req.body.fromAccount
    }, function(error, txnHash) {
        if (!error) {
            res.send(JSON.stringify({"txnHash": txnHash}))
        } else {
            res.send(JSON.stringify({"error": error.toString()}))
        }
    })
})

async function getDirSize(myFolder) {
    return new Promise((resolve, reject) => {
        getSize(myFolder, function(err, size) {
            if(err) {
                resolve(0)
            } else {
                resolve(size)
            }
        });
    })
}

app.get(`/api/node/${instanceId}/utility/nodeInfo`, (req, res) => {
    var genesis = fs.readFileSync('../node/genesis.json', 'utf8');
    var nodekey = fs.readFileSync('../node/geth/nodekey', 'utf8');
    var constellationPublicKey = fs.readFileSync('../cnode/node.pub', 'utf8');
    res.send(JSON.stringify({
        "genesis": genesis,
        "nodekey": nodekey,
        "constellationPublicKey": constellationPublicKey,
    }))
})

app.get(`/api/node/${instanceId}/utility/size`, async (req, res) => {
    var gethSize = await getDirSize("../node");
    var constellationSize = await getDirSize("../cnode");
    res.send(JSON.stringify({
        "gethSize": gethSize,
        "constellationSize": constellationSize
    }))
})

app.get(`/api/node/${instanceId}/utility/getPrivateKey`, (req, res) => {
    var datadir = "../node";
    var url_parts = url.parse(req.url, true);
    var address= req.query.address;
    const password = req.query.password;

    var keyObject = keythereum.importFromFile(address, datadir);
    var privateKey = keythereum.recover(password, keyObject);

    res.send(JSON.stringify({
        "keyFile": keyObject,
        "privateKeyString": privateKey.toString("hex"),
        "password": password
    }))
})


app.listen(6382)
