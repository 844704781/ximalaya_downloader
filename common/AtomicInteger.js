const { Mutex } = require('async-mutex');

class _AtomicInteger {
    constructor(initialValue = 0) {
        this._value = initialValue;
        this._mutex = new Mutex();
    }

    async increment() {
        return this._mutex.runExclusive(async () => {
            return ++this._value;
        });
    }

    async decrement() {
        return this._mutex.runExclusive(async () => {
            return --this._value;
        });
    }

    async get() {
        return this._mutex.runExclusive(async () => {
            return this._value;
        });
    }

    async set(initialValue = 0) {
        return this._mutex.runExclusive(async () => {
            this._value = initialValue;
        });
    }
}

module.exports = {
    AtomicInteger: _AtomicInteger
};
