Introduction to Kore
====================

Let's get started with a brief look
at why 'Log Databases' are a such an
exciting solution in the first place.

# Why Log Databases?

The `Log` is such a simple data
structure that for many years
[we've overlooked it's potential](https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying).
After all a 'log file' seems so
absurdly simple it is often just an
afterthought. It can feel like a
completely a trivial data structure.
And yet it is this very simplicity that
makes the log such a tremendously
powerful abstraction.

At it's core the log is a set of
'append-only' records of no
particular format. Each log has a
name and the records are ordered but
that's about it.

![the-log.png](the-log.png)


Now just what _are_ the interesting
properties of the log? Well firstly
it is **immutable**.
This brings with it all the nice
properties that we associate with
immutability including the ability
to be accessed by multiple clients
without fear.

The second property of the log is
that, being largely unstructured, it
is _future-proof_. As new
requirements come in, new record
types can simply be added without
needing older clients to be
upgraded. They will simply ignore
records they do not understand.

The third property of the log is
that it is _easy to merge_. This
means that, given multiple logs,
_anyone_ with access to them will
end up with the exact same global
ordering of records. This property
makes it ideal for a distributed
database allowing for a very simple
way to get eventual consistency.

Finally, because the log itself has
no processing logic of it's own, we
have to separate out the data
management algorithms. This allows
them to progress independently and
become more and more sophisticated
while still operating on the same
log data.

This simple step of decoupling the
processing from the data gathering
stage has been found to make a the
system far more robust and powerful
as well as easy to modify and grow.

> Gather all the data you can.

> And figure out what to do with it later!

## Light's...Camera...Action!

Let's see how this would work in _action_.

![action.png](action.png)


For this let's look at the canonical
example - a *TO-DO LIST*

We start off our log just by
recording entries in our list:

```
[MyList]

1 { do: Buy Milk }
2 { do: Buy Cheese }
3 { do: Remember I'm Lactose Intolerant }
4 ...
```

Now we meet Alice (whom we've always
had a kind of secret crush on) and
she gives us her number! Yes! Let's
record that too. Our To-do
application may not be able to
understand it now, but we know we
can make it understand it going
forward.

```
[MyList]

1 { do: Buy Milk }
2 { do: Buy Cheese }
3 { do: Remember I'm Lactose Intolerant }
4 { name: Alice <3, number: +99 887 886 }
5 ...
```

Isn't this nice? We can just add
things and worry about dealing with
them later.

Now let's imagine we like our TO-DO
app so much we put it everywhere -
(like on our phone AND our iPad!)

```
[MyList - PhoneLog]
1 { do: Buy Milk }
2 { do: Buy Cheese }
3 { do: Remember I'm Lactose Intolerant }
4 { name: Alice <3, number: +99 887 886 }
5 ...

[MyList - PadLog]
1 { do: Pick up dinner }
2 ...
```

These combine to give us our
complete list (on both the phone and
iPad):

```
[MyList]
1 { do: Pick up dinner }
1 { do: Buy Milk }
2 { do: Buy Cheese }
3 { do: Remember I'm Lactose Intolerant }
4 { name: Alice <3, number: +99 887 886 }
```

Now supposed we change a record on
the iPad and change _the same
record_ on the phone. What would
happen?

The first thing to notice is that we
cannot edit a record anyway so the
way to change it is to create a new
'update' record.

```
[MyList - PhoneLog]
3 ...
4 { name: Alice <3, number: +99 887 886 }
5 { change: { name: Alice <3 }, to: { name: I hate Alice } }
6 ...
```

And the same on the iPad:
```
[MyList - PadLog]
7 ...
8 { change: { number: +99 887 886 }, to: { number: +99 776 665 } }
9 ...
```

Now combining them is easy! No more
overwriting issues.

```
[MyList]
3 ...
4 { name: Alice <3, number: +99 887 886 }
5 { change: { name: Alice <3 }, to: { name: I hate Alice } }
6 ...
7 ...
8 { change: { number: +99 887 886 }, to: { number: +99 776 665 } }
9 ...
```

![fake.png](fake.png)

"Ho!" Tom the skeptic cries, "This is just [fAkE
nEWs](https://edition.cnn.com/)! What if we don't arrange our
records in this neat little way with
nice change sets?"

Fair enough. Let's look at a simpler
version. Say the record is updated
simply by writing a complete new
version and not by making a 'change'
record. How would that look?

```
[MyList - PhoneLog]
3 ...
4 { name: Alice <3, number: +99 887 886 }
5 { name: I hate Alice, number: +99 887 886 }
6 ...

[MyList - PadLog]
7 ...
8 { name: Alice <3, number: +99 776 665 }
9 ...
```

Now this record, you could argue,
would have the same problem as a
mutable record - one of the records
is going to overwrite the other.

However - here is where the magic of
separating data capture from data
processing comes in!

![magic.png](magic.png)


A simple processor would indeed
cause the records to overwrite each
other and so we would 'loose' the
changes. However, because processing
is separated out the underlying data
is still available and we can
imagine at some point simply
upgrading the processor so it can
handle this case as well.

How can we do this? We could realize
that people tend to update only
parts of a record when they make
changes. So the processor can simply
check the latest update with the
previous version to find what has
changed.

```
[MyList - PhoneLog]
3 ...
4 { name: Alice <3, number: +99 887 886 }
5 { name: I hate Alice, number: +99 887 886 }
    --> Processor derives: { change: { name: I hate Alice } }
6 ...

[MyList - PadLog]
7 ...
8 { name: Alice <3, number: +99 776 665 }
    --> Processor derives: { change: { number: +99 776 665 } }
9 ...
```

And - magically - we have been able
to solve the overwriting issue and
bring back the correct data. And all
because the _underlying data is
always available_ - just waiting for
cleverer processing algorithms to
give cleverer results.

Amazing isn't it?


(PS: In case you think the second
method is complicated - don't worry.
**Kore** actually supports this
exact kind of diff-merging of
records _out of the box_! You don't
have to worry about implementing it
yourself. See the "Processing Logs"
section in [Getting Started](START.md)).


# Next Steps

*  Read about the [Architecture](ARCH.md)
*  Read the [Getting Started](START.md) document
