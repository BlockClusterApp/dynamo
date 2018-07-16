var MongoClient = require("mongodb").MongoClient;
const Config = require('./config');
let instanceId = process.env.instanceId;

MongoClient.connect(Config.getMongoConnectionString(), {reconnectTries : Number.MAX_VALUE, autoReconnect : true, useNewUrlParser: true}, function(err, database) {
    if(!err) {
        let db = database.db("admin");
        db.collection("networks").updateOne({instanceId: instanceId}, { $set: {status: "down"}}, function(err, res) {
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
})
