Getting Started With Kore
=========================

Getting started with **Kore** is
very simple. As you know from
[the Architecture](ARCH.md), each
**Kore** node can be started with
several options but the minimum
startup is just a few lines.

```
const kore = require('kore').node()
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
    whoami: <uuid identifying node>,
    saveTo: <db folder to save logs>,
    connect: <host:port of other node>,
    listen: <port to listen for other nodes>,
    checkReq: <authentication hook fn>,
    authReq: <authentication hook fn>,
    errfn: <your replacement for console.error>,
    migrate: <migration function>,
}
const kore = require('kore').node(options)

```
All the settings are optional and
will depend on the configuration of
your network of nodes.

Setting `whoami` can be done by
generating and saving a NODEID
somewhere. Doing so is highly
recommended (see 'Who Am I' note
in [Concepts](CONCEPTS.md)
documentation).


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

# And Finally

Now that you know how to use
**Kore** - not too hard was it? - you
can finish your tour with an
understanding of some slightly
advanced concepts.

*  [Advanced Concepts](CONCEPTS.md)
