import {projectRoot} from "#root/settings.js";
import Datastore from 'nedb'

/**
 * 记录专辑
 */

const db = new Datastore({
    filename: `${projectRoot}/db/file/track.db`,
    autoload: true
});


const trackDB = {}

// 插入数据
trackDB.insert = (entity) => {
    return new Promise((resolve, reject) => {
        db.insert(entity, (err, newDoc) => {
            if (err) {
                return reject(err)
            } else {
                return resolve(newDoc)
            }
        });
    })
}

trackDB.count = (query) => {
    // 计算符合条件的文档数量
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

trackDB.find = (entity, sort, limit) => {
    // 查找数据
    return new Promise((resolve, reject) => {
        let query = db.find(entity);
        if (limit) {
            query = query.limit(limit);
        }
        if (sort){
            query.sort(sort)
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

trackDB.findOne = (query) => {
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


trackDB.update = (condition, setEntity) => {
    // 更新数据
    return new Promise((resolve, reject) => {
        db.update(condition, {$set: setEntity}, (err, numReplaced) => {
            if (err) {
                return reject(err)
            } else {
                return resolve(numReplaced)
            }
        });
    })
}

// 删除数据
trackDB.remove = (condition) => {
    return new Promise((resolve, reject) => {
        db.remove(condition, {}, (err, numReplaced) => {
            if (err) {
                return reject(err)
            } else {
                return resolve(numReplaced)
            }
        });
    })
}
export {
    trackDB
}
