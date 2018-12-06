'use strict'
const fs = require('fs')
const path = require('path')

/*      outcome/
 * Save the given shard records to
 * the given folder location in a
 * 'shard file'. If the file does
 * not exist, create it with the
 * proper shard info.
 */
function saveTo(folder, shard, recs, cb) {
    let p = path.join(folder, shardFileName(shard))
    fs.stat(p, (err, stat) => {
        if(err && err.code != 'ENOENT') return cb(err)
        if(err && err.code == 'ENOENT') {
            create_shard_file_1(shard, p, (err) => {
                if(err) cb(err)
                else save_rec_ndx_1(0)
            })
        } else {
            save_rec_ndx_1(0)
        }
    })

    function create_shard_file_1(shard, p, cb) {
        fs.mkdir(folder, {recursive:true}, (err) => {
            if(err && err.code != 'EEXIST') cb(err)
            else {
                let si = {
                    log: shard.log,
                    writer: shard.writer,
                }
                let line1 = JSON.stringify(si) + '\n'
                fs.writeFile(p, line1, 'utf8', cb)
            }
        })
    }

    function save_rec_ndx_1(ndx) {
        if(ndx >= recs.length) return cb()
        let line = JSON.stringify(recs[ndx]) + '\n'
        fs.appendFile(p, line, 'utf8', (err) => {
            if(err) cb(err)
            else save_rec_ndx_1(ndx+1)
        })
    }
}

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
                    if(lines[lndx] == "") continue
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


/*      problem/
 * Flush the given shard file to
 * ensure that it is correctly
 * persisted.
 *
 *      way/
 * Flush the directory and file
 * (windows doesn't support
 * directory flushing)
 */
function flush(folder, shard) {
    flush_dir_1(folder, (err) => {
        if(err) kd.ERR(err)
        let p = path.join(folder, shardFileName(shard))
        flush_file_1(p)
    })

    function flush_dir_1(folder, cb) {
        if(process.platform === 'win32' || process.platform === 'win64') return cb()
        fs.open(folder, 'r', (err, fd) => {
            if(err) cb(err)
            else fs.fsync(fd, (err) => {
                if(err) kd.ERR(err)
                fs.close(fd, cb)
            })
        })
    }

    function flush_file_1(p) {
        fs.open(p, 'r+', (err, fd) => {
            if(err) kd.ERR(err)
            else fs.fsync(fd, (err) => {
                if(err) kd.ERR(err)
                fs.close(fd, (err) => {
                    if(err) kd.ERR(err)
                })
            })
        })
    }
}

module.exports = {
    saveTo: saveTo,
    loadFrom: loadFrom,
    flush: flush,
}
