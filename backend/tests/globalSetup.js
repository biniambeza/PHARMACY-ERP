const { MongoMemoryReplSet } = require('mongodb-memory-server');

// Start one in-memory replica set for the whole run (transactions need a replica set).
module.exports = async () => {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  globalThis.__MONGO_REPLSET__ = replSet;
  process.env.MONGO_URI_TEST = replSet.getUri();
};
