import Datastore from 'nedb'
import {config} from '../common/config.js'
import os from 'os'
import path from 'path'
/**
 * 记录专辑
 */

// config.json 缺 xmd 字段时兜底，否则这里的 replace 会抛 TypeError
const xmdHome = String(config.xmd || '~/.xmd').replace('~', os.homedir())

const db = new Datastore({
    filename : path.join(xmdHome, 'db', 'file', 'track.db'),
    autoload: true
});

// 章节查询几乎全部按 albumId / trackId 过滤，建索引避免全表扫描
db.ensureIndex({fieldName: 'albumId'}, () => {
})
db.ensureIndex({fieldName: 'trackId'}, () => {
})


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

/**
 * 批量更新
 *
 * nedb 的 update 默认 multi: false，一次只改一条文档。
 * 暂停任务时要把一批 status=downloading 的章节统一改回 pending，
 * 必须用这个 multi 版本。
 * @param condition 查询条件
 * @param setEntity $set 的内容
 * @returns {Promise<number>} 受影响行数
 */
trackDB.updateMulti = (condition, setEntity) => {
    return new Promise((resolve, reject) => {
        db.update(condition, {$set: setEntity}, {multi: true}, (err, numReplaced) => {
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
