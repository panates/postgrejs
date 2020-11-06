import assert from 'assert';
import '../_support/env';
import {parseConnectionString} from '../../src/helpers/parse-connectionstring';

describe('Parse connection string', function () {

    it('should parse simple unix sockets strings', function () {
        const cfg = parseConnectionString('/var/run/ anydb');
        assert.deepStrictEqual(cfg.host, '/var/run/');
        assert.deepStrictEqual(cfg.database, 'anydb');
    });

    it('should parse unix sockets strings', function () {
        const cfg = parseConnectionString('socket://some path/?db=any%2bdb');
        assert.deepStrictEqual(cfg.host, '/some path/');
        assert.deepStrictEqual(cfg.database, 'any+db');
    });

    it('should parse unix with auth', function () {
        let cfg = parseConnectionString('socket://me:1234@some path/?db=any db');
        assert.deepStrictEqual(cfg.host, '/some path/');
        assert.deepStrictEqual(cfg.database, 'any db');
        assert.deepStrictEqual(cfg.password, '1234');
        assert.deepStrictEqual(cfg.user, 'me');
    });

    it('should parse url', function () {
        let cfg = parseConnectionString('postgres://me:1234@localhost/any db');
        assert.deepStrictEqual(cfg.host, 'localhost');
        assert.deepStrictEqual(cfg.database, 'any db');
        assert.deepStrictEqual(cfg.password, '1234');
        assert.deepStrictEqual(cfg.user, 'me');
    });

    it('should get host from query', function () {
        let cfg = parseConnectionString('postgres://me:1234@:5555/any db?host=127.0.0.1');
        assert.deepStrictEqual(cfg.host, '127.0.0.1');
        assert.deepStrictEqual(cfg.port, 5555);
        assert.deepStrictEqual(cfg.database, 'any db');
        assert.deepStrictEqual(cfg.password, '1234');
        assert.deepStrictEqual(cfg.user, 'me');
    });

});
