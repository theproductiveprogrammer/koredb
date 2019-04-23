'use strict'
const http = require('http')
const fs = require('fs')
const path = require('path')

const kore = require('../')

/*      outcome/
 * We have a simple test server that allows us to call all `kore`
 * functions and check their results via a HTML interface.
 */
function main() {
    let cfg = loadConfig()
    serveTestSite(cfg)
}

function loadConfig() {
    let cfg = {}
    if(process.env.PORT) {
        cfg.PORT = process.env.PORT
    } else {
        cfg.PORT = "8888"
    }

    return cfg
}

/*      outcome/
 * Launch a HTTP site that serves the testing HTML interface (test.html)
 * and handles aip calls and SSE requests from that page.
 */
function serveTestSite(cfg) {
    http.createServer((req, res) => {

        if(req.url == '/') send_test_html_1(req, res)

        else if(req.url.startsWith("/kore-test/")) callKoreFns(req, res)

        else if(req.url == '/test-sse') setSSERequestor(req, res)

        else send_req_file_1(req, res)

    }).listen(cfg.PORT, () => {
        console.log(`Test server running on ${cfg.PORT}`)
    })

    function send_test_html_1(req, res) {
        let testInterface = path.join(__dirname, 'test.html')
        let stream = fs.createReadStream(testInterface)
        stream.pipe(res)
        stream.on('error', (err) => {
            console.log(e)
            sendErr(500, `Unexpected Error: No 'test.html' found!`, res)
        })
    }

    function send_req_file_1(req, res) {
        let mt = {
            css: 'text/css',
        }

        let p = path.join(__dirname, req.url)
        let type_ = path.extname(p).substring(1)

        let stream = fs.createReadStream(p)
        if(mt[type_]) res.setHeader('Content-Type', mt[type_])
        stream.pipe(res)
        stream.on('error', (err) => {
            console.log(err)
            sendErr(400, `'${req.url}' not found`, res)
        })
    }
}

function sendErr(code, msg, res) {
    res.statusCode = code
    res.end(msg)
}

function callKoreFns(req, res) {
    let m = {
        uuid: uuid,
        startNode: startNode,

        authReq: authReq,
        addRec: addRec,
    }

    let r = req.url.substring('/kore-test/'.length)
    let fn = m[r]
    if(fn) fn(req, res)
    else {
        let msg = `Did not understand '${r}'`
        console.log(msg)
        sendErr(400, msg, res)
    }
}

function uuid(req, res){
    res.end(kore.uuid())
}

let node
function startNode(req, res){
    withPostData(req, res, (data) => {
        data.errfn = (err) => {
            sendSSEMsg(JSON.stringify({error: err}))
            console.error(err)
        }
        if(data.saveTo) {
            data.saveTo = path.join(process.argv[1], 'data', data.saveTo)
        }
        node = kore.node(data)
        node.addProcessor((err, recs, logname, cmd, rem) => {
            sendSSEMsg({
                err: err,
                recs: recs,
                logname: logname,
                remaining: rem,
            })
        })
        node.addProcessor({filter: {type:'contact'}},
            (err, contacts, logname, cmd, rem) => {
            sendSSEMsg({
                filter: 'contact',
                err: err,
                contacts: contacts,
                logname: logname,
                remaining: rem,
            })
        })
        node.addProcessor({filter: {type:'contact'}, gatheron: 'name', overwrite: true},
            (err, contacts, logname) => {
            sendSSEMsg({
                filter: 'contact',
                gatheron: 'name',
                overwrite: true,
                err: err,
                contacts: contacts,
                logname: logname,
            })
        })
        node.addProcessor({filter: {type:'contact'}, gatheron: 'name'},
            (err, contacts, logname) => {
            sendSSEMsg({
                filter: 'contact',
                gatheron: 'name',
                err: err,
                contacts: contacts,
                logname: logname,
            })
        })
        node.addProcessor({filter: {type:'contact'},
            gatheron: 'name',
            commands: [ { type: 'delete' } ],
        }, (err, contacts, logname, cmd) => {
            if(cmd) {
                for(let i = contacts.length-1;i >= 0;i--) {
                    let contact = contacts[i]
                    if(cmd.name == contact.name) {
                        sendSSEMsg({deleting: contact})
                        contacts.splice(i, 1)
                    }
                }
                return
            }
            sendSSEMsg({
                filter: 'contact',
                gatheron: 'name',
                commands: '[delete]',
                err: err,
                contacts: contacts,
                logname: logname,
            })
        })
        res.end('Started')
    })
}

function addRec(req, res){
    if(!node) {
        sendErr(400, 'Node not started yet!', res)
        return
    }
    withPostData(req, res, (data) => {
        node.addRec(data.log, data.rec)
        res.end('Added')
    })
}

let allow
function checkReq(req, res){
    sendReq(req, allow ? false : true)
    return allow ? null : 500
}

function authReq(req, res) {
    withPostData(req, res, (data) => {
        allow = data
        res.end(allow ? 'allowed' : 'blocked')
    })
}

let SSE_RESP
function setSSERequestor(req, res) {
    SSE_RESP = res
    SSE_RESP.setHeader('Connection', 'Keep-Alive')
    SSE_RESP.setHeader('Cache-Control', 'No-Cache')
    SSE_RESP.setHeader('Content-Type', 'text/event-stream')
}

function sendSSEMsg(msg) {
    if(!SSE_RESP) {
        console.error('No SSE Connection set up!')
        return
    }
    if(typeof msg == 'object') msg = JSON.stringify(msg)
    SSE_RESP.write(`data: ${msg}\n\n`)
}

function sendReq(req, denied) {
    sendSSEMsg({sendReq: req, denied: denied})
}

function sendLogUpdate(err, name, recs) {
    sendSSEMsg({log: name, records: recs})
}

function withPostData(req, res, cb) {
    let data = '';
    req.on('data', (d) => {
        data += d;
        if(data.length > 1e6) {
            data = "";
            res.writeHead(413)
            res.end();
            req.connection.destroy();
        }
    });
    req.on('end', () => {
        try {
            let d = JSON.parse(data)
            cb(d);
        } catch(e) {
            console.log(e)
            sendErr(400, `Could not parse request '${data}'`, res)
        }
    });
}


main()
