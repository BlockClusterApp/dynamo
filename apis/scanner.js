var Web3 = require("web3");
var MongoClient = require("mongodb").MongoClient;
var db = null;
const request = require('request');
var BigNumber = require('bignumber.js');
var sha256 = require('sha256');
const Config = require('./config');

Array.prototype.remByVal = function(val) {
    for (var i = 0; i < this.length; i++) {
        if (this[i] === val) {
            this.splice(i, 1);
            i--;
        }
    }
    return this;
}

let smartContracts = require("../smart-contracts/index.js");

var assetsContractABI = smartContracts.assets.abi;
var atomicSwapContractABI = smartContracts.atomicSwap.abi;
var streamsContractABI = smartContracts.streams.abi;

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
        db.collection("soloAssets").updateOne(query, { $set: set }, {upsert: true, safe: false}, function(err, res) {
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
        db.collection("soloAssetAudit").updateOne(query, { $set: set }, {upsert: true, safe: false}, function(err, res) {
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
        db.collection("streams").updateOne(query, { $set: set }, {upsert: true, safe: false}, function(err, res) {
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
        db.collection("streamsItems").updateOne(query, { $set: set }, {upsert: true, safe: false}, function(err, res) {
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
            db.collection("assetTypes").updateOne(query, { $set: set, $inc: inc }, {upsert: true, safe: false}, function(err, res) {
                if(err) {
                    reject(err)
                } else {
                    resolve()
                }
            });
        } else {
            db.collection("assetTypes").updateOne(query, { $set: set }, {upsert: true, safe: false}, function(err, res) {
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
        db.collection("orders").updateOne(query, { $set: set }, {upsert: true, safe: false}, function(err, res) {
            if(err) {
                reject(err)
            } else {
                resolve()
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
                console.log(result.transactions)
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

async function indexSoloAssets(web3, blockNumber, instanceId, assetsContractAddress) {
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
								let number = new BigNumber(events[count].args.uniqueAssetIdentifier)
                                try {
                                    await upsertSoloAsset({
                                        instanceId: instanceId,
                                        assetName: events[count].args.assetName,
    									uniqueIdentifier: number.toNumber()
                                	}, {
                                        owner: events[count].args.to,
                                        status: "open"
                                    })
                                } catch(e) {
                                    reject(e)
                                    return;
                                }
							} catch(e) {
                                try {
                                    await upsertSoloAsset({
                                        instanceId: instanceId,
                                        assetName: events[count].args.assetName,
    									uniqueIdentifier: events[count].args.uniqueAssetIdentifier
                                	}, {
                                        owner: events[count].args.to,
										status: "open"
									})
                                } catch(e) {
                                    reject(e)
                                    return;
                                }
							}
						} else if (events[count].event === "addedOrUpdatedSoloAssetExtraData") {
							try {
								var uniqueAssetIdentifierValue = new BigNumber(events[count].args.uniqueAssetIdentifier)
								uniqueAssetIdentifierValue = uniqueAssetIdentifierValue.toNumber()
							} catch(e) {
								uniqueAssetIdentifierValue = events[count].args.uniqueAssetIdentifier
							}

							try {
								let number = new BigNumber(events[count].args.value)
                                try {
                                    await upsertSoloAsset({
                                        instanceId: instanceId,
                                        assetName: events[count].args.assetName,
    									uniqueIdentifier: uniqueAssetIdentifierValue
                                	}, {
										[events[count].args.key]: number.toNumber()
									})
                                } catch(e) {
                                    reject(e)
                                    return;
                                }
							}
							catch(e){
                                try {
                                    await upsertSoloAsset({
                                        instanceId: instanceId,
                                        assetName: events[count].args.assetName,
    									uniqueIdentifier: uniqueAssetIdentifierValue
                                	}, {
										[events[count].args.key]: events[count].args.value
									})
                                } catch(e) {
                                    reject(e)
                                    return;
                                }
							}
						} else if (events[count].event === "transferredOwnershipOfSoloAsset") {
							try {
								var uniqueAssetIdentifierValue = new BigNumber(events[count].args.uniqueAssetIdentifier)
								uniqueAssetIdentifierValue = uniqueAssetIdentifierValue.toNumber()
							} catch(e) {
								uniqueAssetIdentifierValue = events[count].args.uniqueAssetIdentifier
							}

                            try {
                                await upsertSoloAsset({
                                    instanceId: instanceId,
                                    assetName: events[count].args.assetName,
    								uniqueIdentifier: uniqueAssetIdentifierValue
                                }, {
									owner: events[count].args.to
								})
                            } catch(e) {
                                reject(e)
                                return;
                            }
						} else if(events[count].event === "closedSoloAsset") {
							try {
								var uniqueAssetIdentifierValue = new BigNumber(events[count].args.uniqueAssetIdentifier)
								uniqueAssetIdentifierValue = uniqueAssetIdentifierValue.toNumber()
							} catch(e) {
								uniqueAssetIdentifierValue = events[count].args.uniqueAssetIdentifier
							}

                            try {
                                await upsertSoloAsset({
                                    instanceId: instanceId,
                                    assetName: events[count].args.assetName,
    								uniqueIdentifier: uniqueAssetIdentifierValue
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

async function indexSoloAssetsForAudit(web3, blockNumber, instanceId, assetsContractAddress) {
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
                                            instanceId: instanceId,
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
        							} catch(e) {
                                        reject(e)
                                        return;
        							}
        						} else if (events[count].event === "addedOrUpdatedSoloAssetExtraData") {
        							try {
                                        await upsertSoloAssetAuditTrail({
                                            instanceId: instanceId,
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
        							}
        							catch(e){
                                        reject(e)
                                        return;
        							}
        						} else if (events[count].event === "transferredOwnershipOfSoloAsset") {
                                    try {
                                        await upsertSoloAssetAuditTrail({
                                            instanceId: instanceId,
                                            assetName: events[count].args.assetName,
            								uniqueIdentifier: events[count].args.uniqueAssetIdentifier,
                                            eventHash: eventHash
                                        }, {
        									owner: events[count].args.to,
                                            eventName: "transferredOwnershipOfSoloAsset",
                                            timestamp: parseInt(blockDetails.timestamp),
                                            transactionHash: events[count].transactionHash
        								})
                                    } catch(e) {
                                        reject(e)
                                        return;
                                    }
        						} else if(events[count].event === "closedSoloAsset") {
                                    try {
                                        await upsertSoloAssetAuditTrail({
                                            instanceId: instanceId,
                                            assetName: events[count].args.assetName,
            								uniqueIdentifier: events[count].args.uniqueIdentifier,
                                            eventHash: eventHash
                                        }, {
        									status: "closed",
                                            eventName: "closedSoloAsset",
                                            timestamp: parseInt(blockDetails.timestamp),
                                            transactionHash: events[count].transactionHash
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
                console.log("Error inside indexAssets at :" + Date.now())
                console.log(error)
				reject(error);
			} else {
				try {
					for(let count = 0; count < events.length; count++) {
						if (events[count].event === "bulkAssetTypeCreated") {
                            await upsertAssetTypes({
                                instanceId: instanceId,
                                type: "bulk",
                                assetName: events[count].args.assetName
                            }, {
                                uniqueIdentifier: events[count].args.uniqueIdentifier,
                                admin: events[count].args.admin,
                                units: 0,
                                parts: events[count].args.parts.toString()
                            })
                        } else if (events[count].event === "bulkAssetsIssued") {
                            await upsertAssetTypes({
                                instanceId: instanceId,
                                type: "bulk",
                                assetName: events[count].args.assetName
                            }, {type: "bulk"}, {
                                units: events[count].args.units.toNumber()
                            })
						} else if (events[count].event === "soloAssetTypeCreated") {
                            await upsertAssetTypes({
                                instanceId: instanceId,
                                type: "solo",
                                assetName: events[count].args.assetName
                            }, {
                                uniqueIdentifier: events[count].args.uniqueIdentifier,
                                admin: events[count].args.authorizedIssuer,
                                units: 0
                            })
						} else if (events[count].event === "soloAssetIssued") {
                            await upsertAssetTypes({
                                instanceId: instanceId,
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

async function indexOrders(web3, blockNumber, instanceId, atomicSwapContractAddress) {
	return new Promise((resolve, reject) => {
		var atomicSwapContract = web3.eth.contract(atomicSwapContractABI);
		var atomicSwap = atomicSwapContract.at(atomicSwapContractAddress);
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
                                    fromAssetId: atomicSwapDetails[5],
                                    fromLockPeriod: atomicSwapDetails[6].toString(),
                                    toAssetType: atomicSwapOtherChainDetails[0],
                                    toAssetName: atomicSwapOtherChainDetails[1],
                                    toAssetUnits: atomicSwapOtherChainDetails[2].toString(),
                                    toAssetId: atomicSwapOtherChainDetails[3],
                                    toGenesisBlockHash: atomicSwapOtherChainDetails[4],
                                    status: atomicSwapStatus.toString(),
                                    secret: atomicSwapSecret
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

async function indexStreams(web3, blockNumber, instanceId, streamsContractAddress) {
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
                            try {
                                await upsertStreamItem({
                                    instanceId: instanceId,
                                    streamName: events[count].args.streamName,
                                    streamTimestamp: (new BigNumber(events[count].args.timestamp.toString())).toNumber()
                                }, {
                                    key: events[count].args.key,
                                    data: events[count].args.data
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

                            if(genesisBlockHash != atomicSwapOtherChainDetails[4]) {
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

                            if(genesisBlockHash != atomicSwapOtherChainDetails[4]) {
                                try {
                                    let acceptedOrder = await searchAcceptedOrder({buyerInstanceId: network.instanceId, hash: events[count].args.hash});

                                    if(acceptedOrder) {
                                        let other_network = await searchNetwork({instanceId: acceptedOrder.instanceId});

                                        if(other_network) {
                                            let web3_other = new Web3(new Web3.providers.HttpProvider("http://" + other_network.clusterIP + ":8545"));
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
                                    instanceId: instanceId,
                                    streamName: events[count].args.streamName,
                                }, {
                                    streamNameHash: events[count].args.streamNameHash,
                                    admin: events[count].args.admin
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
        db.collection("bcAccounts").find({instanceId: instanceId}).toArray(function(error, accounts) {
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
        request(`http://127.0.0.1:6382/api/node/${process.env.instanceId}/utility/size`, { json: false }, (err, res, body) => {
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

async function addPeers(web3, peers) {
    return new Promise((resolve, reject) => {
        for(var count = 0; count < accounts.length; count++) {
            web3.currentProvider.sendAsync({
                method: "admin_addPeer",
                params: [peers[count]],
                jsonrpc: "2.0",
                id: new Date().getTime()
            }, () => {})
        }
        resolve();
    })
}

//MongoClient.connect("mongodb://127.0.0.1:3001", {reconnectTries : Number.MAX_VALUE, autoReconnect : true}, function(err, database) {
MongoClient.connect(Config.getMongoConnectionString(), {reconnectTries : Number.MAX_VALUE, autoReconnect : true}, function(err, database) {
    if(!err) {
        db = database.db("admin");
        let accountsUnlocked = false;
        let instanceId = process.env.instanceId;
        let scan = async function() {
            db.collection("networks").findOne({instanceId: instanceId}, async function(err, node) {
                if (!err) {

                    let blockToScan = (node.blockToScan ? node.blockToScan : 0);
                    let totalSmartContracts = (node.totalSmartContracts ? node.totalSmartContracts : 0);
                    let web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:8545"));

                    console.log("Starting to Scan Block # " + blockToScan)

                    try {

                        if(accountsUnlocked === false) {
                            await unlockAccounts(web3, db)
                            accountsUnlocked = true
                        }

                        var blockStatus = await blockExists(web3, blockToScan); //if block doesn't exist it will throw error. For all other cases it will return true. Even if node is down

                        console.log("Block Status of # " + blockToScan + " is " + blockStatus)

                        if(blockStatus == true) {
                            try {
                                totalSmartContracts = await updateTotalSmartContracts(web3, blockToScan, totalSmartContracts)
                                console.log(`Total smart contract scanned for ${blockToScan}`)
                                if(node.assetsContractAddress) {
                                    await indexAssets(web3, blockToScan, node.instanceId, node.assetsContractAddress)
                                    console.log(`Total index assets scanned for ${blockToScan}`)
                                    await indexSoloAssets(web3, blockToScan, node.instanceId, node.assetsContractAddress)
                                    await indexSoloAssetsForAudit(web3, blockToScan, node.instanceId, node.assetsContractAddress)
                                    var authoritiesList = await fetchAuthoritiesList(web3)
                                }

                                if(node.atomicSwapContractAddress) {
                                    await indexOrders(web3, blockToScan, node.instanceId, node.atomicSwapContractAddress)
                                    await clearAtomicSwaps(web3, blockToScan, node)
                                }

                                if(node.streamsContractAddress) {
                                    await updateStreamsList(web3, blockToScan, node.instanceId, node.streamsContractAddress)
                                    await indexStreams(web3, blockToScan, node.instanceId, node.streamsContractAddress)
                                }

                                if(blockToScan % 5 == 0) {
                                    if(node.staticPeers) {
                                        await addPeers(web3, node.staticPeers)
                                    }

                                    var peers = await getPeers(web3, node.accounts);
                                }

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
                                } catch(e) {
                                    console.log(e)
                                    setTimeout(scan, 100)
                                    return;
                                }

                            } catch(e) {
                                console.log(e)
                            }

                            setTimeout(scan, 1000)
                        } else {
                            console.log("Block Exists: " + blockStatus + ", " + blockToScan + ", Timestamp: " + Date.now())
                            setTimeout(scan, 1000)
                            return;
                        }
                    } catch(e) {
                        console.log(e)
                    }

                    setTimeout(scan, 100)
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
