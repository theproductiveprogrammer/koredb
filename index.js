'use strict'
const ds = require('./ds')
const up = require('./update')
const pr = require('./process')
const db = require('./persist')
const nw = require('./connect')
const mi = require('./migrate')
const ca = require('./cache')

/*      outcome/
 * We initialize the kore node as
 * requested and return a reference
 * to it to the user.
 * The following options are
 * supported:
 *      saveTo: node save folder on disk
 *      connect: url of upstream node
 *      listen: listening port for other nodes
 *      checkReq: function to authenticate requests
 *      errfn: callback for errors
 *      migrate: migration function
 *      whoami: must be UUID of node
 *
 * Given the settings we set the
 * options and start up the node.
 */
function node(options) {
    let koredata = ds.KD()

    options = options ? options : {}
    koredata.ERR = errfn_1(options)
    koredata.SAVETO = saveTo_1(options)
    koredata.CONNECT = connect_1(options)
    koredata.LISTEN = listen_1(options)
    koredata.AUTHREQ = authreq_1(options)
    koredata.CHECKREQ = checkreq_1(options)
    koredata.FLUSH_PERIOD = flushperiod_1(options)
    koredata.REQ_PERIOD = reqperiod_1(options)
    koredata.MIGRATEFN = migratefn_1(options)
    koredata.WHOAMI = whoami_1(options)

    start_node_1(koredata)

    return {
        addRec: (...a) => up.addRec(koredata, ...a),
        addProcessor: (...a) => pr.addProcessor(koredata, ...a),

        recID: ds.recID,
        uuid: db.uuid,
        cachedUpto: ca.cachedUpto,
        afterCached: ca.afterCached,
    }

    /*      outcome/
     * If the user has provided us
     * with the node id we use it.
     * If not, we need to create a
     * temporary unique id that
     * identifies this node and
     * return that.
     */
    function whoami_1(options) {
        if(options.whoami) return options.whoami
    }

    /*      outcome/
     * Return the 'save to'
     * location.
     * Note that kore expects
     * complete and exclusive access
     * to this directory.
     */
    function saveTo_1(options) {
        return options.saveTo
    }

    /*      understand/
     * Expects the user to provide
     * the 'host:port' of the other
     * node to connect to.
     */
    function connect_1(options) {
        if(options.connect) {
            let hp = options.connect.split(':')
            if(hp.length == 2) {
                return {
                    host: hp[0],
                    port: hp[1],
                }
            } else {
                return { host: hp[0] }
            }
        }
    }

    /*      outcome/
     * Return the listen port option
     * given by the user
     */
    function listen_1(options) {
        return options.listen
    }

    /*      problem/
     * When listening for requests
     * we don't want to be blindly
     * accepting every incoming
     * request as that could leave
     * us open to problems.
     *
     *      way/
     * The user can specify a
     * `authReq` function that acts
     * as a hook into her
     * authentication system and
     * prepares the request.
     */
    function authreq_1(options) {
        return options.authReq
    }

    /*      problem/
     * When listening for requests
     * we don't want to be blindly
     * accepting every incoming
     * request as that could leave
     * us open to problems.
     *
     *      way/
     * The user can specify a
     * `checkReq` function that acts
     * as a hook into her
     * authentication system and
     * validates the request.
     */
    function checkreq_1(options) {
        return options.checkReq
    }

    /*      outcome/
     * Set an error function to the
     * function given by the user or
     * to `console.error`
     */
    function errfn_1(options) {
        if(typeof options.errfn == 'function') return options.errfn
        return console.error
    }

    /*      outcome/
     * Return the user-defined flush
     * period (in seconds) or a
     * default of 5 seconds
     */
    function flushperiod_1(options) {
        if(options.flush_period) return options.flush_period
        else return 5 * 1000
    }

    /*      outcome/
     * Return the user-defined
     * request sync period (in
     * seconds) or a default of 5
     * minutes.
     */
    function reqperiod_1(options) {
        if(options.req_period) return options.req_period
        else return 5 * 1000 * 60
    }

    /*      outcome/
     * Return the user-defined
     * migration function
     */
    function migratefn_1(options) {
        return options.migrate
    }

    /*      outcome/
     * If the node is not a 'hermit
     * node'  - disconnected from
     * everything, we load it's data
     * from disk, and from other
     * nodes by connecting to others
     * and listening for other
     * connections.
     *
     * If the node is a 'hermit'
     * node - who does not save
     * data, listen to other nodes
     * or connect to anyone - then
     * it starts up fully synched
     * and nothing needs to be done.
     * (Of course when it dies it's
     * data will perish with it -
     * unknown, unloved, and uncared
     * for...)
     */
    function start_node_1(kd) {
        if(is_hermit_node_1(kd)) {
            switchToSynchedMode(kd)
        } else {
            start_db_1(kd)
            start_connect_1(kd)
            start_listen_1(kd)
        }

        /*      understand/
         * A 'hermit node' listens
         * to no-one, saves nothing,
         * and connects to no one.
         */
        function is_hermit_node_1(kd) {
            if(kd.SAVETO) return false
            if(kd.CONNECT) return false
            if(kd.LISTEN) return false
            return true
        }

        function start_db_1(kd) {
            if(!kd.SAVETO) return
            db.whoami(kd.SAVETO, (err, nodeid) => {
                if(err) kd.ERR(err)
                else {
                    db.loadFrom(kd.SAVETO, (err, shards) => {
                        if(err) kd.ERR(err)
                        else {
                            if(!kd.WHOAMI) kd.WHOAMI = nodeid
                            pr.markLoaded(shards, kd)
                            pr.mergeShards(shards, kd.LOGS)
                            pr.raiseNewRecsEvent(kd)
                            switchToSynchedMode(kd)
                        }
                    })
                }
            })
        }

        function start_connect_1(kd) {
            if(!kd.CONNECT) return
            nw.join(kd.CONNECT, kd, (err, shards) => {
                if(err) kd.ERR(err)
                else {
                    pr.mergeShards(shards, kd.LOGS)
                    pr.raiseNewRecsEvent(kd)
                    switchToSynchedMode(kd)
                }
            })
        }

        function start_listen_1(kd) {
            if(!kd.LISTEN) return
            nw.listen(kd.LISTEN, kd, (err, shards) => {
                if(err) kd.ERR(err)
                else {
                    pr.mergeShards(shards, kd.LOGS)
                    pr.raiseNewRecsEvent(kd)
                    switchToSynchedMode(kd)
                }
            })
        }
    }
}

/*      problem/
 * When starting up the node could
 * be 'not-yet-synched'. It could be
 * reading from disk or waiting for
 * another node to give it data etc.
 *
 * After a (short) while - we expect -
 * the node will be synched up and we
 * can add records to the end of the
 * logs as normal. Now, when we
 * switch to the 'synched-up' mode,
 * we need to incorporate any
 * records the user may have already
 * given us in the meantime so that
 * we have all the data going
 * forward.
 *
 *      way/
 * When the user adds records before
 * we are synched up we store them
 * in separately in `UNSYNCHED_LOGS`.
 *
 * So what we do now is take all
 * these logs and move the records
 * on the top of our newly available
 * 'actual' data (this means
 * re-writing the record id's of the
 * records to put them on top). After
 * moving the logs we merge them
 * with our existing logs.
 *
 * NB: This strategy will break if
 * you do weird things like removing
 * a node for sometime from the
 * network then bringing it back
 * with old data and connecting it
 * with a node that does not have a
 * local store.
 *
 * TODO: Solve weird edge cases
 * also?
 */
function switchToSynchedMode(kd) {
    if(kd.SYNCHED) return
    kd.SYNCHED = true

    let tmplogs = kd.UNSYNCHED_LOGS
    kd.UNSYNCHED_LOGS = null
    if(!tmplogs) return

    let mylogs = kd.LOGS
    for(let k in tmplogs) {
        move_log_recs_1(mylogs[k], tmplogs[k])
    }

    let shards = xtract_shards_1(tmplogs)

    pr.mergeShards(shards, kd.LOGS)


    function xtract_shards_1(logs) {
        let shards = []
        for(let k in logs) {
            let log = logs[k]
            for(let key in log.shards) {
                shards.push(log.shards[key])
            }
        }
        return shards
    }


    /*      outcome/
     * If we have an existing log,
     * move the tmplog records on
     * top of it
     */
    function move_log_recs_1(mylog, tmplog) {
        if(!mylog) return
        let lastrecnum = ds.latestRecNum(mylog)
        let shards = tmplog.shards
        for(let k in shards) {
            move_shard_1(lastrecnum, shards[k])
        }
    }

    /*      outcome/
     * Move the records of the shard
     * by the number passed in.
     *
     *      problem/
     * We provide a `recID` function
     * that promises to generate an
     * unique identifier for the
     * record. However, if we move
     * records like this, the recID
     * could be duplicated.
     *
     *      way/
     * Look for fields that match
     * the old value of `recID` and
     * update them to the new value
     * of `recID`.
     */
    function move_shard_1(by, shard) {
        if(!by) return
        shard.from = by
        for(let i = 0;i < shard.records;i++) {
            let rec = shard.records[i]
            let rid = ds.recID(rec)
            rec._korenum += by
            for(let k in rec) {
                if(rec[k] == rid) rec[k] = ds.recID(rec)
            }
        }
    }
}


module.exports = {
    node: node,
    uuid: db.uuid,
    cachedUpto: ca.cachedUpto,
    afterCached: ca.afterCached,
}
