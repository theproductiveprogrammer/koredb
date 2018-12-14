'use strict'

const http = require('http')
const url_ = require('url')

/*      outcome/
 * Set a flag that asks us to kick
 * off a sync as soon as possible
 * because we have changed something
 * (added new logs or something) and
 * push the update info to all
 * connected clients.
 */
function syncNow(kd) {
    kd.SEND_SYNC_NOW = true
    sse_push_1(kd)
}

/*      outcome/
 * Send Synchronization Requests and
 * get server push notifications
 */
function join(connect, kd, cb) {
    if(!connect.host || !connect.port) return cb(`Connect missing host:port`)
    send_sync_reqs_1(connect, kd, cb)
    connect_to_sse_1(connect, kd)
}

/*      outcome/
 * Periodically synchronize with the given URL.
 */
function send_sync_reqs_1(connect, kd, cb) {
    let url = connectURL(connect)
    setInterval(() => {
        let diff = Date.now() - kd.LAST_SEND_AT
        if((kd.SEND_SYNC_NOW && diff > 1500) || diff > kd.REQ_PERIOD) {
            if(kd.SEND_SYNC_NOW) kd.SEND_SYNC_NOW = false
            kd.LAST_SEND_AT = Date.now()
            sendSync(url, kd, cb)
        }
    }, 500)
}

/*      outcome/
 * Connect to the given connect URL
 * and wait for SSE events. When
 * fired, trigger a sync.
 */
function connect_to_sse_1(connect, kd) {
    let url = serverpushURL(connect)
    let options = {
        method: 'GET',
        headers: {
            Connection: 'keep-alive',
        },
    }
    let req = http.request(url, options, (res) => {
        res.on('data', (chunk) => {
            syncNow(kd)
        })
    })

    req.on('error', () => {
        setTimeout(() => {
            // Reconnect if we loose
            // connection
            connect_to_sse_1(connect, kd)
        }, 1000)
    })
    req.end()
}

/*      outcome/
 * Push an event to all connected
 * cients that we may have an update
 */
function sse_push_1(kd) {
    for(let i = 0;i < kd.SERVER_PUSH_CONNECTIONS.length;i++) {
        let res = kd.SERVER_PUSH_CONNECTIONS[i]
        res.write('data: Kore Logs Updated\n\n')
    }
}

/*      outcome/
 * Send a request to synchronize
 * with the connected node, passing
 * the request to any authorization
 * hooks if provided.
 */
function sendSync(url, kd, cb) {
    let headers = {}
    if(kd.AUTHREQ) {
        kd.AUTHREQ(url, headers, (err, url_) => {
            if(err) cb(err)
            else {
                if(url_) url = url_
                send_sync_1(url, headers)
            }
        })
    } else {
        send_sync_1(url, headers)
    }

    /*      outcome/
     * Send our data (JSON-encoded)
     * to the requested URL to sync
     * up and eat up whatever data
     * it sends in response.
     */
    function send_sync_1(url, headers) {
        let data = syncData(kd, kd.CONNECT_NODE_INFO)
        if(!data) return

        data = JSON.stringify(data)

        headers['Connection'] = 'keep-alive'
        let options = {
            method: 'POST',
            headers: headers,
        }


        let req = http.request(url, options, (res) => {
            let res_data = ""
            res.setEncoding('utf8')
            res.on('data', (chunk) => {
                res_data += chunk
            })
            res.on('end', () => {
                try {
                    let data = JSON.parse(res_data)
                    xtractData(data, (err, otherNodeInfo, shards) => {
                        if(err) cb(err)
                        else {
                            kd.CONNECT_NODE_INFO = otherNodeInfo
                            if(shards && shards.length) cb(null, shards)
                        }
                    })
                } catch(e) {
                    cb(e)
                }
            })
            res.on('error', cb)
        })

        req.on('error', cb)
        req.write(data)
        req.end()
    }
}

function connectURL(connect) {
    return `http://${connect.host}:${connect.port}/kore/logs`
}

function serverpushURL(connect) {
    return `http://${connect.host}:${connect.port}/kore/sse`
}

/*      problem/
 * In order for nodes to synchronize
 * they need to exchange logs.
 * However, sending across all their
 * logs all the time seems wasteful.
 *
 *      way/
 * We support sending across log
 * records 'from' a certain point
 *
 * [ {  log: logname,
 *      writer: writer,
 *      sz: records.length,
 *      from: index,
 *      records: [...]
 *   },
 *   ...
 * ]
 *
 * How do we know from where to
 * send? Well we use the info sent
 * to us by the other node and send
 * the diff.
 *
 *      problem/
 * We have nodes that are dependent
 * on this to sync up - they have no
 * local store. If we send them
 * empty logs they may belive that
 * they are synched up when, in
 * fact, it is we who are not yet
 * synched up either.
 *
 *      way/
 * If we are not yet synched up we
 * will send across an 'unsynched'
 * flag
 *      { whoami: <uuid>
 *        unsynched: true
 *      }
 *
 *
 *      understand/
 * The combined log format therefore
 * looks like this:
 *      { whoami: <uuid>
 *        unsynched: <bool>
 *        logs: [
 *          { log: <logname>,
 *            writer: <uuid>,
 *            sz: <num of recs>,
 *            from: <index>,
 *            records: <optional array>
 *          },
 *          ...
 *        ]
 *      }
 */
function syncData(kd, otherNodeInfo) {
    if(kd.SYNCHED) return synched_data_1(kd)
    else return unsynched_data_1(kd)

    /*      outcome/
     * Check what we know about the
     * other node and send any
     * updates. If we don't know
     * anything just send our info
     * (no records). If the other
     * node has not yet synched up,
     * send all our logs.
     */
    function synched_data_1(kd) {
        if(otherNodeInfo) {
            if(otherNodeInfo.unsynched) return all_logs_1(kd)
            else return log_diff_1(otherNodeInfo.logs, kd)
        } else {
            return log_info_only_1(kd)
        }
    }

    /*      outcome/
     * Return all our logs for the
     * remote node to sync with.
     */
    function all_logs_1(kd) {
        let data = {
            whoami: kd.WHOAMI,
            unsynched: false,
            logs: [],
        }

        for(let k in kd.LOGS) {
            let log = kd.LOGS[k]
            for(let key in log.shards) {
                let shard = log.shards[key]
                data.logs.push({
                    log: shard.log,
                    writer: shard.writer,
                    sz: shard.records.length,
                    from: 0,
                    records: shard.records,
                })
            }
        }

        return data
    }

    /*      outcome/
     * Given the info of other logs,
     * we send what extra data we
     * have for each log shard.
     */
    function log_diff_1(otherLogs, kd) {
        let data = {
            whoami: kd.WHOAMI,
            unsynched: false,
            logs: [],
        }

        for(let k in kd.LOGS) {
            let log = kd.LOGS[k]
            for(let key in log.shards) {
                let shard = log.shards[key]
                let other = find_shard_1(shard, otherLogs)

                let from = 0
                if(other && other.sz) from = other.sz

                let sz = shard.records.length
                if(from >= sz) {
                    data.logs.push({
                        log: shard.log,
                        writer: shard.writer,
                        sz: from,
                        from: from,
                    })
                } else {
                    let records = shard.records.slice(from)
                    data.logs.push({
                        log: shard.log,
                        writer: shard.writer,
                        sz: sz,
                        from: from,
                        records: records,
                    })
                }
            }
        }

        return data
    }

    function find_shard_1(shard, otherLogs) {
        if(!otherLogs) return
        for(let i = 0;i < otherLogs.length;i++) {
            let log = otherLogs[i]
            if(log.logname == shard.logname &&
                log.writer == shard.writer) return log
        }
    }

    /*      outcome/
     * Return the log info that we
     * posses - don't send any
     * actual records by sending our
     * shard size in the 'from'
     * field
     */
    function log_info_only_1(kd) {
        let data = {
            whoami: kd.WHOAMI,
            unsynched: false,
            logs: [],
        }

        for(let k in kd.LOGS) {
            let log = kd.LOGS[k]
            for(let key in log.shards) {
                let shard = log.shards[key]
                data.logs.push({
                    log: shard.log,
                    writer: shard.writer,
                    sz: shard.records.length,
                    from: shard.records.length,
                })
            }
        }

        return data
    }

    /*      outcome/
     * Inform our connection who we
     * are and that we are not yet
     * synched up.
     */
    function unsynched_data_1(kd) {
        return {
            whoami: kd.WHOAMI,
            unsynched: true,
        }
    }
}

/*      outcome/
 * Given data from the other node,
 * we callback with `otherNodeInfo`
 * and any shards with available
 * records.
 */
function xtractData(data, cb) {
    let otherNodeInfo = { logs: [] }
    if(!data) {
        otherNodeInfo.unsynched = true
    } else {
        otherNodeInfo.whoami = data.whoami
        otherNodeInfo.unsynched = data.unsynched
    }
    if(otherNodeInfo.unsynched) return cb(null, otherNodeInfo)

    if(!data.logs || !data.logs.length) return cb(null, otherNodeInfo)

    for(let i = 0;i < data.logs.length;i++) {
        let curr = data.logs[i]
        otherNodeInfo.logs.push({
            log: curr.log,
            writer: curr.writer,
            sz: curr.sz,
        })
    }

    let shards = data.logs.filter((s) => s.records && s.records.length)
    cb(null, otherNodeInfo, shards)
}

/*      outcome/
 * Start a server and sync our logs
 * with incoming connections
 */
function listen(port, kd, cb) {
    let server = http.createServer((req, res) => {
        let url = url_.parse(req.url)
        if(url.pathname == '/kore/logs') incomingSync(req, res, kd, cb)
        else if(url.pathname == '/kore/sse') incomingSSE(req, res, kd, cb)
        else invalidReq(res)
    })
    server.listen(port, (err) => {
        if(err) cb(err)
    })
}

function invalidReq(res) {
    res.writeHead(400)
    res.end()
}


/*      outcome/
 * Keep track of the connections so
 * we can push updates, cleaning
 * them up on errors.
 */
function incomingSSE(req, res, kd, cb) {
    res.writeHead(200, {
        "Connection": "keep-alive",
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream",
    })
    kd.SERVER_PUSH_CONNECTIONS.push(res)
    res.on('error', () => {
        for(let i = 0;i < kd.SERVER_PUSH_CONNECTIONS.length;i++) {
            if(kd.SERVER_PUSH_CONNECTIONS[i] == req) {
                kd.SERVER_PUSH_CONNECTIONS.splice(i, 1)
                return
            }
        }
    })
}

/*      outcome/
 * Accept any incoming connections
 * with sync data, first passing
 * them to any authorization hooks
 * if provided.
 */
function incomingSync(req, res, kd, cb) {

    if(req.method != 'POST') return invalidReq(res)

    if(kd.CHECKREQ) {
        kd.CHECKREQ(req, (ok) => {
            if(!ok) cb(ok)
            else handle_sync_1(req, res, cb)
        })
    } else handle_sync_1(req, res, cb)


    function handle_sync_1(req, res, cb) {
        let req_data = ""
        req.setEncoding('utf8')
        req.on('data', (chunk) => {
            req_data += chunk
        })
        req.on('end', () => {
            try {
                let data = JSON.parse(req_data)
                xtractData(data, (err, otherNodeInfo, shards) => {
                    if(err) cb(err)
                    else {
                        if(shards && shards.length) cb(null, shards)
                        send_res_1(kd, otherNodeInfo, res, cb)
                    }
                })
            } catch(e) {
                cb(e)
            }
        })
        req.on('error', cb)
    }

    function send_res_1(kd, otherNodeInfo, res, cb) {
        let data = syncData(kd, otherNodeInfo)
        if(data) {
            data = JSON.stringify(data)
            res.on('error', cb)
            res.write(data)
        }
        res.end()
    }
}


module.exports = {
    join: join,
    listen: listen,
    syncNow: syncNow,
}
