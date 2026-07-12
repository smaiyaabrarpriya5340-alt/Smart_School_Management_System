const mongoose = require('mongoose');

function formatMongoConnectionError(error, uri) {
  const rawMessage = error && error.message ? error.message : String(error);
  const isAtlasUri = typeof uri === 'string' && uri.startsWith('mongodb+srv://');

  if (!process.env.MONGO_URI) {
    return 'MONGO_URI is not set in .env. Add your Atlas connection string or a local MongoDB URI.';
  }

  if (rawMessage.includes('Authentication failed') || rawMessage.includes('bad auth')) {
    return 'MongoDB authentication failed. Check the database username and password in MONGO_URI.';
  }

  if (rawMessage.includes('querySrv ENOTFOUND') || rawMessage.includes('getaddrinfo ENOTFOUND')) {
    return 'MongoDB DNS lookup failed. Check the Atlas hostname in MONGO_URI.';
  }

  if (rawMessage.includes('ECONNREFUSED 127.0.0.1:27017')) {
    return 'Local MongoDB is not running on 127.0.0.1:27017. Start mongod or set MONGO_URI to Atlas.';
  }

  if (isAtlasUri && (rawMessage.includes('buffering timed out') || rawMessage.includes('Server selection timed out'))) {
    return 'Atlas connection timed out. Usually this means your IP is not on the Atlas IP Access List or the cluster is paused.';
  }

  if (isAtlasUri && (rawMessage.includes('ECONNREFUSED') || rawMessage.includes('ENETUNREACH'))) {
    return 'Atlas connection failed because the cluster is not reachable from this machine. Check IP Access List and network access.';
  }

  return `MongoDB connection failed: ${rawMessage}`;
}

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ssms';

  if (!process.env.MONGO_URI) {
    console.warn('MONGO_URI is not set. Falling back to local MongoDB at mongodb://127.0.0.1:27017/ssms');
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);

  console.log('Connected to MongoDB');
}

module.exports = connectDB;
module.exports.formatMongoConnectionError = formatMongoConnectionError;
