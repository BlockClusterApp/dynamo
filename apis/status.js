var MongoClient = require("mongodb").MongoClient;
const express = require('express')
const app = express()

let instanceId = process.env.instanceId;
let db = null;

MongoClient.connect("mongodb://mongo.default.svc.cluster.local:27017", {reconnectTries : Number.MAX_VALUE, autoReconnect : true}, function(err, database) {
    if(!err) {
        db = database.db("admin");
    }
})

app.get("ping", (req, res) => {
    db.collection("networks").findOne({instanceId: instanceId}, function(err, node) {
        if(!err && node) {
            if(node.status !== "initializing") {
                db.collection("networks").updateOne({instanceId: instanceId}, { $set: {status: "running", lastPinged: Date.now()}}, function(err, res) {});
            }
        }
    })

    res.send()
})
