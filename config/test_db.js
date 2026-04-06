console.log('In test_db.js, __dirname:', __dirname);
require('dotenv').config();
require('./db.js');
setTimeout(() => process.exit(0), 2000);
