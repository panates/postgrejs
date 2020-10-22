import * as fs from 'fs';
import * as path from 'path';

process.env.NODE_ENV = 'test';

const f = path.join(__dirname, 'db_config.json');
if (fs.existsSync(f)) {
    const config = require(f);
    process.env.DB_URL = process.env.DB_URL || config.url;
    if (process.env.SKIP_CREATE_TABLES || config.skip_create_tables)
        process.env.SKIP_CREATE_TABLES = 'true';
}
