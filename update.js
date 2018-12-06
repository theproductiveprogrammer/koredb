'use strict'

const ds = require('./ds')
const pr = require('./process')

/*      situation/
 * The user has asked us to add a
 * record to the log. This could be:
 *
 *  (a) Before the node has
 *  synchronized with the latest
 *  data OR
 *  (b) After the node has
 *  synchronized with the latest
 *  data
 *
 *      problem/
 * Allow the user to add log records
 * before or after synchronization.
 *
 *      way/
 * Let us think of the node as being
 * in these states:
 *
 *  stopped --> spun up --> synched up
 *
 * We can only be confident of
 * adding a log record correctly
 * after the node is 'synched up'.
 * Therefore, if the node is not
 * 'synched up' we will store the
 * log messages in a separate,
 * temporary log store that we will
 * merge once the node is 'synced up'.
 *
 *      problem/
 * The new record needs to reflect a
 * state change in the user's data.
 *
 *      way/
 * Kick off the log processing cycle
 * after adding the log record.
 */
function addRec(kd, logname, rec) {
    if(!logname || !rec) return
    let logs = kd.SYNCHED ? kd.LOGS : kd.UNSYNCHED_LOGS

    add_to_log_1(kd.WHOAMI, logs, logname, rec)
    pr.raiseNewRecsEvent(kd)


    /*      outcome/
     * As the record has to be added
     * at the head of the log, we
     * increase the `last rec
     * number` of the log and create
     * a new record id for our
     * record and add it to our
     * shard of the log
     */
    function add_to_log_1(writer, logs, logname, rec) {
        let log = alwaysGetLog(logs, logname)
        let shard = alwaysGetShard(writer, log)

        ds.setKoreFields(ds.latestRecNum(log)+1, shard.writer, rec)
        shard.records.push(rec)
    }
}



/*      outcome/
 * Get the relevant log (creating if
 * not already present)
 */
function alwaysGetLog(logs, logname) {
    let log = logs[logname]
    if(log) return log

    log = ds.log(logname)
    logs[log.name] = log

    return log
}

/*      outcome/
 * Get the writeable shard of the
 * log for us (creating if not
 * already present).
 */
function alwaysGetShard(writer, log) {
    let shard = log.shards[writer]
    if(shard) return shard

    shard = ds.shard(log.name, writer)
    log.shards[writer] = shard

    return shard
}

module.exports = {
    addRec: addRec,
}

