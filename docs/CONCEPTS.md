Advanced Concepts
=================

This document covers all the
slightly more advanced concepts that
you are now ready for -

    * Authorization
    * Identification (who am i)
    * Caching
    * Record Id's, and
    * Migration

You can use **Kore** without reading
this document but it's a short read
and will really help with your
understanding of **Kore** and how to
use it well.

# Authorization
Because a node can listen for other
node requests it has to be able to
authenticate that those requests are
valid.

To do this **Kore** provides a pair
of functions - `authReq/checkReq`
that you can use to hook into any
authentication/authorization system
that you want.

```
// On Client
function authorizeReq(url, headers, cb) {
    // Add auth headers you need
    headers['X-Auth-X'] = ...
    // Or add/update cookies
    headers['Cookie'] = headers['Cookie'] + more_cookies
    ...
    // Or update the URL with some nonce
    // (just call cb() to keep URL the same)
    cb(null, url + auth_nonce)
}
let options = {
    ...
    authReq: authorizeReq,
    ...
}

// On Server
function checkReq(req, cb) {
    // Check req cookies/params etc
    cb(true) // can continue
    cb(...) // anything else - unauthorised
}
let options = {
    ...
    checkReq: checkReq,
    ...
}
```


## Caching

When new records are added **Kore**
caches the old results requested so
that it does not need to process the
entire log everytime. For large logs
this results in a significant speed
up.

If you are processing the log
records yourself, **Kore** allows
you to use the same caching
mechanisms it uses itself:

```
let cache = {} // managed by kore
kore.cachedUpto(logname, recs, cache)
...
let recs_to_process = kore.afterCached(cache, logname, recs)
```

# Who Am I
Each **Kore** node writes to it's
own personal piece of the log (see
'**Kore Record Fields**' below) and
shares this with other nodes to
create the integrated log. Each
personal log 'shard' is identified
by a UUID.


If you do not provide `kore`
with a persistent data store (by
setting the `saveTo` option), it
will auto-generate an ID
everytime. If this node
generates logs then those logs
will contain new ID's every time
the node is started. In most
cases, this is not desirable so
you can set the id directly
using the `whoami` parameter.

```
let NODEID = kore.uuid()
// Save NODEID and reload whenever
// node is re-started
...
let options = {
    ...
    whoami: NODEID,
    ...
}
const kore = koredb.node(options)
```


# Kore Record Fields (and Record Id's)
A basic requirement of `kore` is
that every record needs to be
ordered.

As described above (in 'Who Am I')
a record also must 'belong' to a
node - the node that created that
record. Records belonging to each
node are kept in separate 'shards'
of the log.

Having shards ensures that a node,
as it writes, does not step on
another nodes toes. This is what
allows us to have distributed writes
that merge seamlessly with each
other.

To solve these issues, **Kore** adds
two fields to every record:

        _korenum: The record number
        _korewho: The record writer

Both these fields together also
provide a nice way for you to have a
unique identity for a record across
all nodes:

     recID = <recnum>-<whoami>


**Kore** provides this helper
function for you to use:

```
    let id = kore.recID(record)
```


# Migration

At some point, you may want to clean
up your logs and move to a fresh new
system. "Out with the old and bring
in the new" is your motto as you
sweep out old records and formats and
start with a clean new slate.

At this time too **Kore** has you
covered. **Kore** allows you to
provide a 'migration function' that
transforms your old log into a new
one.

## Migrator Pattern
To do this, a good practice is to
designate only _one_ of your
nodes as the migrator. This node
will accept the migration function:

```
kore.migrate('MyList', 'MyList2', (rec) => {
    // You can remove records
    if(rec.name == 'Alice') return false
    // Modify them
    if(rec.type == 'appointment') {
        rec.type == 'calendar'
        ...
        return rec
    }
    // Split into multiple
    if(rec.type == 'xxx') {
        return [ split_rec1(rec), split_rec2(rec) ]
    }
    // Just pass through
    return rec
})
```

Your nodes should then move over to
using the new log ('MyList2') as you -
gradually - remove support for the
old log ('MyList1').

As older nodes continue to write to
the old list the migrator node will
migrate those records over to the
new log so you can move over
systematically and stop supporting
the old logs after some time.


# Browsing Data

As you use **Kore** you may want
to explore your data. This is
explained in the
[./START.md](Getting Started)
document.


* [Back](../README.md)
