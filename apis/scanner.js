var Web3 = require("web3");
var MongoClient = require("mongodb").MongoClient;
const request = require('request');
var BigNumber = require('bignumber.js');
var sha256 = require('sha256');
const Config = require('./config');
var Wallet = require("ethereumjs-wallet");
let EthCrypto = require("eth-crypto");
let elliptic = require('elliptic');
let sha3 = require('js-sha3');
let ec = new elliptic.ec('secp256k1')
let exec = require("child_process").exec;
var base64 = require('base-64');
var btoa = require('btoa');
var atob = require('atob');

const express = require('express')
const app = express()

var db = null;
var localDB = null;
var callbackURL = null;

app.listen(5742)

process.on('uncaughtException', function (error) {
   console.log(error);
});

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

Array.prototype.remByVal = function(val) {
    for (var i = 0; i < this.length; i++) {
        if (this[i] === val) {
            this.splice(i, 1);
            i--;
        }
    }
    return this;
}

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

let smartContracts = require("/dynamo/smart-contracts/index.js");

var assetsContractABI = smartContracts.assets.abi;
var atomicSwapContractABI = smartContracts.atomicSwap.abi;
var streamsContractABI = smartContracts.streams.abi;

async function notifyClient(data) {
    return new Promise((resolve, reject) => {
        try {
            request({
                url: callbackURL,
                method: "POST",
                json: data
            }, (error, result, body) => {
                resolve()
            })
        } catch(e) {
            resolve()
        }
    })
}

async function queryImpulse(query, privateKeyHex, publicKeyHex, ownerPublicKeyHex) {
    return new Promise((resolve, reject) => {
        try {
            let signature = ec.sign(sha3.keccak256(JSON.stringify(query)), privateKeyHex, "hex", {canonical: true});

            request({
                url: `${Config.getImpulseURL()}/query`,
                method: "POST",
                json: {
                    query: query,
                    signature: signature,
                    publicKey: publicKeyHex,
                    ownerPublicKey: ownerPublicKeyHex
                }
            }, (error, result, body) => {
                if(error) {
                    reject(error)
                } else {
                    if(body.error) {
                        reject(body.error)
                    } else {
                        resolve(body)
                    }
                }
            })
        } catch(e) {
            reject(e)
        }
    })
}

async function decryptData(privateKeyHex, publicKeyHex, ownerPublicKeyHex, capsule, ciphertext, decrypt_direct, derivationKey) {
    return new Promise((resolve, reject) => {
        try {
            if(decrypt_direct) {
                exec('python3 /dynamo/apis/crypto-operations/decrypt.py ' + hexToBase64(privateKeyHex) + " " + hexToBase64(publicKeyHex) + " " + capsule + " " + ciphertext, (error, stdout, stderr) => {
                    if(!error) {
                        try {
                            let plainObj = JSON.parse(stdout.substr(2).slice(0, -2))
                            resolve(plainObj)
                        } catch(e) {
                            //decrypted data is of invalid format.
                            resolve()
                        }
                    } else {
                        reject(error)
                    }
                })
            } else if(!decrypt_direct) {
                exec("python3 /dynamo/apis/crypto-operations/decrypt-pre.py '" + derivationKey + "' " + capsule + " " + ciphertext + " " + hexToBase64(privateKeyHex) + " " + hexToBase64(publicKeyHex) + " " + hexToBase64(ownerPublicKeyHex), (error, stdout, stderr) => {
                    if(!error) {
                        try {
                            let plainObj = JSON.parse(stdout.substr(2).slice(0, -2))
                            resolve(plainObj)
                        } catch(e) {
                            //decrypted data is of invalid format.
                            resolve({key: "error", value: ""})
                        }
                    } else {
                        reject(error)
                    }
                })
            }
        } catch(e) {
            reject(e)
        }
    })
}

async function getEncryptedDataEventsOfAsset(web3, assets, assetName, uniqueIdentifier) {
    return new Promise((resolve, reject) => {
        var events = assets.addedOrUpdatedEncryptedDataObjectHash({
            assetNameHash: '0x' + sha256(assetName),
            uniqueAssetIdentifierHash: '0x' + sha256(uniqueIdentifier)
        }, {fromBlock: 0, toBlock: 'latest'})

        events.get((error, result) => {
            if(error) {
                reject(error)
            } else {
                resolve(result)
            }
        })
    })
}

async function getTimestampOfBlock(web3, blockNumber) {
    return new Promise((resolve, reject) => {
        web3.eth.getBlock(blockNumber,  function(error, blockDetails) {
            if(!error) {
                resolve(blockDetails.timestamp)
            } else {
                reject(error)
            }
        })
    })
}

async function updateDB(instanceId, set) {
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

async function upsertSoloAsset(query, set) {
    return new Promise((resolve, reject) => {
        localDB.collection("soloAssets").updateOne(query, { $set: set }, {upsert: true, safe: false}, function(err, res) {
            if(err) {
                reject(err)
            } else {
                resolve()
            }
        });
    })
}

async function upsertSoloAssetAuditTrail(query, set) {
    return new Promise((resolve, reject) => {
        localDB.collection("soloAssetAudit").updateOne(query, { $set: set }, {upsert: true, safe: false}, function(err, res) {
            if(err) {
                reject(err)
            } else {
                resolve()
            }
        });
    })
}

async function upsertStream(query, set) {
    return new Promise((resolve, reject) => {
        localDB.collection("streams").updateOne(query, { $set: set }, {upsert: true, safe: false}, function(err, res) {
            if(err) {
                reject(err)
            } else {
                resolve()
            }
        });
    })
}

async function upsertStreamItem(query, set) {
    return new Promise((resolve, reject) => {
        localDB.collection("streamsItems").updateOne(query, { $set: set }, {upsert: true, safe: false}, function(err, res) {
            if(err) {
                reject(err)
            } else {
                resolve()
            }
        });
    })
}

async function upsertAssetTypes(query, set, inc) {
    return new Promise((resolve, reject) => {
        if(inc) {
            localDB.collection("assetTypes").updateOne(query, { $set: set, $inc: inc }, {upsert: true, safe: false}, function(err, res) {
                if(err) {
                    reject(err)
                } else {
                    resolve()
                }
            });
        } else {
            localDB.collection("assetTypes").updateOne(query, { $set: set }, {upsert: true, safe: false}, function(err, res) {
                if(err) {
                    reject(err)
                } else {
                    resolve()
                }
            });
        }

    })
}

async function upsertOrder(query, set) {
    return new Promise((resolve, reject) => {
        localDB.collection("orders").updateOne(query, { $set: set }, {upsert: true, safe: false}, function(err, res) {
            if(err) {
                reject(err)
            } else {
                resolve()
            }
        });
    })
}

async function searchEncryptionKey(query) {
    return new Promise((resolve, reject) => {
        localDB.collection("encryptionKeys").findOne(query, function(err, res) {
            if(err) {
                reject(err)
            } else {
                resolve(res)
            }
        });
    })
}

async function searchSecret(query) {
    return new Promise((resolve, reject) => {
        db.collection("secrets").findOne(query, function(err, res) {
            if(err) {
                reject(err)
            } else {
                resolve(res)
            }
        });
    })
}

async function searchAcceptedOrder(query) {
    return new Promise((resolve, reject) => {
        db.collection("acceptedOrders").findOne(query, function(err, res) {
            if(err) {
                reject(err)
            } else {
                resolve(res)
            }
        });
    })
}

async function searchNetwork(query) {
    return new Promise((resolve, reject) => {
        db.collection("networks").findOne(query, function(err, res) {
            if(err) {
                reject(err)
            } else {
                resolve(res)
            }
        });
    })
}

async function claimTxn(web3, atomicSwapContractAddress, hash, secret) {
    return new Promise((resolve, reject) => {
        var atomicSwapContract = web3.eth.contract(atomicSwapContractABI);
		var atomicSwap = atomicSwapContract.at(atomicSwapContractAddress);

        atomicSwap.claim(hash, secret, {
            from: web3.eth.accounts[0],
            gas: '9999999999999'
        }, function(error, txnHash){
            if(error) {
                reject(error);
            } else {
                resolve();
            }
        })
    })
}

async function blockExists(web3, blockNumber) {
    return new Promise((resolve, reject) => {
        web3.eth.getBlock(blockNumber, async (error, result) => {
            if(error) {
                reject(error)
            } else if (result == null) {
                resolve(false)
            } else {
                resolve(true)
            }
        })
    })
}



async function updateTotalSmartContracts(web3, blockNumber, totalSmartContracts) {
	fetchTxn = async (web3, txnHash) => {
		return new Promise((resolve, reject) => {
			web3.eth.getTransactionReceipt(txnHash, (error, result) => {
				if (!error && result !== null) {
					if(result.contractAddress) {
						resolve(true)
					} else {
						resolve(false)
					}
				} else {
					reject(error)
				}
			})
		});
	}

	return new Promise((resolve, reject) => {
		web3.eth.getBlock(blockNumber, async (error, result) => {
			if (!error && result !== null) {
				for(let count = 0; count < result.transactions.length; count++) {
					try {
						let isSmartContractDeploy = await fetchTxn(web3, result.transactions[count])
						if(isSmartContractDeploy) {
							totalSmartContracts++;
						}
					} catch(e) {
						reject(e)
						return;
					}
				}
				resolve(totalSmartContracts)
			} else {
				reject(error)
			}
		})
	});
}

async function indexSoloAssets(web3, blockNumber, instanceId, assetsContractAddress, impulse) {
	return new Promise((resolve, reject) => {
		var assetsContract = web3.eth.contract( assetsContractABI);
		var assets = assetsContract.at(assetsContractAddress);
		var events = assets.allEvents({fromBlock: blockNumber, toBlock: blockNumber});
		events.get(async function(error, events){
			if(error) {
				reject(error);
			} else {
				try {
					for(let count = 0; count < events.length; count++) {
						if (events[count].event === "soloAssetIssued") {
                            try {
                                await upsertSoloAsset({
                                    assetName: events[count].args.assetName,
                                    uniqueIdentifier: parseAndConvertData(events[count].args.uniqueAssetIdentifier)
                                }, {
                                    owner: events[count].args.to,
                                    status: "open"
                                })
                            } catch(e) {
                                reject(e)
                                return;
                            }

						} else if (events[count].event === "addedOrUpdatedSoloAssetExtraData") {
                            try {
                                await upsertSoloAsset({
                                    assetName: events[count].args.assetName,
                                    uniqueIdentifier: parseAndConvertData(events[count].args.uniqueAssetIdentifier)
                                }, {
                                    [events[count].args.key]: parseAndConvertData(events[count].args.value)
                                })
                            } catch(e) {
                                reject(e)
                                return;
                            }
						} else if (events[count].event === "addedOrUpdatedEncryptedDataObjectHash") {

                            async function fetchAndWriteEncryptedData(assetName, uniqueAssetIdentifier, encryptedDataHash, privateKey, publicKey, ownerPublicKey) {
                                //you are the owner
                                let dataObj = await queryImpulse({
                                    "metadata.assetName": assetName,
                                    "metadata.assetType": "solo",
                                    "metadata.identifier": uniqueAssetIdentifier,
                                    "encryptedDataHash": encryptedDataHash
                                }, privateKey, publicKey, ownerPublicKey);

                                for(let iii = 0; iii <  dataObj.queryResult.length; iii++) {
                                    let cipherText =  dataObj.queryResult[iii].encryptedData;
                                    let capsule =  dataObj.queryResult[iii].capsule;
                                    let plainObj = await decryptData(privateKey, publicKey, ownerPublicKey, capsule, cipherText, publicKey === ownerPublicKey, dataObj.derivationKey)

                                    if(plainObj) {
                                        await upsertSoloAsset({
                                            assetName: assetName,
                                            uniqueIdentifier: parseAndConvertData(uniqueAssetIdentifier)
                                        }, {
                                            [plainObj.key]: parseAndConvertData(plainObj.value)
                                        })
                                    }
                                }
                            }

                            try {
                                let publicKeyOwner = assets.getSoloAssetDetails.call(events[count].args.assetName, events[count].args.uniqueAssetIdentifier)[2]
                                let keyPair = await searchEncryptionKey({compressed_public_key_hex: publicKeyOwner})

                                //check if you are issuer of data
                                if(keyPair) {
                                    fetchAndWriteEncryptedData(
                                        events[count].args.assetName,
                                        events[count].args.uniqueAssetIdentifier,
                                        events[count].args.hash,
                                        keyPair.private_key_hex,
                                        keyPair.compressed_public_key_hex,
                                        keyPair.compressed_public_key_hex
                                    )

                                } else {
                                    //see if you have access
                                    let hasAccess = assets.hasSoloAssetEncryptedDataAccess.call(events[count].args.assetName, events[count].args.uniqueAssetIdentifier, hexToBase64(impulse.publicKey))

                                    if(hasAccess) {
                                        let privateKey = impulse.privateKey;
                                        let publicKey = impulse.publicKey;

                                        fetchAndWriteEncryptedData(
                                            events[count].args.assetName,
                                            events[count].args.uniqueAssetIdentifier,
                                            events[count].args.hash,
                                            privateKey,
                                            publicKey,
                                            publicKeyOwner
                                        )
                                    }
                                }
                            } catch(e) {
                                reject(e)
                                return;
                            }
						} else if (events[count].event === "transferredOwnershipOfSoloAsset") {
                            try {
                                await upsertSoloAsset({
                                    assetName: events[count].args.assetName,
    								uniqueIdentifier: parseAndConvertData(events[count].args.uniqueAssetIdentifier)
                                }, {
									owner: events[count].args.to
								})
                            } catch(e) {
                                reject(e)
                                return;
                            }
						} else if(events[count].event === "closedSoloAsset") {
                            try {
                                await upsertSoloAsset({
                                    assetName: events[count].args.assetName,
    								uniqueIdentifier: parseAndConvertData(events[count].args.uniqueIdentifier)
                                }, {
									status: "closed"
								})
                            } catch(e) {
                                reject(e)
                                return;
                            }
						}
					}
					resolve();
				} catch(e) {
					reject(e)
				}
			}
		})
	});
}

async function indexSoloAssetsForAudit(web3, blockNumber, instanceId, assetsContractAddress, impulse) {
	return new Promise((resolve, reject) => {
		var assetsContract = web3.eth.contract( assetsContractABI);
		var assets = assetsContract.at(assetsContractAddress);
		var events = assets.allEvents({fromBlock: blockNumber, toBlock: blockNumber});
		events.get(async function(error, events){
			if(error) {
				reject(error);
			} else {
                web3.eth.getBlock(blockNumber, async function(error, blockDetails) {
                    if(error) {
                        reject(error);
                    } else {
                        try {
        					for(let count = 0; count < events.length; count++) {
                                var eventHash = sha256(JSON.stringify(events[count]));
        						if (events[count].event === "soloAssetIssued") {
        							try {
                                        await upsertSoloAssetAuditTrail({
                                            assetName: events[count].args.assetName,
                                            uniqueIdentifier: events[count].args.uniqueAssetIdentifier,
                                            eventHash: eventHash
                                        }, {
                                            owner: events[count].args.to,
                                            status: "open",
                                            eventName: "soloAssetIssued",
                                            timestamp: parseInt(blockDetails.timestamp),
                                            transactionHash: events[count].transactionHash
                                        })

                                        await notifyClient({
                                            assetName: events[count].args.assetName,
                                            uniqueIdentifier: events[count].args.uniqueAssetIdentifier,
                                            eventHash: eventHash,
                                            owner: events[count].args.to,
                                            status: "open",
                                            eventName: "soloAssetIssued",
                                            timestamp: parseInt(blockDetails.timestamp),
                                            transactionHash: events[count].transactionHash
                                        })
        							} catch(e) {
                                        reject(e)
                                        return;
        							}
        						} else if (events[count].event === "addedOrUpdatedSoloAssetExtraData") {
        							try {
                                        await upsertSoloAssetAuditTrail({
                                            assetName: events[count].args.assetName,
                                            uniqueIdentifier: events[count].args.uniqueAssetIdentifier,
                                            eventHash: eventHash
                                        }, {
                                            eventName: "addedOrUpdatedSoloAssetExtraData",
                                            key: events[count].args.key,
                                            value: events[count].args.value,
                                            timestamp: parseInt(blockDetails.timestamp),
                                            transactionHash: events[count].transactionHash
                                        })

                                        await notifyClient({
                                            assetName: events[count].args.assetName,
                                            uniqueIdentifier: events[count].args.uniqueAssetIdentifier,
                                            eventHash: eventHash,
                                            eventName: "addedOrUpdatedSoloAssetExtraData",
                                            key: events[count].args.key,
                                            value: events[count].args.value,
                                            timestamp: parseInt(blockDetails.timestamp),
                                            transactionHash: events[count].transactionHash
                                        })
        							}
        							catch(e){
                                        reject(e)
                                        return;
        							}
        						} else if (events[count].event === "transferredOwnershipOfSoloAsset") {
                                    try {
                                        await upsertSoloAssetAuditTrail({
                                            assetName: events[count].args.assetName,
            								uniqueIdentifier: events[count].args.uniqueAssetIdentifier,
                                            eventHash: eventHash
                                        }, {
        									owner: events[count].args.to,
                                            eventName: "transferredOwnershipOfSoloAsset",
                                            timestamp: parseInt(blockDetails.timestamp),
                                            description: events[count].args.description,
                                            transactionHash: events[count].transactionHash
        								})

                                        await notifyClient({
                                            assetName: events[count].args.assetName,
            								uniqueIdentifier: events[count].args.uniqueAssetIdentifier,
                                            eventHash: eventHash,
                                            owner: events[count].args.to,
                                            eventName: "transferredOwnershipOfSoloAsset",
                                            timestamp: parseInt(blockDetails.timestamp),
                                            description: events[count].args.description,
                                            transactionHash: events[count].transactionHash
                                        })
                                    } catch(e) {
                                        reject(e)
                                        return;
                                    }
        						} else if(events[count].event === "closedSoloAsset") {
                                    try {
                                        await upsertSoloAssetAuditTrail({
                                            assetName: events[count].args.assetName,
            								uniqueIdentifier: events[count].args.uniqueIdentifier,
                                            eventHash: eventHash
                                        }, {
        									status: "closed",
                                            eventName: "closedSoloAsset",
                                            timestamp: parseInt(blockDetails.timestamp),
                                            transactionHash: events[count].transactionHash
        								})

                                        await notifyClient({
                                            assetName: events[count].args.assetName,
            								uniqueIdentifier: events[count].args.uniqueIdentifier,
                                            eventHash: eventHash,
                                            status: "closed",
                                            eventName: "closedSoloAsset",
                                            timestamp: parseInt(blockDetails.timestamp),
                                            transactionHash: events[count].transactionHash
                                        })
                                    } catch(e) {
                                        reject(e)
                                        return;
                                    }
        						} else if(events[count].event === "soloAssetAccessGranted") {
                                    try {
                                        let ownerPublicKey = assets.getSoloAssetDetails.call(events[count].args.assetName, events[count].args.uniqueAssetIdentifier)[2]
                                        let keyPair = await searchEncryptionKey({compressed_public_key_hex: ownerPublicKey})

                                        if(keyPair) {
                                            //u r the owner
                                            await upsertSoloAssetAuditTrail({
                                                assetName: events[count].args.assetName,
                								uniqueIdentifier: events[count].args.uniqueAssetIdentifier,
                                                eventHash: eventHash
                                            }, {
                                                eventName: "soloAssetAccessGranted",
                                                timestamp: parseInt(blockDetails.timestamp),
                                                transactionHash: events[count].transactionHash,
                                                publicKey: events[count].args.publicKey
            								})

                                            await notifyClient({
                                                assetName: events[count].args.assetName,
                								uniqueIdentifier: events[count].args.uniqueAssetIdentifier,
                                                eventHash: eventHash,
                                                eventName: "soloAssetAccessGranted",
                                                timestamp: parseInt(blockDetails.timestamp),
                                                transactionHash: events[count].transactionHash,
                                                publicKey: events[count].args.publicKey
                                            })
                                        } else if (hexToBase64(impulse.publicKey) === events[count].args.publicKey) {
                                            let pastEvents = await getEncryptedDataEventsOfAsset(web3, assets, events[count].args.assetName, events[count].args.uniqueAssetIdentifier)

                                            for(var iii = 0; iii < pastEvents.length; iii++) {
                                                let dataObj = await queryImpulse({
                                                    "metadata.assetName": pastEvents[iii].args.assetName,
                                                    "metadata.assetType": "solo",
                                                    "metadata.identifier": pastEvents[iii].args.uniqueAssetIdentifier,
                                                    "encryptedDataHash": pastEvents[iii].args.hash
                                                }, impulse.privateKey, impulse.publicKey, ownerPublicKey);

                                                for(let jjj = 0; jjj <  dataObj.queryResult.length; jjj++) {
                                                    let cipherText =  dataObj.queryResult[jjj].encryptedData;
                                                    let capsule =  dataObj.queryResult[jjj].capsule;
                                                    let plainObj = await decryptData(impulse.privateKey, impulse.publicKey, ownerPublicKey, capsule, cipherText, impulse.publicKey === ownerPublicKey, dataObj.derivationKey)

                                                    if(plainObj) {
                                                        await upsertSoloAsset({
                                                            assetName: pastEvents[iii].args.assetName,
                                                            uniqueIdentifier: parseAndConvertData(pastEvents[iii].args.uniqueAssetIdentifier)
                                                        }, {
                                                            [plainObj.key]: plainObj.value
                                                        })

                                                        await upsertSoloAssetAuditTrail({
                                                            assetName: pastEvents[iii].args.assetName,
                                                            uniqueIdentifier: uniqueAssetIdentifierValue,
                                                            eventHash: sha256(JSON.stringify(pastEvents[iii]))
                                                        }, {
                                                            eventName: "addedOrUpdatedEncryptedDataObjectHash",
                                                            timestamp: await getTimestampOfBlock(web3, pastEvents[iii].blockNumber),
                                                            transactionHash: pastEvents[iii].transactionHash,
                                                            key: plainObj.key,
                                                            value: plainObj.value
                                                        })

                                                        await notifyClient({
                                                            assetName: pastEvents[iii].args.assetName,
                                                            uniqueIdentifier: uniqueAssetIdentifierValue,
                                                            eventHash: sha256(JSON.stringify(pastEvents[iii])),
                                                            eventName: "addedOrUpdatedEncryptedDataObjectHash",
                                                            timestamp: await getTimestampOfBlock(web3, pastEvents[iii].blockNumber),
                                                            transactionHash: pastEvents[iii].transactionHash,
                                                            key: plainObj.key,
                                                            value: plainObj.value
                                                        })
                                                    }
                                                }
                                            }
                                        }
                                    } catch(e) {
                                        reject(e)
                                        return;
                                    }
                                } else if(events[count].event === "soloAssetAccessRevoked") {
                                    try {
                                        let publicKey = assets.getSoloAssetDetails.call(events[count].args.assetName, events[count].args.uniqueAssetIdentifier)[2]
                                        let keyPair = await searchEncryptionKey({compressed_public_key_hex: publicKey})

                                        if(keyPair) {
                                            await upsertSoloAssetAuditTrail({
                                                assetName: events[count].args.assetName,
                								uniqueIdentifier: events[count].args.uniqueAssetIdentifier,
                                                eventHash: eventHash
                                            }, {
                                                eventName: "soloAssetAccessRevoked",
                                                timestamp: parseInt(blockDetails.timestamp),
                                                transactionHash: events[count].transactionHash,
                                                publicKey: events[count].args.publicKey
            								})

                                            await notifyClient({
                                                assetName: events[count].args.assetName,
                								uniqueIdentifier: events[count].args.uniqueAssetIdentifier,
                                                eventHash: eventHash,
                                                eventName: "soloAssetAccessRevoked",
                                                timestamp: parseInt(blockDetails.timestamp),
                                                transactionHash: events[count].transactionHash,
                                                publicKey: events[count].args.publicKey
                                            })
                                        }
                                    } catch(e) {
                                        reject(e)
                                        return;
                                    }
                                } else if(events[count].event === "addedOrUpdatedEncryptedDataObjectHash") {

                                    async function fetchAndWriteEncryptedData(assetName, uniqueAssetIdentifier, encryptedDataHash, privateKey, publicKey, ownerPublicKey, eventHash, timestamp, transactionHash) {
                                        //you are the owner
                                        let dataObj = await queryImpulse({
                                            "metadata.assetName": assetName,
                                            "metadata.assetType": "solo",
                                            "metadata.identifier": uniqueAssetIdentifier,
                                            "encryptedDataHash": encryptedDataHash
                                        }, privateKey, publicKey, ownerPublicKey);

                                        for(let iii = 0; iii < dataObj.queryResult.length; iii++) {
                                            let cipherText = dataObj.queryResult[iii].encryptedData;
                                            let capsule = dataObj.queryResult[iii].capsule;
                                            let plainObj = await decryptData(privateKey, publicKey, ownerPublicKey, capsule, cipherText, publicKey === ownerPublicKey, dataObj.derivationKey)

                                            if(plainObj) {
                                                await upsertSoloAssetAuditTrail({
                                                    assetName: assetName,
                                                    uniqueIdentifier: uniqueAssetIdentifier,
                                                    eventHash: eventHash
                                                }, {
                                                    eventName: "addedOrUpdatedEncryptedDataObjectHash",
                                                    timestamp: timestamp,
                                                    transactionHash: transactionHash,
                                                    key: plainObj.key,
                                                    value: plainObj.value
                                                })

                                                await notifyClient({
                                                    assetName: assetName,
                                                    uniqueIdentifier: uniqueAssetIdentifier,
                                                    eventHash: eventHash,
                                                    eventName: "addedOrUpdatedEncryptedDataObjectHash",
                                                    timestamp: timestamp,
                                                    transactionHash: transactionHash,
                                                    key: plainObj.key,
                                                    value: plainObj.value
                                                })
                                            }
                                        }
                                    }

                                    try {
                                        let publicKey = assets.getSoloAssetDetails.call(events[count].args.assetName, events[count].args.uniqueAssetIdentifier)[2]
                                        let keyPair = await searchEncryptionKey({compressed_public_key_hex: publicKey})
                                        if(keyPair) {
                                            fetchAndWriteEncryptedData(
                                                events[count].args.assetName,
                                                events[count].args.uniqueAssetIdentifier,
                                                events[count].args.hash,
                                                keyPair.private_key_hex,
                                                keyPair.compressed_public_key_hex,
                                                keyPair.compressed_public_key_hex,
                                                eventHash,
                                                parseInt(blockDetails.timestamp),
                                                events[count].transactionHash
                                            )

                                        } else {
                                            //see if you have access
                                            let hasAccess = assets.hasSoloAssetEncryptedDataAccess.call(events[count].args.assetName, events[count].args.uniqueAssetIdentifier, hexToBase64(impulse.publicKey))
                                            let publicKeyOwner = assets.getSoloAssetDetails.call(events[count].args.assetName, events[count].args.uniqueAssetIdentifier)[2]

                                            if(hasAccess) {
                                                let privateKey = impulse.privateKey;
                                                let publicKey = impulse.publicKey;

                                                fetchAndWriteEncryptedData(
                                                    events[count].args.assetName,
                                                    events[count].args.uniqueAssetIdentifier,
                                                    events[count].args.hash,
                                                    privateKey,
                                                    publicKey,
                                                    publicKeyOwner,
                                                    eventHash,
                                                    parseInt(blockDetails.timestamp),
                                                    events[count].transactionHash
                                                )
                                            }
                                        }
                                    } catch(e) {
                                        reject(e)
                                        return;
                                    }
                                }
        					}

        					resolve();
        				} catch(e) {
        					reject(e)
        				}
                    }
                })
			}
		})
	});
}

async function indexAssets(web3, blockNumber, instanceId, assetsContractAddress) {
	return new Promise((resolve, reject) => {
		var assetsContract = web3.eth.contract(assetsContractABI);

		var assets = assetsContract.at(assetsContractAddress);
		var events = assets.allEvents({fromBlock: blockNumber, toBlock: blockNumber});
		events.get(async function(error, events){
			if(error) {
				reject(error);
			} else {
				try {
					for(let count = 0; count < events.length; count++) {
						if (events[count].event === "bulkAssetTypeCreated") {
                            await upsertAssetTypes({
                                type: "bulk",
                                assetName: events[count].args.assetName
                            }, {
                                uniqueIdentifier: events[count].args.uniqueIdentifier,
                                admin: events[count].args.admin,
                                units: 0,
                                parts: events[count].args.parts.toString(),
                                description: events[count].args.description
                            })

                            await notifyClient({
                                type: "bulk",
                                assetName: events[count].args.assetName,
                                uniqueIdentifier: events[count].args.uniqueIdentifier,
                                admin: events[count].args.admin,
                                units: 0,
                                parts: events[count].args.parts.toString(),
                                eventHash: sha256(JSON.stringify(events[count])),
                                eventName: "bulkAssetTypeCreated",
                                transactionHash: events[count].transactionHash,
                                description: events[count].args.description,
                                timestamp: await getTimestampOfBlock(web3, events[count].blockNumber)
                            })
                        } else if (events[count].event === "bulkAssetsIssued") {
                            await upsertAssetTypes({
                                type: "bulk",
                                assetName: events[count].args.assetName
                            }, {type: "bulk"}, {
                                units: events[count].args.units.toNumber()
                            })

                            var parts = assets.getBulkAssetParts.call(events[count].args.assetName)

                            await notifyClient({
                                type: "bulk",
                                assetName: events[count].args.assetName,
                                units: (new BigNumber(events[count].args.units.toNumber())).dividedBy(addZeros(1, parts)).toFixed(parseInt(parts)).toString(),
                                eventHash: sha256(JSON.stringify(events[count])),
                                eventName: "bulkAssetsIssued",
                                transactionHash: events[count].transactionHash,
                                timestamp: await getTimestampOfBlock(web3, events[count].blockNumber)
                            })
						} else if (events[count].event === "soloAssetTypeCreated") {
                            await upsertAssetTypes({
                                type: "solo",
                                assetName: events[count].args.assetName
                            }, {
                                uniqueIdentifier: events[count].args.uniqueIdentifier,
                                admin: events[count].args.authorizedIssuer,
                                description: events[count].args.description,
                                units: 0
                            })

                            await notifyClient({
                                type: "solo",
                                assetName: events[count].args.assetName,
                                uniqueIdentifier: events[count].args.uniqueIdentifier,
                                admin: events[count].args.authorizedIssuer,
                                eventHash: sha256(JSON.stringify(events[count])),
                                eventName: "soloAssetTypeCreated",
                                description: events[count].args.description,
                                transactionHash: events[count].transactionHash,
                                timestamp: await getTimestampOfBlock(web3, events[count].blockNumber)
                            })
						} else if (events[count].event === "soloAssetIssued") {
                            await upsertAssetTypes({
                                type: "solo",
                                assetName: events[count].args.assetName
                            }, {type: "solo"}, {
                                units: 1
                            })
						}
					}

					resolve();
				} catch(e) {
					reject(e)
				}
			}
		})
	});
}

async function indexOrders(web3, blockNumber, instanceId, atomicSwapContractAddress, assetsContractAddress) {
	return new Promise((resolve, reject) => {
		var atomicSwapContract = web3.eth.contract(atomicSwapContractABI);
		var atomicSwap = atomicSwapContract.at(atomicSwapContractAddress);
        var assetsContract = web3.eth.contract(assetsContractABI);
        var assets = assetsContract.at(assetsContractAddress)
		var events = atomicSwap.allEvents({fromBlock: blockNumber, toBlock: blockNumber});
		events.get(async function(error, events){
			if(error) {
				reject(error);
			} else {
				try {
					for(let count = 0; count < events.length; count++) {
						if (events[count].event === "assetLocked" || events[count].event === "assetUnlocked" || events[count].event === "assetClaimed") {
                            let atomicSwapDetails = atomicSwap.atomicSwapDetails.call(events[count].args.hash);
                            let atomicSwapOtherChainDetails = atomicSwap.atomicSwapOtherChainDetails.call(events[count].args.hash);
                            let atomicSwapStatus = atomicSwap.atomicSwapStatus.call(events[count].args.hash);
                            let atomicSwapSecret = atomicSwap.atomicSwapSecret.call(events[count].args.hash);
                            let lockPeriod = atomicSwap.atomicSwapLockPeriod.call(events[count].args.hash);
                            try {
                                await upsertOrder({
                                    instanceId: instanceId,
                            		atomicSwapHash: events[count].args.hash
                                }, {
                                    fromAddress: atomicSwapDetails[0],
                                    toAddress: atomicSwapDetails[1],
                                    fromAssetType: atomicSwapDetails[2],
                                    fromAssetName: atomicSwapDetails[3],
                                    fromAssetUnits: atomicSwapDetails[4].toString(),
                                    fromAssetParts: atomicSwapDetails[5].toString(),
                                    fromAssetId: atomicSwapDetails[6],
                                    fromLockPeriod: lockPeriod.toString(),
                                    toAssetType: atomicSwapOtherChainDetails[0],
                                    toAssetName: atomicSwapOtherChainDetails[1],
                                    toAssetUnits: atomicSwapOtherChainDetails[2].toString(),
                                    toAssetParts: atomicSwapOtherChainDetails[3].toString(),
                                    toAssetId: atomicSwapOtherChainDetails[4],
                                    toGenesisBlockHash: atomicSwapOtherChainDetails[5],
                                    status: atomicSwapStatus.toString(),
                                    secret: atomicSwapSecret
                                })

                                await notifyClient({
                                    instanceId: instanceId,
                            		atomicSwapHash: events[count].args.hash,
                                    fromAddress: atomicSwapDetails[0],
                                    toAddress: atomicSwapDetails[1],
                                    fromAssetType: atomicSwapDetails[2],
                                    fromAssetName: atomicSwapDetails[3],
                                    fromAssetUnits: (new BigNumber(atomicSwapDetails[4].toString())).dividedBy(addZeros(1,  atomicSwapDetails[5].toString())).toFixed(parseInt( atomicSwapDetails[5].toString())).toString(),
                                    fromAssetId: atomicSwapDetails[6],
                                    fromLockPeriod: lockPeriod.toString(),
                                    toAssetType: atomicSwapOtherChainDetails[0],
                                    toAssetName: atomicSwapOtherChainDetails[1],
                                    toAssetUnits: (new BigNumber(atomicSwapOtherChainDetails[2].toString())).dividedBy(addZeros(1, atomicSwapOtherChainDetails[3].toString())).toFixed(parseInt(atomicSwapOtherChainDetails[3].toString())).toString(),
                                    toAssetId: atomicSwapOtherChainDetails[4],
                                    toGenesisBlockHash: atomicSwapOtherChainDetails[5],
                                    status: atomicSwapStatus.toString(),
                                    secret: atomicSwapSecret,
                                    eventHash: sha256(JSON.stringify(events[count])),
                                    eventName: "assetLocked",
                                    transactionHash: events[count].transactionHash,
                                    timestamp: await getTimestampOfBlock(web3, events[count].blockNumber)
                                })
                            } catch(e) {
                                reject(e)
                                return;
                            }
                        }
					}

					resolve();
				} catch(e) {
					reject(e)
				}
			}
		})
	});
}

async function indexStreams(web3, blockNumber, instanceId, streamsContractAddress, impulse) {
	return new Promise((resolve, reject) => {
		var streamsContract = web3.eth.contract(streamsContractABI);
		var streams = streamsContract.at(streamsContractAddress);
		var events = streams.allEvents({fromBlock: blockNumber, toBlock: blockNumber});
		events.get(async function(error, events){
			if(error) {
				reject(error);
			} else {
				try {
					for(let count = 0; count < events.length; count++) {
						if (events[count].event === "published") {
                            async function fetchAndWriteEncryptedData(streamName, key, encryptedDataHash, privateKey, publicKey, ownerPublicKey, transactionHash) {
                                let dataObj = await queryImpulse({
                                    "metadata.streamName": streamName,
                                    "metadata.key": key,
                                    "encryptedDataHash": encryptedDataHash
                                }, privateKey, publicKey, ownerPublicKey);


                                let cipherText = dataObj.queryResult[0].encryptedData;
                                let capsule = dataObj.queryResult[0].capsule;
                                let plainObj = await decryptData(privateKey, publicKey, ownerPublicKey, capsule, cipherText, publicKey === ownerPublicKey, dataObj.derivationKey)

                                if(plainObj) {
                                    await upsertStreamItem({
                                        streamName: events[count].args.streamName,
                                        streamTimestamp: (new BigNumber(events[count].args.timestamp.toString())).toNumber()
                                    }, {
                                        key: plainObj.key,
                                        data: plainObj.value
                                    })

                                    await notifyClient({
                                        streamName: events[count].args.streamName,
                                        eventHash: sha256(JSON.stringify(events[count])),
                                        eventName: "assetLocked",
                                        key: plainObj.key,
                                        data: plainObj.value,
                                        transactionHash: events[count].transactionHash,
                                        timestamp: await getTimestampOfBlock(web3, events[count].blockNumber)
                                    })
                                }
                            }

                            try {
                                let publicKey = events[count].args.ownerPublicKey
                                let keyPair = await searchEncryptionKey({compressed_public_key_hex: base64ToHex(publicKey)})

                                if(keyPair) {
                                    console.log("You are the owner daya the data")
                                    fetchAndWriteEncryptedData(
                                        events[count].args.streamName,
                                        events[count].args.key,
                                        events[count].args.data,
                                        keyPair.private_key_hex,
                                        keyPair.compressed_public_key_hex,
                                        keyPair.compressed_public_key_hex,
                                        events[count].transactionHash
                                    )

                                } else {
                                    //see if you have access
                                    let hasAccess = events[count].args.receiverPublicKeys.split(",").includes(hexToBase64(impulse.publicKey))
                                    let publicKeyOwner = events[count].args.ownerPublicKey

                                    if(hasAccess) {
                                        let privateKey = impulse.privateKey;
                                        let publicKey = impulse.publicKey;

                                        fetchAndWriteEncryptedData(
                                            events[count].args.streamName,
                                            events[count].args.key,
                                            events[count].args.data,
                                            privateKey,
                                            publicKey,
                                            base64ToHex(publicKeyOwner),
                                            events[count].transactionHash
                                        )
                                    }
                                }
                            } catch(e) {
                                reject(e)
                                return;
                            }
                        }
					}

					resolve();
				} catch(e) {
					reject(e)
				}
			}
		})
	});
}

async function clearAtomicSwaps(web3, blockNumber, network) {
	return new Promise((resolve, reject) => {
		var atomicSwapContract = web3.eth.contract(atomicSwapContractABI);
		var atomicSwap = atomicSwapContract.at(network.atomicSwapContractAddress);
		var events = atomicSwap.allEvents({fromBlock: blockNumber, toBlock: blockNumber});
		events.get(async function(error, events){
			if(error) {
				reject(error);
			} else {
				try {
					for(let count = 0; count < events.length; count++) {
						if (events[count].event === "assetLocked") {
                            let atomicSwapDetails = atomicSwap.atomicSwapDetails.call(events[count].args.hash);
                            let atomicSwapOtherChainDetails = atomicSwap.atomicSwapOtherChainDetails.call(events[count].args.hash);
                            let atomicSwapStatus = atomicSwap.atomicSwapStatus.call(events[count].args.hash);
                            let atomicSwapSecret = atomicSwap.atomicSwapSecret.call(events[count].args.hash);
                            let genesisBlockHash = atomicSwap.genesisBlockHash.call();

                            if(genesisBlockHash != atomicSwapOtherChainDetails[5]) {
                                try {
                                    let secretDoc = await searchSecret({instanceId: network.instanceId, hash: events[count].args.hash});

                                    if(secretDoc) {
                                        await claimTxn(web3, network.atomicSwapContractAddress, events[count].args.hash, secretDoc.secret);
                                    }
                                } catch(e) {
                                    reject(e)
                                    return;
                                }
                            }
                        } else if (events[count].event === "assetClaimed") {
                            let atomicSwapDetails = atomicSwap.atomicSwapDetails.call(events[count].args.hash);
                            let atomicSwapOtherChainDetails = atomicSwap.atomicSwapOtherChainDetails.call(events[count].args.hash);
                            let atomicSwapStatus = atomicSwap.atomicSwapStatus.call(events[count].args.hash);
                            let atomicSwapSecret = atomicSwap.atomicSwapSecret.call(events[count].args.hash);
                            let genesisBlockHash = atomicSwap.genesisBlockHash.call();

                            if(genesisBlockHash != atomicSwapOtherChainDetails[5]) {
                                try {
                                    let acceptedOrder = await searchAcceptedOrder({buyerInstanceId: network.instanceId, hash: events[count].args.hash});

                                    if(acceptedOrder) {
                                        let other_network = await searchNetwork({instanceId: acceptedOrder.instanceId});

                                        if(other_network) {
                                            let web3_other = new Web3(new Web3.providers.HttpProvider(`http://${other_network.workerNodeIP}:${other_network.rpcNodePort}`));
                                            await claimTxn(web3_other, other_network.atomicSwapContractAddress, events[count].args.hash, atomicSwapSecret);
                                        }
                                    }
                                } catch(e) {
                                    reject(e)
                                    return;
                                }
                            }
                        }
					}

					resolve();
				} catch(e) {
					reject(e)
				}
			}
		})
	});
}

async function updateStreamsList(web3, blockNumber, instanceId, streamsContractAddress) {
	return new Promise((resolve, reject) => {
		var streamsContract = web3.eth.contract(streamsContractABI);
		var streams = streamsContract.at(streamsContractAddress);
		var events = streams.allEvents({fromBlock: blockNumber, toBlock: blockNumber});
		events.get(async function(error, events){
			if(error) {
				reject(error);
			} else {
				try {
					for(let count = 0; count < events.length; count++) {
						if (events[count].event === "created") {
                            try {
                                await upsertStream({
                                    streamName: events[count].args.streamName,
                                }, {
                                    streamNameHash: events[count].args.streamNameHash,
                                    admin: events[count].args.admin,
                                    description: events[count].args.description
                                })

                                await notifyClient({
                                    streamName: events[count].args.streamName,
                                    streamNameHash: events[count].args.streamNameHash,
                                    admin: events[count].args.admin,
                                    eventHash: sha256(JSON.stringify(events[count])),
                                    eventName: "created",
                                    key: plainObj.key,
                                    data: plainObj.value,
                                    description: events[count].args.description,
                                    transactionHash: events[count].transactionHash,
                                    timestamp: await getTimestampOfBlock(web3, events[count].blockNumber)
                                })
                            } catch(e) {
                                reject(e)
                                return;
                            }
                        }
					}

					resolve();
				} catch(e) {
					reject(e)
				}
			}
		})
	});
}

async function fetchAuthoritiesList (web3) {
    return new Promise((resolve, reject) => {
        web3.currentProvider.sendAsync({
    		method: "istanbul_getValidators",
    		params: [],
    		jsonrpc: "2.0",
    		id: new Date().getTime()
    	}, function(error, result) {
    		if(!error) {
                resolve(result.result)
    		} else {
                reject(error)
            }
    	})
    })
}

async function unlockAccounts(web3, db) {
    return new Promise((resolve, reject) => {
        let instanceId = process.env.instanceId;
        localDB.collection("bcAccounts").find({}).toArray(function(error, accounts) {
            if(error) {
                reject(error)
            } else {
                try {
                    for(let count = 0; count < accounts.length; count++) {
                        web3.currentProvider.send({
                            method: "personal_unlockAccount",
                            params: [accounts[count].address, accounts[count].password, 0],
                            jsonrpc: "2.0",
                            id: new Date().getTime()
                        })
                    }
                } catch(e) {
                    reject(e)
                }
                resolve();
            }
        })
    })
}

async function getSize() {
    return new Promise((resolve, reject) => {
        request(`http://127.0.0.1:6382/utility/size`, { json: false }, (err, res, body) => {
            if (err) { reject(err) }
            else {
                resolve({gethSize: JSON.parse(body).gethSize, constellationSize: JSON.parse(body).constellationSize})
            }
        });
    })
}

async function getPeers(web3) {
    return new Promise((resolve, reject) => {
        web3.currentProvider.sendAsync({
            method: "admin_peers",
            params: [],
            jsonrpc: "2.0",
            id: new Date().getTime()
        }, (error, result) => {
            if(error) {
                reject(error)
            } else {
                resolve(result.result)
            }
        })
    })
}

let txnsHistory = [];

async function indexTxns(web3, blockNumber) {
    return new Promise((resolve, reject) => {
        web3.eth.getBlock(blockNumber,  (error, blockDetails) => {
            if(!error) {
                let txns = blockDetails.transactions;
                txns.forEach(function(txn, index) {
                    txnsHistory.unshift(txn)
                    if(txnsHistory.length > 100) {
                        txnsHistory.splice(-1, 1)
                    }

                    localDB.collection("txnsHistory").updateOne({"name": "last100"}, { $set: {
                        "txns": txnsHistory
                    } }, {upsert: true, safe: false}, function(err, res) {
                        if(err) {
                            reject(err)
                        } else {
                            resolve()
                        }
                    });
                })

                if(txns.length === 0) {
                    resolve()
                }
            } else {
                reject(error)
            }
        })
    })
}

MongoClient.connect("mongodb://localhost:27017", {reconnectTries : Number.MAX_VALUE, autoReconnect : true}, function(err, database) {
    if(!err) {
        localDB = database.db("admin");
    } else {
        console.log(err)
    }
})

//MongoClient.connect("mongodb://127.0.0.1:3001", {reconnectTries : Number.MAX_VALUE, autoReconnect : true}, function(err, database) {
MongoClient.connect(Config.getMongoConnectionString(), {reconnectTries : Number.MAX_VALUE, autoReconnect : true}, function(err, database) {
    if(!err) {
        db = database.db(Config.getDatabase());
        let accountsUnlocked = false;
        let instanceId = process.env.instanceId;
        let scan = async function() {
            db.collection("networks").findOne({instanceId: instanceId}, async function(err, node) {
                if (!err && node.status === "running") {
                    callbackURL = node.callbackURL;
                    let blockToScan = (node.blockToScan ? node.blockToScan : 0);
                    let totalSmartContracts = (node.totalSmartContracts ? node.totalSmartContracts : 0);
                    let web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:8545"));

                    try {

                        if(accountsUnlocked === false) {
                            await unlockAccounts(web3, db)
                            accountsUnlocked = true
                        }

                        var blockStatus = await blockExists(web3, blockToScan); //if block doesn't exist it will throw error. For all other cases it will return true. Even if node is down

                        if(blockStatus == true) {
                            try {
                                totalSmartContracts = await updateTotalSmartContracts(web3, blockToScan, totalSmartContracts)
                                if(node.assetsContractAddress) {
                                    await indexAssets(web3, blockToScan, node.instanceId, node.assetsContractAddress)
                                    await indexSoloAssets(web3, blockToScan, node.instanceId, node.assetsContractAddress, node.impulse)
                                    await indexSoloAssetsForAudit(web3, blockToScan, node.instanceId, node.assetsContractAddress, node.impulse)
                                    var authoritiesList = await fetchAuthoritiesList(web3)
                                }

                                if(node.atomicSwapContractAddress) {
                                    await indexOrders(web3, blockToScan, node.instanceId, node.atomicSwapContractAddress)
                                    await clearAtomicSwaps(web3, blockToScan, node)
                                }

                                if(node.streamsContractAddress) {
                                    await updateStreamsList(web3, blockToScan, node.instanceId, node.streamsContractAddress)
                                    await indexStreams(web3, blockToScan, node.instanceId, node.streamsContractAddress, node.impulse)
                                }

                                if(blockToScan % 5 == 0) {
                                    var peers = await getPeers(web3, node.accounts);
                                }

                                await indexTxns(web3, blockToScan)

                                var set  = {};
                                set.blockToScan = blockToScan + 1;
                                set.totalSmartContracts = totalSmartContracts;
                                set.diskSize = await getSize();

                                if(authoritiesList) {
                                    set.currentValidators = authoritiesList;
                                }

                                if(peers) {
                                    set.connectedPeers = peers;
                                }

                                try {
                                    await updateDB(instanceId, set);
                                    setTimeout(scan, 100)
                                } catch(e) {
                                    console.log(e)
                                    setTimeout(scan, 100)
                                }

                            } catch(e) {
                                console.log(e)
                                setTimeout(scan, 1000)
                            }
                        } else {
                            setTimeout(scan, 1000)
                        }
                    } catch(e) {
                        console.log(e)
                        setTimeout(scan, 100)
                    }
                } else {
                    console.log(err)
                    setTimeout(scan, 100)
                }
            });
        }

        setTimeout(scan, 100)
    }
});

var exports = module.exports = {}
