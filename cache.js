'use strict'

/*      problem/
 * We don't want to re-process the
 * log records again and again
 * evertime a new record is
 * appended.
 *
 *      way/
 * We realize that most records are
 * added to the end of the log.
 * This, combined with the fact that
 * log processing is memoizable,
 * allow us to simply cache the last
 * record of the log. If the record
 * remains in the same place all
 * the new records are after it and
 * processing can start after this
 * point.
 * If, on the other hand, the record
 * is not in the same place then
 * some records have been inserted
 * into the log and so we discard
 * the entire cache and start
 * processing from the beginning
 * again.
 */
function cachedUpto(logname, recs, cache) {
    let recndx = recs.length-1
    let rec = recs[recndx]
    cache[logname] = {
        recndx: recndx,
        rec: rec,
    }
}

/*      outcome/
 * Based on our caching strategy
 * (see `cachedUpto`) we check if
 * there are new records in the log
 * and if the last record we
 * processed is different. If so, we
 * re-process the entire log
 * otherwise we only reprocess the
 * new, appended, records.
 */
function afterCached(cache, logname, recs) {
    let cr = cache[logname]
    if(!cr) return recs
    if(recs.length == cr.recndx+1) return null
    let rec = recs[cr.recndx]
    if(isEq(rec, cr.rec)) return recs.slice(cr.recndx+1)
    else return recs
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

module.exports = {
    cachedUpto: cachedUpto,
    afterCached: afterCached,
}
