module.exports = {
    mongoUrl: process.env.MONGO_URL || "mongo.default.svc.cluster.local:27017",
    getMongoConnectionString() {
        return `mongodb://${process.env.MONGO_URL || "mongo.default.svc.cluster.local:27017"}`
    }
}