import assert from 'assert';
import '../_support/env';
import {escapeIdentifier} from '../../src/helpers';

describe('Escape identifier', function () {

    function testIdentifier(str: string, required: string): void {
        assert.strictEqual(escapeIdentifier(str), required);
    }

    it('No special characters', function () {
        testIdentifier('hello world', '"hello world"');
    });

    it('Contains double quotes only', function () {
        testIdentifier('hello " world', '"hello "" world"');
    });

    it('Contains single quotes only', function () {
        testIdentifier("hello ' world", '"hello \' world"');
    });

    it('Contains backslashes only', function () {
        testIdentifier('hello \\ world', '"hello \\ world"');
    });

    it('Contains single quotes and double quotes', function () {
        testIdentifier('hello \' " world', '"hello \' "" world"');
    });

    it('Contains double quotes and backslashes', function () {
        testIdentifier('hello \\ " world', '"hello \\ "" world"');
    });

    it('Contains single quotes and backslashes', function () {
        testIdentifier("hello \\ ' world", '"hello \\ \' world"');
    });

    it('contains single quotes, double quotes, and backslashes', function () {
        testIdentifier('hello \\ \' " world', '"hello \\ \' "" world"');
    });

});
