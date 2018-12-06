'use strict'

const ds = require('./ds')
const db = require('./persist')
const ca = require('./cache')


/*      outcome/
 * Add a user log processing
 * function to a set of processors
 * for the requested log
 */
function addProcessor(kd, logname, options, fn){
    let processors = alwaysGetProcessors(logname, kd)

    let processor = {}
    processor.logname = logname
    if(typeof options == 'function') {
        processor.options = {}
        processor.cb = options
    } else {
        processor.options = options
        processor.cb = fn
    }

    processors.push(processor)
}

/*      outcome/
 * Get set of processors for the
 * given log (creating a new set if
 * doesn't exist)
 */
function alwaysGetProcessors(logname, kd) {
    let processors = kd.LOG_PROCESSORS[logname]
    if(!processors) {
        processors = []
        kd.LOG_PROCESSORS[logname] = processors
    }
    return processors
}


/*      outcome/
 * Process the new logs and sync/save them.
 */
function raiseNewRecsEvent(kd) {
    processUpdatedLogs(kd)
    syncUpdatedLogs(kd)
    saveUpdatedLogs(kd)
}

/*      outcome/
 * Check if there are any processors
 * for each log. If there are and
 * there are new, uncached records
 * for each log, call the processors
 * with the logs.
 */
function processUpdatedLogs(kd) {
    for(let logname in kd.LOGS) {
        let log = kd.LOGS[logname]
        let processors = kd.LOG_PROCESSORS[logname]
        if(log && processors && processors.length) {
            let all_recs = mergeShards(log)
            let remaining = ca.afterCached(kd.PROCESSOR_CACHE, logname, all_recs)
            if(remaining && remaining.length) {
                for(let i = 0;i < processors.length;i++) {
                    process(kd, processors[i], logname, all_recs, remaining)
                }
            }
            ca.cachedUpto(logname, all_recs, kd.PROCESSOR_CACHE)
        }
    }
}

/*      outcome/
 * Provide the logs to the processor
 * based on it's type - command,
 * gather, or raw(full)
 */
function process(kd, processor, logname, all_recs, remaining) {
    if(processor.commands) cmd_processor_1()
    else if(processor.gatheron) gather_processor_1()
    else full_processor_1()

    function cmd_processor_1() {
        // TODO
    }
    function gather_processor_1() {
        // TODO
    }

    /*      outcome/
     * Call the 'raw' processor
     * without any pre-processing
     * done. Also pass the
     * `remaining` records as an
     * undocumented field (useful
     * for debugging kore itself).
     */
    function full_processor_1() {
        processor.cb(null, all_recs, logname, remaining)
    }
}

function syncUpdatedLogs(kd) {
    // TODO
}

/*      outcome/
 * Walk through all the shards of
 * the logs and check if there is
 * anything remaining to be saved.
 * If there is, save it.
 */
function saveUpdatedLogs(kd) {
    if(!kd.SAVETO) return
    for(let k in kd.LOGS) {
        let log = kd.LOGS[k]
        let si = alwaysGetSaveInfo(log.name, kd)

        for(let key in log.shards) {
            let shard = log.shards[key]
            let shi = alwaysGetShardInfo(shard, si)

            save_shard_recs_1(shard, shi)
        }
    }

    /*      outcome
     * If there are new records to
     * save, write them to disk and
     * flush them.
     */
    function save_shard_recs_1(shard, shi) {
        if(shi.savedUpto >= shard.records.length) return
        db.saveTo(kd.SAVETO,
            shard,
            shard.records.slice(shi.savedUpto),
            (err) => {
                if(err) kd.ERR(err)
                else {
                    shi.savedUpto = shard.records.length
                    flush_1(shard, shi)
                }
            })
    }

    /*      problem/
     * To ensure that our data is
     * persisted, we need to flush
     * it to disk. However,
     * constantly flushing to disk
     * can make the system very
     * slow.
     *
     *      way/
     * Only flush if a certain
     * period (kd.FLUSH_PERIOD) has
     * passed. If not, launch a
     * timeout that allows other
     * writes to happen in between
     * then launch the flush.
     */
    function flush_1(shard, shi, afterTimeout) {
        if(afterTimeout) shi.flushTimer = null

        let shouldFlush = false
        if(afterTimeout) shouldFlush = true
        if(kd.FLUSH_PERIOD < Date.now() - shi.lastFlushed) shouldFlush = true

        if(shouldFlush) {
            db.flush(kd.SAVETO, shard)
            shi.lastFlushed = Date.now()
        } else {
            if(shi.flushTimer) return /* do nothing */
            shi.flushTimer = setTimeout(() => {
                flush_1(shard, shi, true)
            }, kd.FLUSH_PERIOD)
        }
    }
}

/*      problem/
 * We have loaded some logs from
 * disk and we need to keep track of
 * them so we don't attempt to
 * re-save them.
 *
 *      way/
 * We keep track of a set of
 * 'saveInfo' which holds the
 * information of each shard on
 * disk and what has been saved
 * already.
 */
function markLoaded(logs, kd) {
    for(let k in logs) {
        let log = logs[k]
        let si = alwaysGetSaveInfo(log.name, kd)
        for(let key in log.shards) {
            let shard = log.shards[key]
            let shi = alwaysGetShardInfo(shard, si)
            shi.savedUpto = shard.records.length
        }
    }
}

function alwaysGetSaveInfo(logname, kd) {
    let si = kd.SAVEINFO[logname]
    if(si) return si

    si = ds.saveInfo(logname)
    kd.SAVEINFO[logname] = si

    return si
}

function alwaysGetShardInfo(shard, si) {
    let shi = si.shardInfo[shard.writer]
    if(shi) return shi

    shi = ds.shardInfo(shard)
    si.shardInfo[shard.writer] = shi

    return shi
}

/*
 *      problem/
 * We have multiple log shards from
 * different devices at different
 * times and so on. However we need
 * a single, unified view of the
 * logs.
 *
 *      way/
 * We combine the logs into a single
 * log view by merging them
 * one-by-one into each other. To
 * make it more efficient, We start
 * with the smallest and merge it
 * with the next smallest and so on
 * until we've combined them all.
 */
function mergeShards(log) {
    let shards = get_all_shards_1(log)
    if(!shards || !shards.length) return []

    shards.sort((a,b) => a.length - b.length)

    let combined = shards[0].records
    for(let i = 1;i < shards.length;i++) {
        combined = combine_1(combined, shards[i].records)
    }
    return combined


    function get_all_shards_1(log) {
        let s = []
        for(let k in log.shards) {
            s.push(log.shards[k])
        }
        return s
    }

    /*      outcome/
     * Combine two shards into the
     * result using record number
     * (use shard writer name to
     * break ties)
     *
     * NB: This kind of merge assumes
     * that each shard is ordered
     * internally. If this assumption
     * breaks the algorithm will fail.
     */
    function combine_1(shard1, shard2) {
        let res = []

        let ndx1 = 0
        let ndx2 = 0
        while(ndx1 < shard1.length && ndx2 < shard2.length) {
            let rec1 = shard1[ndx1]
            let rec2 = shard2[ndx2]

            if(v1._korenum < v2._korenum) {
                res.push(rec1); ndx1++;
            } else if(v1._korenum > v2._korenum) {
                res.push(rec2); ndx2++;
            } else {
                if(v1._korewho < v2._korewho) {
                    res.push(rec1); ndx1++;
                } else {
                    res.push(rec2); ndx2++;
                }
            }
        }
        res = res.concat(shard1.slice(ndx1))
        res = res.concat(shard2.slice(ndx2))
        return res;
    }
}

/*      problem/
 * Given a new set of logs (loaded
 * from disk or from another node)
 * we need to merge them into our
 * existing logs so they become part
 * of our working set.
 *
 *      way/
 * If we have new logs we just add
 * them. If we have matching logs
 * it is only slightly trickier - we
 * merge the shards by taking any
 * new shards and any shards that
 * are bigger than the version we
 * have.
 */
function mergeLogs(newlogs, mylogs) {
    for(let k in newlogs) {
        if(mylogs[k]) merge_log_1(newlogs[k], mylogs[k])
        else add_log_1(newlogs[k], mylogs)
    }

    function add_log_1(newlog, mylogs) {
        mylogs[newlog.name] = newlog
    }

    function merge_log_1(newlog, mylog) {
        let newshards = newlog.shards
        let myshards = mylog.shards
        for(let k in newshards) {
            if(myshards[k]) merge_shards_1(newshards[k], myshards[k], myshards)
            else add_shard_1(newshards[k], myshards)
        }
    }

    function add_shard_1(newshard, myshards) {
        myshards[newshard.writer] = newshard
    }

    function merge_shards_1(newshard, myshard, myshards) {
        if(newshard.records.length <= myshard.records.length) return
        myshards[newshard.writer] = newshard
    }
}

module.exports = {
    addProcessor: addProcessor,
    mergeLogs: mergeLogs,
    raiseNewRecsEvent: raiseNewRecsEvent,
    markLoaded: markLoaded,
}
