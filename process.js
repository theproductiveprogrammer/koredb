'use strict'

const ds = require('./ds')
const db = require('./persist')
const nw = require('./connect')
const ca = require('./cache')


/*      outcome/
 * Add a user log processing
 * function to a set of processors
 */
function addProcessor(kd, options, fn){

    let processor = {}
    if(typeof options == 'function') {
        processor.options = {}
        processor.cb = options
    } else {
        processor.options = options
        processor.cb = fn
    }

    kd.LOG_PROCESSORS.push(processor)
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
 * Provide all the log data to any
 * user processors.
 */
function processUpdatedLogs(kd) {
    if(!kd.LOG_PROCESSORS.length) return

    for(let logname in kd.LOGS) {
        let log = kd.LOGS[logname]
        let all_recs = logRecords(log)
        let remaining = ca.afterCached(kd.PROCESSOR_CACHE, logname, all_recs)
        if(remaining && remaining.length) {
            for(let i = 0;i < kd.LOG_PROCESSORS.length;i++) {
                let processor = kd.LOG_PROCESSORS[i]
                process(kd, processor, logname, all_recs, remaining)
            }
        }
        ca.cachedUpto(logname, all_recs, kd.PROCESSOR_CACHE)
    }
}

/*      outcome/
 * Gather the log if requested or
 * provide the full logs to the
 * processor.
 */
function process(kd, processor, logname, all_recs, remaining) {
    if(processor.options.gatheron) gather_processor_1()
    else full_processor_1()

    /*      outcome/
     * Walk all the logs, sending
     * command records and filtering
     * and gathering the rest as
     * requested.
     */
    function gather_processor_1() {
        let filt_rem = remaining.filter(should_process_1)
        if(!filt_rem || !filt_rem.length) return
        let gathered = []
        for(let i = 0;i < all_recs.length;i++) {
            let rec = all_recs[i]
            if(is_cmd_rec_1(rec)) {
                processor.cb(null, gathered, logname, rec)
            } else {
                if(!filtered_1(rec)) continue
                let key = rec[processor.options.gatheron]
                if(!key) continue
                add_1(i, rec, key, gathered)
            }
        }
        if(gathered.length) {
            processor.cb(null, gathered, logname)
        }
    }

    /*      outcome/
     * Find the location where this
     * record should go in the
     * sorted array. If it is
     * already present overwrite or
     * merge it (depending on user
     * options) otherwise insert it.
     */
    function add_1(rec_ndx, rec, key, gathered) {
        let ndx = rec_loc_1(key, gathered)
        if(ndx < 0) {
            gathered.splice(0, 0, rec)
            return
        }
        let r = gathered[ndx]
        if(r[processor.options.gatheron] == key) {
            if(processor.options.overwrite) gathered[ndx] = rec
            else gathered[ndx] = merge_1(rec_ndx, rec, r)
        } else {
            gathered.splice(ndx+1, 0, rec)
        }
    }

    /*      situation/
     * Because we tolerate
     * occasional disconnections
     * among our nodes it is
     * likely that sometimes we will
     * update the same record in two
     * locations.
     *
     *      problem/
     * We would like to merge the
     * results of changes across
     * multiple nodes.
     *
     *      way/
     * Instead of tracking each
     * 'branch' and merging them we
     * will try a simpler algorithm:
     * 1. If the existing record has
     *    been written by the same
     *    writer, it can simply be
     *    overwritten (you don't
     *    need to merge with
     *    yourself)
     * 2. Get the difference between
     *    the current record and
     *    it's previous record and
     *    apply that difference on
     *    the current record
     *    (transfer the `number` and
     *    `writer` fields too)
     *
     * NB: This simplification
     * doesn't work in all command
     * cases (TODO?)
     */
    function merge_1(rec_ndx, rec, curr) {
        if(curr._korewho == rec._korewho) return rec
        let diff = diff_1(rec_ndx, rec)
        let ret = {
            _korenum: rec._korenum,
            _korewho: rec._korewho,
        }
        for(let k in curr) {
            if(diff.del[k]) continue
            ret[k] = curr[k]
        }
        for(let k in diff.add) {
            ret[k] = diff.add[k]
        }
        return ret

        /*      outcome/
         * Given a particular
         * record, walk back to find
         * it's parent (previous
         * version) and return
         * the differences between
         * itself and it's parent
         */
        function diff_1(ndx, rec) {
            let parent_ = find_parent_1(ndx, rec)
            if(!parent_) return {
                add: rec,
                del: {},
            }
            let ret = {
                add: {},
                del: {},
            }
            for(let k in parent_) {
                if(rec[k] === undefined) {
                    ret.del[k] = true
                }
            }
            for(let k in rec) {
                if(!isEq(rec[k], parent_[k])) {
                    ret.add[k] = rec[k]
                }
            }
            return ret
        }

        /*      problem/
         * Find the parent (previous
         * version) of the record.
         *
         *      way/
         * Walk back until we find a
         * matching object. If the
         * object is authored by us
         * then "this is the droid we
         * are looking for"! If not,
         * we check if we have
         * branched here (we have a
         * matching record number).
         * If not, it is an
         * ancestor and hence our
         * parent.
         */
        function find_parent_1(ndx, rec) {
            let key = rec[processor.options.gatheron]
            for(ndx = ndx-1;ndx >= 0;ndx--) {
                let r = all_recs[ndx]
                if(r[processor.options.gatheron] == key) {
                    if(r._korewho == rec._korewho) return r
                    if(is_ancestor_1(ndx, rec._korewho)) return r
                }
            }

            function is_ancestor_1(ndx, who) {
                let num = all_recs[ndx]._korenum
                while(ndx > 0 && all_recs[ndx-1]._korenum == num) {
                    ndx--
                    if(all_recs[ndx]._korewho == who) return false
                }
                while(ndx < all_recs.length-1 && all_recs[ndx+1]._korenum == num) {
                    ndx++
                    if(all_recs[ndx]._korewho == who) return false
                }
                return true
            }
        }
    }

    /*      outcome/
     * Return the position of the
     * key in the sorted array or
     * the position just before the
     * key would be (if not
     * present). Can return -1 if
     * the position is before the
     * beginning of the array.
     */
    function rec_loc_1(key, arr) {
        let sz = arr.length
        if(!sz) return -1
        if(k(0) > key) return -1
        let p = 0
        for(let s = sz;s > 0;s = Math.floor(s/2)) {
            while(p+s < sz && k(p+s) <= key) p += s
        }
        return p

        function k(ndx) {
            let rec = arr[ndx]
            return rec[processor.options.gatheron]
        }
    }


    /*      outcome/
     * If there are new records
     * (after filtering), call the
     * 'raw' processor so it can
     * processes the records.
     *
     * Also pass the `remaining`
     * records as an undocumented
     * field (useful for debugging
     * kore itself).
     */
    function full_processor_1() {
        let filt_rem = remaining.filter(should_process_1)
        if(filt_rem && filt_rem.length) {
            let filt_recs = all_recs.filter(should_process_1)
            processor.cb(null, filt_recs, logname, null, filt_rem)
        }
    }

    /*      problem/
     * Is this record applicable to
     * the current processor?
     *
     *      way/
     * It should pass the filters or
     * be a command
     */
    function should_process_1(rec) {
        return is_cmd_rec_1(rec) || filtered_1(rec)
    }

    /*      outcome/
     * Check if the record passes
     * any filters in our processor
     */
    function filtered_1(rec) {
        let filter = processor.options.filter
        if(!filter) return true
        for(let k in filter) {
            if(filter[k] != rec[k]) return false
        }
        return true
    }

    /*      outcome/
     * Check if the record is marked
     * as a 'command' in our
     * processor.
     */
    function is_cmd_rec_1(rec) {
        if(!processor.options.commands) return false
        for(let i = 0;i < processor.options.commands.length;i++) {
            let cmd = processor.options.commands[i]
            if(matches_cmd_1(cmd, rec)) return true
        }
        return false

        function matches_cmd_1(cmd, rec) {
            for(let k in cmd) {
                if(rec[k] != cmd[k]) return false
            }
            return true
        }
    }

}

/*      outcome/
 * Check if two objects given are
 * equal - either because they refer
 * to the same (immutable) object or
 * because their key-values match up
 */
function isEq(o1, o2) {
    if(o1 === o2) return true
    if(typeof o1 != 'object') return false
    if(typeof o2 != 'object') return false
    let k1 = Object.keys(o1)
    let k2 = Object.keys(o2)
    if(k1.length != k2.length) return false
    for(let i = 0;i < k1.length;i++) {
        let k = k1[i]
        if(!isEq(o1[k], o2[k])) return false
    }
    return true
}


function syncUpdatedLogs(kd) {
    nw.syncNow(kd)
    // TODO: Set up Server Push
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
 * We have loaded some shards from
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
function markLoaded(shards, kd) {
    if(!shards) return
    for(let k in shards) {
        let shard = shards[k]
        let si = alwaysGetSaveInfo(shard.log, kd)
        let shi = alwaysGetShardInfo(shard, si)
        shi.savedUpto = shard.records.length
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
function logRecords(log) {
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

            if(rec1._korenum < rec2._korenum) {
                res.push(rec1); ndx1++;
            } else if(rec1._korenum > rec2._korenum) {
                res.push(rec2); ndx2++;
            } else {
                if(rec1._korewho < rec2._korewho) {
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
 * Given a new set of log shards
 * (loaded from disk or from another
 * node) we need to merge them into
 * our existing logs so they become
 * part of our working set.
 *
 *      way/
 * If they are full new logs we add
 * them. If we have matching logs we
 * see if they have extra records
 * and - if they do - we add them to
 * ours. Otherwise we ignore them
 * (should we report as errors?)
 */
function mergeShards(shards, mylogs) {
    if(!shards) return
    for(let i = 0;i < shards.length;i++) {
        let shard = shards[i]
        let mylog = mylogs[shard.log]
        if(!mylog) add_log_1(shard, mylogs)
        else {
            let myshard = mylog.shards[shard.writer]
            if(!myshard) add_shard_1(shard, mylog)
            else add_extra_recs_1(shard, myshard)
        }
    }

    function add_extra_recs_1(shard, myshard) {
        let from = shard.from ? shard.from : 0
        let mx = myshard.records.length
        if(mx < from) return
        let ofst = mx - from
        let recs = shard.records.slice(ofst)
        myshard.records = myshard.records.concat(recs)
    }

    function add_shard_1(shard, mylog) {
        if(!is_full_log_1(shard)) return
        let myshard = ds.shard(shard.log, shard.writer)
        myshard.records = shard.records

        mylog.shards[myshard.writer] = myshard
    }

    function add_log_1(shard, mylogs) {
        if(!is_full_log_1(shard)) return

        let log = ds.log(shard.log)
        let myshard = ds.shard(shard.log, shard.writer)
        myshard.records = shard.records

        log.shards[myshard.writer] = myshard
        mylogs[log.name] = log
    }

    /*      outcome/
     * Check that this is a complete
     * log by having (all) records
     */
    function is_full_log_1(shard) {
        return (!shard.from && shard.records && shard.records.length)
    }

}

module.exports = {
    addProcessor: addProcessor,
    mergeShards: mergeShards,
    raiseNewRecsEvent: raiseNewRecsEvent,
    markLoaded: markLoaded,
}
