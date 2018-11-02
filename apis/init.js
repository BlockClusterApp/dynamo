let smartContracts = require("../smart-contracts/index.js");
var Wallet = require("ethereumjs-wallet");
let EthCrypto = require("eth-crypto");
let elliptic = require('elliptic');
let sha3 = require('js-sha3');
let ec = new elliptic.ec('secp256k1')
let exec = require("child_process").exec;
var base64 = require('base-64');
var Web3 = require("web3");
var MongoClient = require("mongodb").MongoClient;
var fs = require('fs');
var lightwallet = require("eth-lightwallet");
const Config = require('./config');

let instanceId = process.env.instanceId;
let db = null;
let localDB = null;

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
    localDB.collection("bcAccounts").updateOne(query, {
      $set: set
    }, {
      upsert: true,
      safe: false
    }, function(err, res) {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    });
  })
}

async function upsertNetwork(query, set) {
  return new Promise((resolve, reject) => {
    db.collection("networks").updateOne(query, {
      $set: set
    }, {
      upsert: true,
      safe: false
    }, function(err, res) {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    });
  })
}


async function insertToken(token) {
  return new Promise((resolve, reject) => {
    localDB.collection("tokens").insertOne({
      token: token
    }, function(err) {
      if (!err) {
        resolve();
      } else {
        reject();
      }
    });
  })
}

async function upsertNetworkInfo(set) {
  return new Promise((resolve, reject) => {
    localDB.collection("nodeData").updateOne({
      "type": "scanData"
    }, {
      $set: set
    }, {
      upsert: true,
      safe: false
    }, function(err, res) {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    });
  })
}

let getTxnReceipt = async (txnHash) => {
  return new Promise((resolve, reject) => {
    let web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:8545"));
    web3.eth.getTransactionReceipt(txnHash, (error, receipt) => {
      if (!error && receipt) {
        resolve();
      } else {
        reject();
      }
    });
  });
}

MongoClient.connect(Config.getMongoConnectionString(), {
  reconnectTries: Number.MAX_VALUE,
  autoReconnect: true
}, function(err, database) {
  if (!err) {
    db = database.db(Config.getDatabase());

    MongoClient.connect("mongodb://localhost:27017", {
      reconnectTries: Number.MAX_VALUE,
      autoReconnect: true
    }, function(err, database) {
      if (!err) {
        localDB = database.db("admin");

        //deploy contracts and create nodes
        let deployInitNode = function() {
          db.collection("networks").findOne({
            instanceId: instanceId
          }, function(err, node) {
            if (!err) {
              let web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:8545"));

              if (!node.genesisBlockHash) {

                localDB.collection("contracts").updateOne({
                  name: "Assets"
                }, {
                  $set: {
                    abi: smartContracts.assets.abi,
                    bytecode: smartContracts.assets.bytecode,
                    abiHash: sha3.keccak256(JSON.stringify(smartContracts.assets.abi)),
                    bytecodeHash: sha3.keccak256(JSON.stringify(smartContracts.assets.bytecode))
                  }
                }, {
                  upsert: true,
                  safe: false
                }, function(err, res) {
                  if (!err) {
                    localDB.collection("contracts").updateOne({
                      name: "Streams"
                    }, {
                      $set: {
                        abi: smartContracts.streams.abi,
                        bytecode: smartContracts.streams.bytecode,
                        abiHash: sha3.keccak256(JSON.stringify(smartContracts.streams.abi)),
                        bytecodeHash: sha3.keccak256(JSON.stringify(smartContracts.streams.bytecode))
                      }
                    }, {
                      upsert: true,
                      safe: false
                    }, function(err, res) {
                      if (!err) {
                        localDB.collection("contracts").updateOne({
                          name: "Atomic Swap"
                        }, {
                          $set: {
                            abi: smartContracts.atomicSwap.abi,
                            bytecode: smartContracts.atomicSwap.bytecode,
                            abiHash: sha3.keccak256(JSON.stringify(smartContracts.atomicSwap.abi)),
                            bytecodeHash: sha3.keccak256(JSON.stringify(smartContracts.atomicSwap.bytecode))
                          }
                        }, {
                          upsert: true,
                          safe: false
                        }, function(err, res) {
                          if (!err) {
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
                                  address: result.result,
                                  name: "Default"
                                }, {
                                  password: firstAccPass
                                })

                                web3.currentProvider.sendAsync({
                                  method: "personal_unlockAccount",
                                  params: [result.result, firstAccPass, 0],
                                  jsonrpc: "2.0",
                                  id: new Date().getTime()
                                }, (error) => {
                                  if (!error) {

                                    var genesis = fs.readFileSync('/dynamo/bcData/node/genesis.json', 'utf8');
                                    var nodekey = fs.readFileSync('/dynamo/bcData/node/geth/nodekey', 'utf8');
                                    var staticNodes = fs.readFileSync('/dynamo/bcData/node/static-nodes.json', 'utf8');
                                    var permissionedNodes = fs.readFileSync('/dynamo/bcData/node/permissioned-nodes.json', 'utf8');

                                    web3.currentProvider.sendAsync({
                                      method: "admin_nodeInfo",
                                      params: [],
                                      jsonrpc: "2.0",
                                      id: new Date().getTime()
                                    }, (error, result) => {
                                      if (!error) {
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

                                            let wallet = Wallet.generate();
                                            let private_key_hex = wallet.getPrivateKey().toString("hex");
                                            let private_key_base64 = wallet.getPrivateKey().toString("base64");
                                            let compressed_public_key_hex = EthCrypto.publicKey.compress(wallet.getPublicKey().toString("hex"))
                                            let compressed_public_key_base64 = Buffer.from(EthCrypto.publicKey.compress(wallet.getPublicKey().toString("hex")), 'hex').toString("base64")

                                            if (process.env.assetsContractAddress && process.env.atomicSwapContractAddress && process.env.streamsContractAddress && process.env.impulseContractAddress) {
                                              web3.eth.getBlock(0, async (error, block) => {
                                                if (error) {
                                                  console.log(error)
                                                  setTimeout(deployInitNode, 100)
                                                } else {
                                                  await upsertNetwork({
                                                    instanceId: instanceId,
                                                  }, {
                                                    "status": "running",
                                                    "genesisBlockHash": block.hash,
                                                    "genesisBlock": genesis,
                                                    "impulse": {
                                                      privateKey: private_key_hex,
                                                      publicKey: compressed_public_key_hex
                                                    },
                                                    "nodeId": nodeId,
                                                    "nodeEthAddress": "0x" + lightwallet.keystore._computeAddressFromPrivKey(nodekey),
                                                    "assetsContractAddress": process.env.assetsContractAddress,
                                                    "atomicSwapContractAddress": process.env.atomicSwapContractAddress,
                                                    "streamsContractAddress": process.env.streamsContractAddress,
                                                    "impulseContractAddress": process.env.impulseContractAddress
                                                  })

                                                  await upsertNetworkInfo({
                                                    "staticPeers": JSON.parse(staticNodes),
                                                    "whitelistedNodes": JSON.parse(permissionedNodes),
                                                  })

                                                  let token = instanceIDGenerate();

                                                  var impulseContract = web3.eth.contract(smartContracts.impulse.abi);
                                                  var impulse = impulseContract.at(process.env.impulseContractAddress);

                                                  console.log(impulse)

                                                  impulse.verify.sendTransaction(token, {
                                                    from: web3.eth.accounts[0],
                                                    gas: '999999999999999999'
                                                  }, async (err, txnId) => {
                                                    console.log(txid)
                                                    if(!err) {
                                                      for(;;) {
                                                        try {
                                                          await getTxnReceipt(txnId)
                                                          request({
                                                            url: `${Config.getImpulseURL()}/register`,
                                                            method: "POST",
                                                            json: {
                                                              random: token
                                                            }
                                                          }, async (error, result, body) => {
                                                            if (!error) {
                                                              if (body.message) {
                                                                await upsertNetworkInfo({
                                                                  "impulseToken": body.message
                                                                })
                                                              }
                                                              console.log(body)
                                                            } else {
                                                              console.log(error)
                                                            }
                                                          })

                                                          break;
                                                        } catch(e) {
                                                          console.log(e)
                                                          await new Promise(resolve => setTimeout(resolve, 3000));
                                                        }
                                                      }
                                                    } else {
                                                      console.log(err)
                                                    }
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

                                                                var impulseContract = web3.eth.contract(smartContracts.impulse.abi);
                                                                var streams = streamsContract.new({
                                                                  from: web3.eth.accounts[0],
                                                                  data: smartContracts.impulse.bytecode,
                                                                  gas: '999999999999999999'
                                                                }, (error, contract) => {
                                                                  var impulseContractAddress = contract.address;

                                                                  web3.eth.getBlock(0, async (error, block) => {
                                                                    if (error) {
                                                                      console.log(error)
                                                                      setTimeout(deployInitNode, 100)
                                                                    } else {
                                                                      await upsertNetwork({
                                                                        instanceId: instanceId,
                                                                      }, {
                                                                        "assetsContractAddress": assetsContractAddress,
                                                                        "atomicSwapContractAddress": atomicSwapContractAddress,
                                                                        "streamsContractAddress": streamsContractAddress,
                                                                        "impulseContractAddress": impulseContractAddress,
                                                                        "genesisBlockHash": block.hash,
                                                                        "genesisBlock": genesis,
                                                                        "nodeKey": nodekey,
                                                                        "nodeEthAddress": "0x" + lightwallet.keystore._computeAddressFromPrivKey(nodekey),
                                                                        "nodeId": nodeId,
                                                                        "status": "running",
                                                                        "impulse": {
                                                                          privateKey: private_key_hex,
                                                                          publicKey: compressed_public_key_hex
                                                                        }
                                                                      })

                                                                      let token = instanceIDGenerate();

                                                                      await upsertNetworkInfo({
                                                                        "staticPeers": JSON.parse(staticNodes),
                                                                        "whitelistedNodes": JSON.parse(permissionedNodes),
                                                                        "impulseToken": token
                                                                      })

                                                                      await insertToken(token)
                                                                    }
                                                                  })
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
                              } catch (e) {
                                console.log(e)
                                setTimeout(deployInitNode, 100)
                              }
                            })
                          } else {
                            console.log(error)
                            setTimeout(deployInitNode, 100)
                          }
                        });
                      } else {
                        console.log(error)
                        setTimeout(deployInitNode, 100)
                      }
                    });
                  } else {
                    console.log(error)
                    setTimeout(deployInitNode, 100)
                  }
                });
              }
            } else {
              console.log(err)
              setTimeout(deployInitNode, 100)
            }
          })
        }

        deployInitNode()
      } else {
        console.log(error)
      }
    })
  } else {
    console.log(error)
  }
})
