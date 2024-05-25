const Datastore = require('nedb');
const { config } = require('../common/config.js');
const os = require('os');
const path = require('path');

const db = new Datastore({
    filename : path.join(config.xmd.replace('~', os.homedir()), 'db', 'file', 'track.db'),
    autoload: true
});

const trackdb = {};

trackdb.insert = (entity) => {
    return new Promise((resolve, reject) => {
        db.insert(entity, (err, newDoc) => {
            if (err) {
                return reject(err);
            } else {
                return resolve(newDoc);
            }
        });
    });
};

trackdb.count = (query) => {
    return new Promise((resolve, reject) => {
        db.count(query, (err, count) => {
            if (err) {
                return reject(err);
            } else {
                return resolve(count);
            }
        });
    });
};

trackdb.find = (entity, sort, limit) => {
    return new Promise((resolve, reject) => {
        let query = db.find(entity);
        if (limit) {
            query = query.limit(limit);
        }
        if (sort){
            query.sort(sort);
        }
        query.exec((err, docs) => {
            if (err) {
                return reject(err);
            } else {
                return resolve(docs);
            }
        });
    });
};

trackdb.findOne = (query) => {
    return new Promise((resolve, reject) => {
        db.findOne(query, (err, doc) => {
            if (err) {
                return reject(err);
            } else {
                return resolve(doc);
            }
        });
    });
};

trackdb.update = (condition, setEntity) => {
    return new Promise((resolve, reject) => {
        db.update(condition, { $set: setEntity }, (err, numReplaced) => {
            if (err) {
                return reject(err);
            } else {
                return resolve(numReplaced);
            }
        });
    });
};

trackdb.remove = (condition) => {
    return new Promise((resolve, reject) => {
        db.remove(condition, {}, (err, numReplaced) => {
            if (err) {
                return reject(err);
            } else {
                return resolve(numReplaced);
            }
        });
    });
};

module.exports = {
    trackdb
};
