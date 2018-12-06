'use strict'
const fs = require('fs')
const path = require('path')

/*      outcome/
 * Load all the logs we find in a
 * given location. We expect this
 * location to be 'ours' and so all
 * files in it should be our log
 * (shards).
 */
function loadFrom(folder, cb) {
    fs.readdir(folder, (err, files) => {
        if(err) {
            if(err.code == 'ENOENT') cb()
            else cb(err)
        } else {
            let paths = files.map((f) => path.join(folder, f))
            load_shards_1(paths, (err, shards) => {
                if(err) cb(err)
                else cb(null, shard_2_logs_1(shards))
            })
        }
    })

    function load_shards_1(paths, cb) {
        let shards = []
        load_path_ndx_1(0)

        function load_path_ndx_1(ndx) {
            if(ndx >= paths.length) cb(null, shards)
            else {
                let file = paths[ndx]
                if(isShardFileName(file)) {
                    deserialize(file, data, (err, shard) => {
                        shards.push(shard)
                        load_path_ndx_1(ndx+1)
                    })
                } else {
                    load_path_ndx_1(ndx+1)
                }
            }
        }
    }

    function shard_2_logs_1(shards) {
        let logs = {}
        for(let i = 0;i < shards.length;i++) {
            let shard = shards[i]
            let logname = shard.log
            let log_ = getLog(logs, logname)
            log_.shards[shard.writer] = shard
        }
        return logs
    }
}

function isShardFileName(f) {
    return /^shard-..*-..*\.kore$/.test(f)
}

function shardFileName(shard) {
    return `shard-${shard.log}-${shard.writer}.kore`
}

/*      outcome/
 * Reads all the lines from the
 * file, uses the first line as the
 * shard info and the rest as
 * records.
 */
function deserialize(file, data, cb) {
    fs.readFile(file, 'utf8', (err, data) => {
        if(err) cb(err)
        else {
            let lines = data.split('\n')
            if(lines.length < 1) return cb(`${file} is empty`)
            let lndx = 0
            try {
                let si = JSON.parse(lines[lndx])
                let shard = {
                    writer: si.writer,
                    log: si.log,
                    records: [],
                }
                if(!shard.writer) return cb(`${file} missing writer identifier`)
                if(!shard.log) return cb(`${file} missing log identifier`)
                let chk = shardFileName(shard)
                if(chk != file) return cb(`${file}: name does not match shard info`)
                for(lndx = 1;lndx < lines.length;lndx++) {
                    let rec = JSON.parse(lines[lndx])
                    if(!rec._korenum) return cb(`${file}:${lndx+1}:Missing _korenum`)
                    if(!rec._korewho) return cb(`${file}:${lndx+1}:Missing _korewho`)
                    shard.records.push(rec)
                }
                cb(null, shard)
            } catch(e) {
                cb(`${file}:${lndx+1}: Invalid JSON!`)
            }
        }
    })
}


module.exports = {
    loadFrom: loadFrom,
}
