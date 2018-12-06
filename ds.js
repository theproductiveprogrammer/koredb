'use strict'

/*      understand/
 * We keep all the data structures
 * in one location in the hope that
 * it will make understanding the
 * program easier
 *
 *  "Show me your flowcharts and
 *  conceal your tables, and I shall
 *  continue to be mystified. Show
 *  me your tables, and I won't
 *  usually need your flowcharts;
 *  they'll be obvious."
 *          - Fred Brooks
 */


/*      understand/
 * All kore data is stored in
 * this mega-structure. This is the
 * one DS to rule them all.
 */
function KD() {
    return {
        WHOAMI: null,
        SAVETO: null,
        CONNECT: null,
        LISTEN: null,
        CHECKREQ: null,
        ERR: null,

        MIGRATEFN: null,

        SYNCHED: false,
        UNSYNCHED_LOGS: {},

        LOGS: {},

        LOG_PROCESSORS: {},
        PROCESSOR_CACHE: {},
    }
}

/*      outcome/
 * Return a new log structure
 */
function log(logname) {
    return {
        name: logname,
        shards: {},
    }
}

/*      outcome/
 * Return a new shard structure
 */
function shard(logname, writer) {
    return {
        log: logname,
        writer: writer,
        records: [],
    }
}

/*      outcome/
 * Set the `kore` record fields in
 * the user's record.
 */
function setKoreFields(num, writer, rec) {
    rec._korenum = num
    rec._korewho = writer
}


/*      understand/
 * The records are ordered -
 * building on top of each other in
 * sequence (branching if multiple
 * records come in from different
 * writers). Each record therefore
 * has a built in record 'number'.
 *
 *      outcome/
 * Return the latest record
 * number - which is the latest
 * record written across all writers
 * (shards).
 */
function latestRecNum(log) {
    let shards = log.shards
    let latest = 0
    for(let k in shards) {
        let l = last_rec_num_1(shards[k])
        if(l > latest) latest = l
    }
    return latest

    function last_rec_num_1(shard) {
        let len = shard.records.lenght
        if(!len) return 0
        return shard.records[len-1]._korenum
    }
}

/*      problem/
 * A basic requirement of `kore`
 * is that every record needs to
 * be ordered.
 * A record also must belong to
 * a 'shard' - a set of records
 * that belong to a single
 * writer. Having shards ensures
 * that a node, as it writes,
 * does not step on another
 * nodes toes. (This is also the
 * reason for uniquely
 * identifying the node using
 * `whoami`).
 * Finally, it is useful to have an
 * identifier for every record in
 * many cases. This is usually an
 * auto-generated `id` in other
 * databases.
 *
 *      way/
 * We will store the `_korenum`
 * (record number) and
 * the `_korewho` (record writer) in
 * every record. We can easily
 * combine these to return a record
 * id in the `recID()` function:
 *      <recnum>-<whoami>
 */
function recID(rec) {
    return `${rec._korenum}-${rec._korewho}`
}


module.exports = {
    KD: KD,
    log: log,
    shard: shard,
    setKoreFields: setKoreFields,
    latestRecNum: latestRecNum,
    recID: recID,
}
