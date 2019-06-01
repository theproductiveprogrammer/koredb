Getting Started With Kore
=========================

Getting started with **Kore** is
very simple. As you know from
[the Architecture](ARCH.md), each
**Kore** node can be started with
several options but the minimum
startup is just a few lines.

```
const koredb = require('koredb')
const kore = koredb.node()
...

// Add a new record
kore.addRec('MyList', { a: 'new record' })

// Process incoming records
kore.addProcessor((err, recs, logname) => {...})

```

To start **Kore** with the
options to save your logs to disk,
connect to other nodes, set error
handling functions and so on, simply
provide an `options` object with
any of the following parameters.

```

let options = {
    saveTo: <db folder to save logs>,
    connect: <host:port of other node>,
    listen: <port to listen for other nodes>,
    checkReq: <authentication hook fn>,
    authReq: <authentication hook fn>,
    errfn: <your replacement for console.error>,
    migrate: <migration function>,
    whoami: <uuid identifying node>,
}
const kore = koredb.node(options)

```
All the settings are optional and
will depend on the configuration of
your network of nodes.

|  Option  |  Use |
| -------- | ---- |
| saveTo | If set, persist data here |
| connect | If set, connect to this node to synchronize |
| listen | If set, starts a server on this port |
| checkReq | Authentication hook (see [Concepts](docs/CONCEPTS.md)) |
| authReq | Authentication hook (see [Concepts](docs/CONCEPTS.md)) |
| errfn | If set, will send messages here instead to `console.error` |
| migrate | Migration function (see [Concepts](docs/CONCEPTS.md)) |
| whoami | Used as NODEID if set (see [Concepts](docs/CONCEPTS.md)) |


If `saveTo` and `connect` (or
`listen`) are all not set this
node will start and work but not
save it's data and not
synchronize with other nodes. So
all the data will vanish when
the node shut's down. This is
called a 'hermit' node and is
useful for testing and
experimentation.


# Processing Log Records

As we have seen in [the introduction](INTRO.md),
there are actually two main patterns
in log processing:

1. Records are updated by writing a
   new version of an existing record.
2. Records are updated by a 'command'
   that updates an existing record
   or set of records.

**Kore** supports either or both
patterns or you can choose to
process the records in the logs
entirely on your own.

```
kore.addProcessor({ filter: { type: 'contact' }, gatheron: 'name' },
    (err, contacts, logname) => {
        // all contact objects merged on name available here
        // called each time they are updated
    }
)

kore.addProcessor({ filter: { type: 'contact' }, gatheron: 'name',
      commands: [ { type: 'rename' }, { type: 'delete' } ] },
    (err, contacts, logname, commandrec) => {
        // Called whenever a matching command found
        // with the current set of contacts.
        // Expects the contacts to be updated with
        // whatever the command is expected to do
        // Finally called with no commandrec when
        // all contact objects merged by name
        // called each time there is an update
    }
)

kore.addProcessor((err, recs, logname) => {
    // All log records available
    // here - no processing done
})
```


# Browsing Your Data

As you gather data it is important and
useful to be able to play around and
explore with your data. Making ad-hoc
queries of your data and trying out
various scenarios is often very
important.

The good news is that it is very simple
to do this in **Kore**. Simply drop down
into the node REPL and load your data
and suddenly you have all the power of
the _entire javascript language_ at your
disposal to slice, dice, and aggregate
your data in any way you want.

```
node
> let kore = require('koredb')
> kore.browse('path/to/data/folder')
> koredata
  { errs: [],
    logs: {
    ...
    }
  }
>
```

Once you use `kore.browse('path/to/data')`,
the global variable `koredata` is
populated with a snapshot of the logs
(and any errors it encountered during
loading). From this point onward you can
simply use javascript to `map`,
`filter`, and perform any kind of
complex query you can dream of using
simple javascript.


# And Finally

Now that you know how to use
**Kore** - not too hard was it? - you
can finish your tour with an
understanding of some slightly
advanced concepts.

*  [Advanced Concepts](CONCEPTS.md)
