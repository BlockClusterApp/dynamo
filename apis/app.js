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
const EthereumTx = require('ethereumjs-tx')
const EthereumUtil = require('ethereumjs-util')
var abiDecoder = require('abi-decoder');

let instanceId = process.env.instanceId;
let db = null;
let network = null;
let localDB = null;

process.on('uncaughtException', function (error) {
   console.log(error);
});

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

MongoClient.connect("mongodb://localhost:27017", {reconnectTries : Number.MAX_VALUE, autoReconnect : true}, function(err, database) {
    if(!err) {
        localDB = database.db("admin");
    } else {
        console.log(err)
    }
})

MongoClient.connect(Config.getMongoConnectionString(), {reconnectTries : Number.MAX_VALUE, autoReconnect : true}, function(err, database) {
    if(!err) {
        db = database.db(Config.getDatabase());

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

async function getNonce(address) {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    return new Promise((resolve, reject) => {
        web3.eth.getTransactionCount(address, function(error, nonce){
            if(!error) {
                resolve(nonce)
            } else {
                reject("An error occured")
            }
        })
    })
}

app.post(`/assets/createAssetType`, async (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);

    if (req.body.assetType === "solo") {

        if(req.body.raw) {
            var rawTx = {
                 gasPrice: web3.toHex(0),
                 gasLimit: web3.toHex(99999999999999999),
                 from: req.body.assetIssuer,
                 nonce: web3.toHex(await getNonce(req.body.assetIssuer)),
                 data: assets.createSoloAssetType.getData(req.body.assetName, req.body.description || ""),
                 to: network.assetsContractAddress,
                 value: web3.toHex(0)
            };

            res.send({"rawTx": rawTx})
        } else {
            assets.createSoloAssetType.sendTransaction(req.body.assetName, req.body.description || "", {
                from: req.body.assetIssuer,
                gas: '99999999999999999'
            }, function(error, txnHash) {
                if (!error) {
                    res.send({"txnHash": txnHash})
                } else {
                    res.send({"error": error.toString()})
                }
            })
        }

    } else {
        if(req.body.raw) {
            if(req.body.parts > 18) {
                res.send({"error": "Invalid parts"})
            } else {
                var rawTx = {
                     gasPrice: web3.toHex(0),
                     gasLimit: web3.toHex(99999999999999999),
                     from: req.body.assetIssuer,
                     nonce: web3.toHex(await getNonce(req.body.assetIssuer)),
                     data: assets.createBulkAssetType.getData(req.body.assetName, (req.body.reissuable === "true"), req.body.parts, req.body.description || ""),
                     to: network.assetsContractAddress,
                     value: web3.toHex(0)
                };

                res.send({"rawTx": rawTx})
            }
        } else {
            if(req.body.parts > 18) {
                res.send({"error": "Invalid parts"})
            } else {
                assets.createBulkAssetType.sendTransaction(req.body.assetName, (req.body.reissuable === "true"), req.body.parts, req.body.description || "", {
                    from: req.body.assetIssuer,
                    gas: '99999999999999999'
                }, function(error, txnHash) {
                    if (!error) {
                        res.send({"txnHash": txnHash})
                    } else {
                        res.send({"error": error.toString()})
                    }
                })
            }
        }
    }
})

app.get("/assets/assetTypes", (req, res) => {
    localDB.collection("assetTypes").find({}).toArray(function(err, result) {
        if(err) {
            res.send({"error": err})
        } else {
            res.send(result)
        }
    })
})

app.get("/assets/orders", (req, res) => {
    localDB.collection("orders").find({}).toArray(function(err, result) {
        if(err) {
            res.send({"error": err})
        } else {
            res.send(result)
        }
    })
})

app.get("/streams/streamTypes", (req, res) => {
    localDB.collection("streams").find({}).toArray(function(err, result) {
        if(err) {
            res.send({"error": err})
        } else {
            res.send(result)
        }
    })
})

app.post(`/assets/issueSoloAsset`, (req, res) => {
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

    localDB.collection("encryptionKeys").insertOne({
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


app.post(`/assets/issueBulkAsset`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);
    var parts = assets.getBulkAssetParts.call(req.body.assetName)
    let units = (new BigNumber(req.body.units)).multipliedBy(addZeros(1, parts))
    assets.issueBulkAsset.sendTransaction(req.body.assetName, units.toString(), req.body.toAccount, req.body.description || "", {
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

app.post(`/assets/transferSoloAsset`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);
    assets.transferOwnershipOfSoloAsset.sendTransaction(req.body.assetName, req.body.identifier, req.body.toAccount, req.body.description || "", {
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

app.post(`/assets/transferBulkAsset`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);
    var parts = assets.getBulkAssetParts.call(req.body.assetName)
    let units = (new BigNumber(req.body.units)).multipliedBy(addZeros(1, parts))
    assets.transferBulkAssetUnits.sendTransaction(req.body.assetName, req.body.toAccount, units.toString(), req.body.description || "", {
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

app.post(`/assets/getSoloAssetInfo`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    try {
        var query = {};
        query.assetName = req.body.assetName;
        query.uniqueIdentifier = parseAndConvertData(req.body.identifier);

        localDB.collection("soloAssets").findOne(query, function(err, result) {
            if(err) {
                res.send({"error": err.toString()})
            } else if(result) {
                res.send(result)
            } else {
                res.send({"error": "Not Found"})
            }
        });
    } catch(e) {
        res.send({"error": e.toString()})
    }
})

app.post(`/assets/getBulkAssetBalance`, (req, res) => {
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

app.post(`/assets/updateAssetInfo`, async (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);

    /*
        1. If private
        2. Write to Impulse
        3. Then write hash to BlockChain
    */

    async function send(key, value) {
        return new Promise((resolve, reject) => {
            assets.addOrUpdateSoloAssetExtraData.sendTransaction(req.body.assetName, req.body.identifier, key, value, {
                from: req.body.fromAccount,
                gas: '4712388'
            }, function(error, txnHash){
                if(error) {
                    reject(error.toString())
                } else {
                    resolve(txnHash)
                }
            })
        })
    }

    let encryptedArr = [];

    async function encrypt(publicKey, object) {
        return new Promise((resolve, reject) => {
            localDB.collection("encryptionKeys").findOne({compressed_public_key_hex: publicKey}, function(err, keyPair) {
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
                                        reject(body.error.toString())
                                    } else {
                                        resolve(ciphertext_hash)
                                    }
                                } else {
                                    reject(error.toString())
                                }
                            })
                        } else {
                            reject(error.toString())
                        }
                    })
                } else {
                    reject("You are not the owner of the private key required for signing meta data")
                }
            })
        })
    }

    async function encryptSend(key, value) {
        return new Promise((resolve, reject) => {

            let ciphertext_hash = "";
            for(var count = 0; count < encryptedArr.length; count++) {
                ciphertext_hash = ciphertext_hash + encryptedArr[count] + "œ";
            }

            ciphertext_hash = ciphertext_hash.substring(0, ciphertext_hash.length - 1);

            assets.addOrUpdateEncryptedDataObjectHash.sendTransaction(req.body.assetName, req.body.identifier, ciphertext_hash, {
                from: req.body.fromAccount,
                gas: '4712388'
            }, function(error, txnHash){
                if(error) {
                    reject(error.toString())
                } else {
                    resolve(txnHash)
                }
            })
        })
    }

    let txns = [];

    if(req.body.private) {
        let publicKey = assets.getSoloAssetDetails.call(req.body.assetName, req.body.identifier, {
            from: web3.eth.accounts[0]
        })[2];

        for(let key in req.body.private) {
            let timestamp = Date.now();
            let object = base64.encode(JSON.stringify({
                key: key,
                value: req.body.private[key],
                timestamp: timestamp
            }))

            try {
                encryptedArr.push(await encrypt(publicKey, object))
            } catch(e) {
                res.send({"error": e})
                return;
            }
        }

        try {
            let txnHash = encryptSend();
            txns.push(txnHash)
        } catch(e) {
            res.send({"error": e})
            return;
        }
    }

    if(req.body.public) {
        let finalKey = "";
        let finalValue = "";
        for(let key in req.body.public) {
            finalKey = finalKey + key + "œ"
            finalValue = finalValue + req.body.public[key] + "œ"
        }

        finalKey = finalKey.substring(0, finalKey.length - 1);
        finalValue = finalValue.substring(0, finalValue.length - 1);

        try {
            let txnHash = await send(finalKey, finalValue)
            txns.push(txnHash)
        } catch(e) {
            res.send({"error": e})
            return;
        }
    }

    res.send({"txnHash": txns})
})

app.post(`/assets/grantAccessToPrivateData`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);

    /*
        1. Generate Re-Encryption Key
        2. Write to Impulse
        3. Send BC Blockchain Txn to Notify other participant
    */

    let publicKey = assets.getSoloAssetDetails.call(req.body.assetName, req.body.identifier, {
        from: web3.eth.accounts[0]
    })[2];

    localDB.collection("encryptionKeys").findOne({compressed_public_key_hex: publicKey}, function(err, keyPair) {
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
                                assets.soloAssetChangeAccess.sendTransaction(req.body.assetName, req.body.identifier, req.body.publicKey, true, {
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

app.post(`/assets/revokeAccessToPrivateData`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);

    /*
        1. Generate Re-Encryption Key
        2. Write to Impulse
        3. Send BC Blockchain Txn to Notify other participant
    */

    let publicKey = assets.getSoloAssetDetails.call(req.body.assetName, req.body.identifier, {
        from: web3.eth.accounts[0]
    })[2];

    localDB.collection("encryptionKeys").findOne({compressed_public_key_hex: publicKey}, function(err, keyPair) {
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
                        assets.soloAssetChangeAccess.sendTransaction(req.body.assetName, req.body.identifier, req.body.publicKey, false, {
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

app.post(`/assets/closeAsset`, (req, res) => {
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

app.post(`/assets/placeOrder`, (req, res) => {
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
                            var from_asset_parts = 0;
                            var to_asset_parts = 0;
                            if(req.body.fromAssetUnits) {
                                from_asset_parts = assets.getBulkAssetParts.call(req.body.fromAssetName)
                                req.body.fromAssetUnits = (new BigNumber(req.body.fromAssetUnits)).multipliedBy(addZeros(1, from_asset_parts)).toString()
                            }

                            if(req.body.toAssetUnits) {
                                let _web3 = new Web3(new Web3.providers.HttpProvider(`http://${node.workerNodeIP}:${node.rpcNodePort}`));
                                var _atomicSwapContract = _web3.eth.contract(smartContracts.atomicSwap.abi);
                                var _atomicSwap = atomicSwapContract.at(node.atomicSwapContractAddress);
                                var _assetsContract = _web3.eth.contract(smartContracts.assets.abi);
                                var _assets = assetsContract.at(node.assetsContractAddress);

                                to_asset_parts = _assets.getBulkAssetParts.call(req.body.toAssetName)
                                req.body.toAssetUnits = (new BigNumber(req.body.toAssetUnits)).multipliedBy(addZeros(1, to_asset_parts)).toString()
                            }

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
                                            from_asset_parts.toString(),
                                            req.body.toAssetType,
                                            req.body.toAssetName,
                                            req.body.toAssetUnits,
                                            to_asset_parts.toString(),
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

app.post(`/assets/fulfillOrder`, (req, res) => {
    localDB.collection("orders").findOne({instanceId: instanceId, atomicSwapHash: req.body.orderId}, function(err, order) {
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
                                                order.toAssetParts.toString() || 0,
                                                order.fromAssetType,
                                                order.fromAssetName,
                                                order.fromAssetUnits,
                                                order.fromAssetParts.toString() || 0,
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

app.post(`/assets/cancelOrder`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    var atomicSwapContract = web3.eth.contract(smartContracts.atomicSwap.abi);
    var atomicSwap = atomicSwapContract.at(network.atomicSwapContractAddress);
    var assetsContract = web3.eth.contract(smartContracts.assets.abi);
    var assets = assetsContract.at(network.assetsContractAddress);

    localDB.collection("orders").findOne({instanceId: instanceId, atomicSwapHash: req.body.orderId}, function(err, order) {
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

app.post(`/assets/getOrderInfo`, (req, res) => {
    localDB.collection("orders").findOne({instanceId: instanceId, atomicSwapHash: req.body.orderId}, function(err, order) {
        if(!err && order) {
            if(order.fromAssetType === "bulk") {
                order.convertedFromAssetUnits = (new BigNumber(order.fromAssetUnits)).dividedBy(addZeros(1, order.fromAssetParts)).toFixed(parseInt(order.fromAssetParts)).toString()
            }

            if(order.toAssetType === "bulk") {
                order.convertedToAssetUnits = (new BigNumber(order.toAssetUnits)).dividedBy(addZeros(1, order.toAssetParts)).toFixed(parseInt(order.toAssetParts)).toString()
            }

            //delete order.toAssetParts;
            //delete order.fromAssetParts;

            res.send(order)
        } else {
            res.send({"error": "Order not found"})
        }
    })
})

app.post(`/assets/search`, (req, res) => {
    var query = req.body;

    localDB.collection("soloAssets").find(query).toArray(function(err, result) {
        if(err) {
            res.send({"error": "Search Error Occured"})
        } else {
            res.send(result)
        }
    });
})

app.post(`/assets/audit`, (req, res) => {
    var assetName = req.body.assetName;
    var uniqueIdentifier = req.body.uniqueIdentifier;

    localDB.collection("soloAssetAudit").find({assetName: assetName, uniqueIdentifier: uniqueIdentifier}).sort({date_created: 1}).toArray(function(err, result) {
        if(err) {
            res.send({"error": "Search Error Occured"})
        } else {
            res.send(result)
        }
    });
})

app.post(`/streams/search`, (req, res) => {
    var query = req.body;

    localDB.collection("streamsItems").find(query).toArray(function(err, result) {
        if(err) {
            res.send({"error": "Search Error Occured"})
        } else {
            res.send(result)
        }
    });
})

app.post(`/assets/createStream`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
    var streamsContract = web3.eth.contract(smartContracts.streams.abi);
    var streams = streamsContract.at(network.streamsContractAddress);

    streams.createStream.sendTransaction(req.body.streamName, req.body.description || "", {
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

app.post(`/streams/grantAccessToPublish`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
    var streamsContract = web3.eth.contract(smartContracts.streams.abi);
    var streams = streamsContract.at(network.streamsContractAddress);

    streams.addPublisher.sendTransaction(req.body.streamName, req.body.publisher, {
        from: req.body.fromAccount,
        gas: '99999999999999999'
    }, function(error, txnHash) {
        if (!error) {
            res.send({"txhash": txnHash})
        } else {
            res.send({"error": "An unknown error occured"})
        }
    })
})

app.post(`/streams/revokeAccessToPublish`, (req, res) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
    var streamsContract = web3.eth.contract(smartContracts.streams.abi);
    var streams = streamsContract.at(network.streamsContractAddress);

    streams.removePublisher.sendTransaction(req.body.streamName, req.body.publisher, {
        from: req.body.fromAccount,
        gas: '99999999999999999'
    }, function(error, txnHash) {
        if (!error) {
            res.send({"txhash": txnHash})
        } else {
            res.send({"error": "An unknown error occured"})
        }
    })
})

app.post(`/streams/publish`, (req, res) => {
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

        localDB.collection("encryptionKeys").insertOne({
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

app.post(`/utility/vote`, (req, res) => {
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

app.post(`/utility/unVote`, (req, res) => {
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

app.post(`/utility/createAccount`, (req, res) => {
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
                    localDB.collection("bcAccounts").insertOne({
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

app.get(`/utility/accounts`, (req, res) => {
    localDB.collection("bcAccounts").find({}).toArray(function(err, result) {
        if(err) {
            res.send({"error": err})
        } else {
            res.send(result)
        }
    })
})

app.get(`/utility/nodeInfo`, (req, res) => {
    var genesis = fs.readFileSync('/dynamo/bcData/node/genesis.json', 'utf8');
    var nodekey = fs.readFileSync('/dynamo/bcData/node/geth/nodekey', 'utf8');

    localDB.collection("nodeData").findOne({"type": "scanData"}, function(err, result) {
        if(err) {
            res.send({"error": err})
        } else if(result) {
            result.genesis = genesis;
            result.nodekey = nodekey;
            res.send(result)
        } else {
            res.send({
                "genesis": genesis,
                "nodekey": nodekey
            })
        }
    })
})

app.get(`/utility/size`, async (req, res) => {
    var size = await getDirSize("/dynamo/bcData/");
    res.send({
        "size": size
    })
})

app.post(`/utility/getPrivateKey`, (req, res) => {
    var datadir = "/dynamo/bcData/node";
    var url_parts = url.parse(req.url, true);
    var address= req.body.address;

    localDB.collection("bcAccounts").findOne({address: address}, function(err, result) {
        if(err) {
            res.send({"error": err})
        } else if(result) {
            var keyObject = keythereum.importFromFile(address, datadir);
            var privateKey = keythereum.recover(result.password, keyObject);

            res.send({
                "keyFile": keyObject,
                "privateKeyString": privateKey.toString("hex"),
                "password": result.password
            })
        } else {
            res.send({"error": "Not Found"})
        }
    })
})

async function sendRawTxn(data) {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

    return new Promise((resolve, reject) => {
        web3.eth.sendRawTransaction(data, function(err, hash) {
            if(err) {
                reject({"error": "An error occured"})
            } else {
                resolve({"txnHash": hash})
            }
        })
    })
}

app.get(`/transactions/last100`, async (req, res) => {
    localDB.collection("bcTransactions").find({}).toArray(function(err, result) {
        if(err) {
            res.send({"error": err})
        } else {
            res.send(result)
        }
    });
})

app.get(`/transactions/audit`, async (req, res) => {
    let txnHash = req.query.hash;
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
    web3.eth.getTransaction(txnHash, (error, result1) => {
        if(!error && result1 != null) {
            web3.eth.getTransactionReceipt(txnHash, (error, result2) => {
                if(!error && result2 != null) {
                    if(result2.to) {
                        //contract call
                        web3.eth.getCode(result2.to, "latest", (err, code) => {
                            if(!err) {
                                localDB.collection("contracts").find({}).toArray(function(err, result) {
                                    if(err) {
                                        res.send({"error": "Unknown Error Occured"})
                                    } else {
                                        for(let count = 0; count < result.length; count++) {
                                            //the bytecode returned by geth is different than the bytecode uploaded.
                                            //returned bytecode works as a subset of uploaded bytecode
                                            if(result[count].bytecode.includes(code.substring(2))) {
                                                abiDecoder.addABI(result[count].abi);

                                                let decodedData = abiDecoder.decodeMethod(result1.input);
                                                if(decodedData !== undefined) {
                                                    result1.decodedinput = decodedData
                                                }

                                                if(result2.logs.length > 0) {
                                                    let decodedLogs = abiDecoder.decodeLogs(result2.logs);

                                                    if(decodedLogs[0] !== undefined) {
                                                        result2.decodedLogs = decodedLogs
                                                    }
                                                }

                                                res.send(JSON.parse(JSON.stringify(Object.assign(result1, result2), undefined, 4)))
                                                return;
                                            }
                                        }

                                        res.send(JSON.parse(JSON.stringify(Object.assign(result1, result2), undefined, 4)))
                                    }
                                });
                            } else {
                                res.send(JSON.parse(JSON.stringify(Object.assign(result1, result2), undefined, 4)))
                            }
                        })
                    } else {
                        //contract creation
                        res.send(JSON.parse(JSON.stringify(Object.assign(result1, result2), undefined, 4)))
                    }
                } else {
                    res.send({"error": "An unknown error occured"})
                }
            })
        } else {
            res.send({"error": "An unknown error occured"})
        }
    })
})

app.post(`/transactions/signAndSend`, async (req, res) => {

    let result = [];

    try {
        for(let count = 0; count < req.body.txns.length; count++) {
            let tx = new EthereumTx(req.body.txns[count].raw);
            let privateKey = EthereumUtil.toBuffer(req.body.txns[count].privateKey, "hex");
            tx.sign(privateKey)
            result.push(await sendRawTxn("0x" + tx.serialize().toString("hex")))
        }

        res.send(result)
    } catch(e) {
        res.send({ "error": e})
    }
})

app.post(`/transactions/sendRaw`, async (req, res) => {
    let result = [];

    try {
        for(let count = 0; count < req.body.txns.length; count++) {
            result.push(await sendRawTxn(req.body.txns[count]))
        }
        res.send(result)
    } catch(e) {
        res.send({ "error": e})
    }
})

async function clearFile(file) {
    return new Promise((resolve, reject) => {
        fs.writeFile(file, "[]", (err, data) => {
            if (err) {
                reject(err)
            } else {
                resolve()
            }
        })
    })
}

async function writeFile(file, content) {
    return new Promise((resolve, reject) => {
        fs.writeFile(file, content, (err, data) => {
            if (err) {
                reject(err)
            } else {
                resolve()
            }
        })
    })
}

async function updateNetwork(set) {
    return new Promise((resolve, reject) => {
        db.collection("networks").updateOne({instanceId: instanceId}, { $set: set }, function(err, res) {
            if(err) {
                reject(err)
            } else {
                resolve()
            }
        });
    })
}

async function upsertNetworkInfo(set) {
    return new Promise((resolve, reject) => {
        localDB.collection("nodeData").updateOne({"type": "scanData"}, { $set: set }, {upsert: true, safe: false}, function(err, res) {
            if(err) {
                reject(err)
            } else {
                resolve()
            }
        });
    })
}


async function adminAddPeer(url) {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
    return new Promise((resolve, reject) => {
        web3.currentProvider.sendAsync({
            method: "admin_addPeer",
            params: [url],
            jsonrpc: "2.0",
            id: new Date().getTime()
        }, (error) => {
            if(error) {
                reject(error)
            } else {
                resolve()
            }
        })
    })
}

//always keep static-nodes and permissioned-nodes sync with DB

app.post(`/utility/whitelistPeer`, async (req, res) => {
    //let finalURL = `enode://${enode}[::]:${port}`

    let url = req.body.url;

    localDB.collection("nodeData").findOne({"type": "scanData"}, async function(err, result) {
        if(!err) {
            let whitelistedNodes;
            if(result.whitelistedNodes) {
                whitelistedNodes = result.whitelistedNodes;
            } else {
                whitelistedNodes = []
            }

            if(whitelistedNodes.includes(url)) {
                res.send({"message": "Node ID already exists"})
            } else {
                whitelistedNodes.push(url)

                try {
                    await clearFile("/dynamo/bcData/node/permissioned-nodes.json")
                    await writeFile("/dynamo/bcData/node/permissioned-nodes.json", JSON.stringify(whitelistedNodes))
                    await upsertNetworkInfo({
                        whitelistedNodes: whitelistedNodes
                    })

                    res.send({ "message": "Successfully whitelisted node"})
                } catch(e) {
                    res.send({ "error": e})
                }

            }
        } else {
            console.log(err)
        }
    })
})

app.post(`/utility/addPeer`, async (req, res) => {
    let url = req.body.url;

    localDB.collection("nodeData").findOne({"type": "scanData"}, async function(err, result) {
        if(!err) {
            let staticPeers;
            if(result.staticPeers) {
                staticPeers = result.staticPeers;
            } else {
                staticPeers = []
            }

            if(staticPeers.includes(url)) {
                res.send({"message": "Node URL already exists"})
            } else {
                staticPeers.push(url)

                try {
                    await clearFile("/dynamo/bcData/node/static-nodes.json")
                    await writeFile("/dynamo/bcData/node/static-nodes.json", JSON.stringify(staticPeers))
                    await adminAddPeer(url)
                    await upsertNetworkInfo({
                        staticPeers: staticPeers
                    })

                    res.send({ "message": "Successfully added node"})
                } catch(e) {
                    res.send({ "error": e})
                }
            }
        } else {
            console.log(err)
        }
    })
})

app.post(`/contracts/addOrUpdate`, async (req, res) => {
    let bytecode = req.body.bytecode;
    let abi = req.body.abi;
    let name = req.body.name;
    localDB.collection("contracts").updateOne({name: req.body.name}, { $set: {
        abi: (typeof(abi) === "string" ? JSON.parse(abi) : abi),
        bytecode: bytecode,
        abiHash: sha3.keccak256(JSON.stringify(abi)),
        bytecodeHash: sha3.keccak256(bytecode)
    } }, {upsert: true, safe: false}, function(err, result) {
        if(err) {
            res.send({"error": "An error occured"})
        } else {
            res.send({"message": "Successfully updated or added contract"})
        }
    });
})

app.post(`/contracts/search`, async (req, res) => {
    var query = req.body;

    localDB.collection("contracts").find(query).toArray(function(err, result) {
        if(err) {
            res.send({"error": "Search Error Occured"})
        } else {
            res.send(result)
        }
    });
})

app.listen(6382)
