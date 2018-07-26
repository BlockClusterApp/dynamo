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
const Config = require('./config');
var Wallet = require("ethereumjs-wallet");
let EthCrypto = require("eth-crypto");
let elliptic = require('elliptic');
let sha3 = require('js-sha3');
let ec = new elliptic.ec('secp256k1')
let exec = require("child_process").exec;
var base64 = require('base-64');
var request = require("request")
var btoa = require('btoa');
var atob = require('atob');

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

// Hex to Base64
function hexToBase64(str) {
    return btoa(String.fromCharCode.apply(null,
      str.replace(/\r|\n/g, "").replace(/([\da-fA-F]{2}) ?/g, "0x$1 ").replace(/ +$/, "").split(" "))
    );
}

// Base64 to Hex
function base64ToHex(str) {
    for (var i = 0, bin = atob(str.replace(/[ \r\n]+$/, "")), hex = []; i < bin.length; ++i) {
        let tmp = bin.charCodeAt(i).toString(16);
        if (tmp.length === 1) tmp = "0" + tmp;
        hex[hex.length] = tmp;
    }
    return hex.join("");
}

MongoClient.connect(Config.getMongoConnectionString(), {reconnectTries : Number.MAX_VALUE, autoReconnect : true}, function(err, database) {
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

app.post(`/api/node/${instanceId}/assets/createAssetType`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);

    if (req.body.assetType === "solo") {
        assets.createSoloAssetType.sendTransaction(req.body.assetName, {
            from: req.body.assetIssuer,
            gas: '99999999999999999'
        }, function(error, txnHash) {
            if (!error) {
                res.send({"txnHash": txnHash})
            } else {
                res.send({"error": err.toString()})
            }
        })
    } else {
        if(req.body.parts > 18) {
            res.send({"error": "Invalid parts"})
        } else {
            assets.createBulkAssetType.sendTransaction(req.body.assetName, (req.body.reissuable === "true"), req.body.parts, {
                from: req.body.assetIssuer,
                gas: '99999999999999999'
            }, function(error, txnHash) {
                if (!error) {
                    res.send({"txnHash": txnHash})
                } else {
                    res.send({"error": err.toString()})
                }
            })
        }

    }
})

app.post(`/api/node/${instanceId}/assets/issueSoloAsset`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);

    /*
        1. Create Encryption Keys
        2. Store the key pair in DB
        2. Store Public Key on Blockchain
    */

    let wallet = Wallet.generate();
    let private_key_hex = wallet.getPrivateKey().toString("hex");
    let private_key_base64 = wallet.getPrivateKey().toString("base64");
    let compressed_public_key_hex = EthCrypto.publicKey.compress(wallet.getPublicKey().toString("hex"))
    let compressed_public_key_base64 = Buffer.from(EthCrypto.publicKey.compress(wallet.getPublicKey().toString("hex")), 'hex').toString("base64")

    db.collection("encryptionKeys").insertOne({
        private_key_hex: private_key_hex,
        compressed_public_key_hex: compressed_public_key_hex,
        instanceId: instanceId
    }, function(err) {
        if(!err) {
            assets.issueSoloAsset.sendTransaction(req.body.assetName, req.body.toAccount, req.body.identifier, compressed_public_key_hex, {
                from: req.body.fromAccount,
                gas: '4712388'
            }, function(error, txnHash){
                if(error) {
                    res.send({"error": error.toString()})
                } else {
                    for(let key in req.body.data) {
                        assets.addOrUpdateSoloAssetExtraData.sendTransaction(req.body.assetName, req.body.identifier, key, req.body.data[key], {
                            from: req.body.fromAccount,
                            gas: '4712388'
                        })
                    }

                    res.send({"txnHash": txnHash})
                }
            })
        } else {
            res.send({"error": err.toString()})
        }
    });
})


app.post(`/api/node/${instanceId}/assets/issueBulkAsset`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);
    var parts = assets.getBulkAssetParts.call(req.body.assetName)
    let units = (new BigNumber(req.body.units)).multipliedBy(addZeros(1, parts))
    assets.issueBulkAsset.sendTransaction(req.body.assetName, units.toString(), req.body.toAccount, {
        from: req.body.fromAccount,
        gas: '4712388'
    }, function(error, txnHash){
        if(error) {
            res.send({"error": error.toString()})
        } else {
            res.send({"txnHash": txnHash})
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
            res.send({"error": error.toString()})
        } else {
            res.send({"txnHash": txnHash})
        }
    })
})

app.post(`/api/node/${instanceId}/assets/transferBulkAsset`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);
    var parts = assets.getBulkAssetParts.call(req.body.assetName)
    let units = (new BigNumber(req.body.units)).multipliedBy(addZeros(1, parts))
    assets.transferBulkAssetUnits.sendTransaction(req.body.assetName, req.body.toAccount, units.toString(), {
        from: req.body.fromAccount,
        gas: '4712388'
    }, function(error, txnHash){
        if(error) {
            res.send({"error": error.toString()})
        } else {
            res.send({"txnHash": txnHash})
        }
    })
})

function parseAndConvertData(data) {
    try {
        var temp = JSON.parse(data)
        return temp;
    } catch(e) {}

    try {
        var temp = new BigNumber(data)

        if(temp.isNaN() === true) {
            return data;
        } else {
            return temp.toNumber()
        }
    } catch(e) {}
}

app.post(`/api/node/${instanceId}/assets/getSoloAssetInfo`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    try {
        var query = {};
        query.instanceId = instanceId;
        query.assetName = req.body.assetName;
        query.uniqueIdentifier = parseAndConvertData(req.body.identifier);

        db.collection("soloAssets").findOne(query, function(err, result) {
            if(err) {
                res.send({"error": err.toString()})
            } else if(result) {
                res.send(result)
            } else {
                res.send({"error": result.toString()})
            }
        });
    } catch(e) {
        res.send({"error": e.toString()})
    }
})

app.post(`/api/node/${instanceId}/assets/getBulkAssetBalance`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);
    var parts = assets.getBulkAssetParts.call(req.body.assetName)
    assets.getBulkAssetUnits.call(req.body.assetName, req.body.account, {from: web3.eth.accounts[0]}, function(error, units){
        if(error) {
            res.send({"error": error.toString()})
        } else {
            units = (new BigNumber(units)).dividedBy(addZeros(1, parts)).toFixed(parseInt(parts))
            res.send({"units": units.toString()})
        }
    })
})

app.post(`/api/node/${instanceId}/assets/updateAssetInfo`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);

    /*
        1. If private
        2. Write to Impulse
        3. Then write hash to BlockChain
    */

    if(req.body.visibility === "private") {
        let timestamp = Date.now();
        let object = base64.encode(JSON.stringify({
            key: req.body.key,
            value: req.body.value,
            timestamp: timestamp
        }))

        let publicKey = assets.getEncryptionPublicKey.call(req.body.assetName, req.body.identifier, {
            from: web3.eth.accounts[0]
        });

        db.collection("encryptionKeys").findOne({compressed_public_key_hex: publicKey}, function(err, keyPair) {
            if(!err && keyPair) {
                let compressed_public_key_base64 = Buffer.from(publicKey, 'hex').toString("base64")

                exec(`python3 /dynamo/apis/crypto-operations/encrypt.py ${compressed_public_key_base64} '${object}'`, (error, stdout, stderr) => {
                    if(!error) {
                        stdout = stdout.split(" ")
                        let ciphertext = stdout[0].substr(2).slice(0, -1)
                        let capsule = stdout[1].substr(2).slice(0, -2)

                        let ciphertext_hash = sha3.keccak256(ciphertext);
                        let signature = ec.sign(ciphertext_hash, keyPair.private_key_hex, "hex", {canonical: true});

                        request({
                            url: `${Config.getImpulseURL()}/writeObject`,
                            method: "POST",
                            json: {
                                publicKey: publicKey,
                                encryptedData: ciphertext,
                                signature: signature,
                                metadata: {
                                    assetName: req.body.assetName,
                                    assetType: "solo",
                                    identifier: req.body.identifier
                                },
                                capsule: capsule
                            }
                        }, (error, result, body) => {
                            if(!error) {
                                if(body.error) {
                                    res.send({"error": body.error.toString()})
                                } else {
                                    assets.addOrUpdateEncryptedDataObjectHash.sendTransaction(req.body.assetName, req.body.identifier, ciphertext_hash, {
                                        from: req.body.fromAccount,
                                        gas: '4712388'
                                    }, function(error, txnHash){
                                        if(error) {
                                            res.send({"error": error.toString()})
                                        } else {
                                            res.send({"txnHash": txnHash})
                                        }
                                    })
                                }
                            } else {
                                res.send({"error": error.toString()})
                            }
                        })

                    } else {
                        res.send({"error": error.toString()})
                    }
                })
            } else {
                res.send({"error": "You are not the owner of the private key required for signing meta data"})
            }
        })
    } else {
        assets.addOrUpdateSoloAssetExtraData.sendTransaction(req.body.assetName, req.body.identifier, req.body.key, req.body.value, {
            from: req.body.fromAccount,
            gas: '4712388'
        }, function(error, txnHash){
            if(error) {
                res.send({"error": error.toString()})
            } else {
                res.send({"txnHash": txnHash})
            }
        })
    }
})

app.post(`/api/node/${instanceId}/assets/grantAccessToPrivateData`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);

    /*
        1. Generate Re-Encryption Key
        2. Write to Impulse
        3. Send BC Blockchain Txn to Notify other participant
    */

    let publicKey = assets.getEncryptionPublicKey.call(req.body.assetName, req.body.identifier, {
        from: web3.eth.accounts[0]
    });

    db.collection("encryptionKeys").findOne({compressed_public_key_hex: publicKey}, function(err, keyPair) {
        if(!err && keyPair) {
            let compressed_public_key_base64 = Buffer.from(publicKey, 'hex').toString("base64")

            exec('python3 /dynamo/apis/crypto-operations/generate-re-encryptkey.py ' + hexToBase64(keyPair.private_key_hex) + " " + req.body.publicKey, (error, stdout, stderr) => {
                if(!error) {
                    let kfrags = stdout
                    let signature = ec.sign(sha3.keccak256(keyPair.compressed_public_key_hex), keyPair.private_key_hex, "hex", {canonical: true});

                    request({
                        url: `${Config.getImpulseURL()}/writeKey`,
                        method: "POST",
                        json: {
                            ownerPublicKey: keyPair.compressed_public_key_hex,
                            reEncryptionKey: kfrags,
                            signature: signature,
                            receiverPublicKey: base64ToHex(req.body.publicKey)
                        }
                    }, (error, result, body) => {
                        if(!error) {
                            if(body.error) {
                                res.send({"error": body.error.toString()})
                            } else {
                                assets.soloAssetGrantAccess.sendTransaction(req.body.assetName, req.body.identifier, req.body.publicKey, {
                                    from: req.body.fromAccount,
                                    gas: '4712388'
                                }, function(error, txnHash){
                                    if(error) {
                                        res.send({"error": error.toString()})
                                    } else {
                                        res.send({"txnHash": txnHash})
                                    }
                                })
                            }
                        } else {
                            res.send({"error": error.toString()})
                        }
                    })
                } else {
                    res.send({"error": error.toString()})
                }
            })


        } else {
            res.send({"error": err.toString()})
        }
    })
})

app.post(`/api/node/${instanceId}/assets/revokeAccessToPrivateData`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);

    /*
        1. Generate Re-Encryption Key
        2. Write to Impulse
        3. Send BC Blockchain Txn to Notify other participant
    */

    let publicKey = assets.getEncryptionPublicKey.call(req.body.assetName, req.body.identifier, {
        from: web3.eth.accounts[0]
    });

    db.collection("encryptionKeys").findOne({compressed_public_key_hex: publicKey}, function(err, keyPair) {
        if(!err && keyPair) {
            let compressed_public_key_base64 = Buffer.from(publicKey, 'hex').toString("base64")
            let signature = ec.sign(sha3.keccak256(keyPair.compressed_public_key_hex), keyPair.private_key_hex, "hex", {canonical: true});

            request({
                url: `${Config.getImpulseURL()}/deleteKey`,
                method: "POST",
                json: {
                    ownerPublicKey: keyPair.compressed_public_key_hex,
                    signature: signature,
                    receiverPublicKey: base64ToHex(req.body.publicKey)
                }
            }, (error, result, body) => {
                if(!error) {
                    if(body.error) {
                        res.send({"error": body.error.toString()})
                    } else {
                        assets.soloAssetRevokeAccess.sendTransaction(req.body.assetName, req.body.identifier, req.body.publicKey, {
                            from: req.body.fromAccount,
                            gas: '4712388'
                        }, function(error, txnHash){
                            if(error) {
                                res.send({"error": error.toString()})
                            } else {
                                res.send({"txnHash": txnHash})
                            }
                        })
                    }
                } else {
                    res.send({"error": error.toString()})
                }
            })
        } else {
            res.send({"error": err.toString()})
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
            res.send({"error": error.toString()})
        } else {
            res.send({"txnHash": txnHash})
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
                                                res.send({"txnHash": txnHash, "orderId": hash})
                                            } else {
                                                res.send({"error": error.toString()})
                                            }
                                        })
                                    } else {
                                        res.send({"error": error.toString()})
                                    }
                            })
                        } else {
                            res.send({"error": "Unknown Error Occured"})
                        }
                    });
                } else {
                    res.send({"error": error.toString()})
                }
            })
        } else {
            console.log(err);
            res.send({"error": "Unknown Error Occured"})
        }
    })
})

app.post(`/api/node/${instanceId}/assets/fulfillOrder`, (req, res) => {
    db.collection("orders").findOne({instanceId: instanceId, atomicSwapHash: req.body.orderId}, function(err, order) {
        if(!err && order) {
            let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
            db.collection("networks").findOne({instanceId: req.body.toNetworkId, user: network.user}, function(err, node) {
                if(!err && node) {
                    let toNetwork = node;
                    var atomicSwapContract = web3.eth.contract(smartContracts.atomicSwap.abi);
                    var atomicSwap = atomicSwapContract.at(toNetwork.atomicSwapContractAddress);
                    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
                    var assets = assetsContract.at(toNetwork.assetsContractAddress);
                    if(network.genesisBlockHash === order.toGenesisBlockHash) {
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
                                        }, function(error, txHash) {
                                            if (error) {
                                                res.send({"error": error.toString()})
                                            } else {
                                                res.send({"txnHash": txHash})
                                            }
                                        })
                                } else {
                                    res.send({"error": error.toString()})
                                }
                            }
                        )
                    } else {
                        let web3 = new Web3(new Web3.providers.HttpProvider(`http://${node.workerNodeIP}:${node.rpcNodePort}`));
                        var atomicSwapContract = web3.eth.contract(smartContracts.atomicSwap.abi);
                        var atomicSwap = atomicSwapContract.at(toNetwork.atomicSwapContractAddress);
                        var assetsContract = web3.eth.contract(smartContracts.assets.abi);
                        var assets = assetsContract.at(toNetwork.assetsContractAddress);
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
                                                res.send({"error": "Order has expired"})
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
                                                        res.send({"txnHash": txnHash})
                                                    } else {
                                                        res.send({"error": error.toString()})
                                                    }
                                                })
                                        } else {
                                            res.send({"error": error.toString()})
                                        }
                                    }
                                )
                            } else {
                                res.send({"error": error.toString()})
                            }
                        })
                    }
                } else {
                    res.send({"error": "Unknown Error Occured"})
                }
            })
        } else {
            res.send({"error": err})
        }

    })
})

app.post(`/api/node/${instanceId}/assets/cancelOrder`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    var atomicSwapContract = web3.eth.contract(smartContracts.atomicSwap.abi);
    var atomicSwap = atomicSwapContract.at(network.atomicSwapContractAddress);
    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);

    db.collection("orders").findOne({instanceId: instanceId, atomicSwapHash: req.body.orderId}, function(err, order) {
        if(!err && order) {
            atomicSwap.unlock.sendTransaction(
                req.body.orderId, {
                    from: order.fromAddress,
                    gas: '99999999999999999'
                },
                function(error, txHash) {
                    if (error) {
                        res.send({"error": error.toString()})
                    } else {
                        res.send({"txnHash": txHash})
                    }
                }
            )
        } else {
            res.send({"error": err})
        }
    })
})

app.post(`/api/node/${instanceId}/assets/getOrderInfo`, (req, res) => {
    let order = Orders.find({instanceId: instanceId, atomicSwapHash: req.body.orderId}).fetch();

    if(order[0]) {
        res.send(order[0])
    } else {
        res.send({"error": "Order not found"})
    }
})

app.post(`/api/node/${instanceId}/assets/search`, (req, res) => {
    var query = req.body;
    query.instanceId = instanceId;

    db.collection("soloAssets").find(query, function(err, result) {
        if(err) {
            res.send({"error": "Search Error Occured"})
        } else {
            res.send(result)
        }
    });
})

app.post(`/api/node/${instanceId}/streams/search`, (req, res) => {
    var query = req.body;
    query.instanceId = instanceId;

    db.collection("streamsItems").find(query, function(err, result) {
        if(err) {
            res.send({"error": "Search Error Occured"})
        } else {
            res.send(result)
        }
    });
})

app.post(`/api/node/${instanceId}/assets/createStream`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
    var streamsContract = web3.eth.contract(smartContracts.streams.abi);
    var streams = streamsContract.at(network.streamsContractAddress);

    streams.createStream.sendTransaction(req.body.streamName, {
        from: req.body.fromAccount,
        gas: '99999999999999999'
    }, function(error, txnHash) {
        if (!error) {
            res.send({"txhash": txnHash})
        } else {
            res.send({"error": "Search Error Occured"})
        }
    })
})

app.post(`/api/node/${instanceId}/streams/publish`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
    var streamsContract = web3.eth.contract(smartContracts.streams.abi);
    var streams = streamsContract.at(network.streamsContractAddress);

    if(req.body.visibility === "private" && req.body.publicKeys.length > 0) {

        let wallet = Wallet.generate();
        let private_key_hex = wallet.getPrivateKey().toString("hex");
        let private_key_base64 = wallet.getPrivateKey().toString("base64");
        let compressed_public_key_hex = EthCrypto.publicKey.compress(wallet.getPublicKey().toString("hex"))
        let compressed_public_key_base64 = Buffer.from(EthCrypto.publicKey.compress(wallet.getPublicKey().toString("hex")), 'hex').toString("base64")

        async function storeData(compressed_public_key_base64, object, streamName, key) {
            return new Promise((resolve, reject) => {
                exec(`python3 /dynamo/apis/crypto-operations/encrypt.py ${compressed_public_key_base64} '${object}'`, (error, stdout, stderr) => {
                    if(!error) {
                        stdout = stdout.split(" ")
                        let ciphertext = stdout[0].substr(2).slice(0, -1)
                        let capsule = stdout[1].substr(2).slice(0, -2)

                        let ciphertext_hash = sha3.keccak256(ciphertext);
                        let signature = ec.sign(ciphertext_hash, private_key_hex, "hex", {canonical: true});

                        request({
                            url: `${Config.getImpulseURL()}/writeObject`,
                            method: "POST",
                            json: {
                                publicKey: compressed_public_key_hex,
                                encryptedData: ciphertext,
                                signature: signature,
                                metadata: {
                                    streamName: streamName,
                                    key: key
                                },
                                capsule: capsule
                            }
                        }, (error, result, body) => {
                            if(!error) {
                                if(body.error) {
                                    reject(body.error)
                                } else {
                                    resolve(ciphertext_hash)
                                }
                            } else {
                                reject(error)
                            }
                        })
                    } else {
                        reject(error)
                    }
                })
            })
        }

        async function generateAndStoreKey(private_key_hex, publicKey) {
            return new Promise((resolve, reject) => {
                exec('python3 /dynamo/apis/crypto-operations/generate-re-encryptkey.py ' + hexToBase64(private_key_hex) + " " + publicKey, (error, stdout, stderr) => {
                    if(!error) {
                        let kfrags = stdout
                        let signature = ec.sign(sha3.keccak256(compressed_public_key_hex),  private_key_hex, "hex", {canonical: true});

                        request({
                            url: `${Config.getImpulseURL()}/writeKey`,
                            method: "POST",
                            json: {
                                ownerPublicKey: compressed_public_key_hex,
                                reEncryptionKey: kfrags,
                                signature: signature,
                                receiverPublicKey: base64ToHex(publicKey)
                            }
                        }, (error, result, body) => {
                            if(!error) {
                                if(body.error) {
                                    reject({"myerror": body.error, compressed_public_key_hex: compressed_public_key_hex, reEncryptionKey: kfrags, signature: signature, receiverPublicKey: base64ToHex(publicKey)})
                                } else {
                                    resolve()
                                }
                            } else {
                                reject(error)
                            }
                        })
                    } else {
                        reject(error)
                    }
                })
            })
        }

        db.collection("encryptionKeys").insertOne({
            private_key_hex: private_key_hex,
            compressed_public_key_hex: compressed_public_key_hex,
            instanceId: instanceId
        }, async function(err) {
            if(!err) {
                try {
                    let encryptedDataHash = await storeData(compressed_public_key_base64, base64.encode(JSON.stringify({
                        key: req.body.key,
                        value: req.body.data,
                        timestamp: Date.now()
                    })), req.body.streamName, req.body.key)

                    for(let count = 0; count < req.body.publicKeys.length; count++) {
                        //now generate re-encrypt key for all publicKeys
                        await generateAndStoreKey(private_key_hex, req.body.publicKeys[count])
                    }

                    streams.publish.sendTransaction(req.body.streamName, req.body.key, encryptedDataHash, true, compressed_public_key_base64, req.body.publicKeys.join(), {
                        from: req.body.fromAccount
                    }, function(error, txnHash) {
                        if (!error) {
                            res.send({"txnHash": txnHash})
                        } else {
                            res.send({"error": error.toString()})
                        }
                    })
                } catch(e) {
                    res.send({"error": e})
                }
            } else {
                res.send({"error": "An unknown error occured"})
            }
        })
    } else {
        streams.publish.sendTransaction(req.body.streamName, req.body.key, req.body.data, false, "", "", {
            from: req.body.fromAccount
        }, function(error, txnHash) {
            if (!error) {
                res.send({"txnHash": txnHash})
            } else {
                res.send({"error": error.toString()})
            }
        })
    }
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

app.post(`/api/node/${instanceId}/utility/vote`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
    web3.currentProvider.sendAsync({
        method: "istanbul_propose",
        params: [req.body.toVote, true],
        jsonrpc: "2.0",
        id: new Date().getTime()
    }, function(error, result) {
        if (error) {
            res.send({"error": "An unknown error occured"})
        } else {
            res.send({})
        }
    })
})

app.post(`/api/node/${instanceId}/utility/unVote`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
    web3.currentProvider.sendAsync({
        method: "istanbul_propose",
        params: [req.body.toUnvote, false],
        jsonrpc: "2.0",
        id: new Date().getTime()
    }, function(error, result) {
        if (error) {
            res.send({"error": "An unknown error occured"})
        } else {
            res.send({})
        }
    })
})

app.post(`/api/node/${instanceId}/utility/createAccount`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
    web3.currentProvider.sendAsync({
        method: "personal_newAccount",
        params: [req.body.password],
        jsonrpc: "2.0",
        id: new Date().getTime()
    }, function(error, result) {
        if (error) {
            res.send({"error": "An unknown error occured"})
        } else {
            web3.currentProvider.sendAsync({
                method: "personal_unlockAccount",
                params: [result.result, req.body.password, 0],
                jsonrpc: "2.0",
                id: new Date().getTime()
            }, function(error) {
                if(!error) {
                    db.collection("bcAccounts").insertOne({
                        "instanceId": instanceId,
                        "address": result.result,
                        "password": req.body.password,
                        "name": req.body.name || ""
                    }, (err) => {
                        if(!err) {
                            res.send({})
                        } else {
                            res.send({"error": "An unknown error occured"})
                        }
                    })
                } else {
                    res.send({"error": "An unknown error occured"})
                }
            })
        }
    })
})



app.get(`/api/node/${instanceId}/utility/nodeInfo`, (req, res) => {
    var genesis = fs.readFileSync('/dynamo/node/genesis.json', 'utf8');
    var nodekey = fs.readFileSync('/dynamo/node/geth/nodekey', 'utf8');
    var constellationPublicKey = fs.readFileSync('/dynamo/cnode/node.pub', 'utf8');
    res.send({
        "genesis": genesis,
        "nodekey": nodekey,
        "constellationPublicKey": constellationPublicKey,
    })
})

app.get(`/api/node/${instanceId}/utility/size`, async (req, res) => {
    var gethSize = await getDirSize("/dynamo/node");
    var constellationSize = await getDirSize("/dynamo/cnode");
    res.send({
        "gethSize": gethSize,
        "constellationSize": constellationSize
    })
})

app.get(`/api/node/${instanceId}/utility/getPrivateKey`, (req, res) => {
    var datadir = "/dynamo/node";
    var url_parts = url.parse(req.url, true);
    var address= req.query.address;
    const password = req.query.password;

    var keyObject = keythereum.importFromFile(address, datadir);
    var privateKey = keythereum.recover(password, keyObject);

    res.send({
        "keyFile": keyObject,
        "privateKeyString": privateKey.toString("hex"),
        "password": password
    })
})


app.listen(6382)
