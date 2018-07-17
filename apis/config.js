module.exports = {
    mongoUrl: process.env.MONGO_URL || "mongo.default.svc.cluster.local:27017",
    getMongoConnectionString() {
        return process.env.MONGO_URL || "mongodb://mongo.default.svc.cluster.local:27017"
    }
}
