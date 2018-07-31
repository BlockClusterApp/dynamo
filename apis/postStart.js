var MongoClient = require("mongodb").MongoClient;
const Config = require('./config');
let instanceId = process.env.instanceId;

MongoClient.connect(Config.getMongoConnectionString(), {reconnectTries : Number.MAX_VALUE, autoReconnect : true, useNewUrlParser: true}, function(err, database) {
    if(!err) {
        let db = database.db(Config.getDatabase());
        db.collection("networks").findOne({instanceId: instanceId}, function(err, node) {
            if(!err && node) {
                if(node.status === undefined) {
                    db.collection("networks").updateOne({instanceId: instanceId}, { $set: {status: "initializing"}}, function(err, res) {
                        process.exit(0);
                    });
                } else if(node.status === "down") {
                    db.collection("networks").updateOne({instanceId: instanceId}, { $set: {status: "running"}}, function(err, res) {
                        process.exit(0);
                    });
                } else {
                    process.exit(0);
                }
            } else {
                process.exit(0);
            }
        })
    } else {
        process.exit(0);
    }
})
