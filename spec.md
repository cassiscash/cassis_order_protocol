# Cassis Order Protocol v1.0

A JSON-based protocol for streaming an order page from a merchant to a customer's wallet, and getting paid (or paying back) at the end of it.

**Version:** 1.0 · **Status:** Draft

## Introduction

The Cassis Order Protocol (COP) is built on **[hypereffect](https://hypereffect.dev)**, a small protocol for server-driven UI. A **server** streams an order page to a **client** as hypereffect messages, the client draws it with its own native components and reports back what the user does, and money moves through invoices.

Everything about the page itself — framing, sessions, components, signals, expressions, handlers and actions — is hypereffect, unchanged. This document defines only what COP adds:

- The transport: an **iroh** connection, found through a [connection URI](#connection-uri) that is usually scanned from a QR code (see [Transport](#transport)).
- Two messages for money, neither of them a component: `invoice`, which asks the client to pay, and `invoicerequest`, which offers the client money and asks it to issue an invoice for it.
- How a flow is opened, and how it is found again later: a `claim` together with a client-generated `id`, sent in the hypereffect `hello`.

Where hypereffect says "renderer," this document says **client**.

### Roles

- The **server** is the merchant's side: a shop, a restaurant, a vending machine, a person selling something — anyone who hosts an order endpoint. "Server" describes the role, not the hardware: it may be an always-on machine, or the merchant's own phone. It describes the UI, reacts to the client's actions, and sends invoices.
- The **client** is the payer's side: a wallet app, usually on the payer's phone. It scans the server's QR code, opens the connection, draws the order page with its own native components, sends the payer's actions back, and shows its own payment screen when it receives an invoice.

The client always opens the connection. The server cannot reach a client on its own.

---

## Example: a pizza ordering flow

Before the details, here is a complete exchange between a client and a server: a small pizza order that ends in a payment.

1. The payer scans a QR code on a flyer. The client opens an iroh connection to the server named in it, and sends a `hello` with the `claim` from the QR code and a freshly generated `id` for this order, so the payer can come back to it later.
2. The server sends a pizza menu.
3. The payer taps a pizza. The client sends an `action` to the server.
4. The server updates the page: the chosen pizza, and a choice of extra topping (or none).
5. The payer picks a topping. The client sends another `action`.
6. The server rewrites the page: the order summary, a delivery address field, and a pay button.
7. The payer types the address and taps the pay button. The client sends an `action` carrying the address.
8. The server sends an `invoice`. The client shows its own payment screen for it, and the payer pays.

Every message is one line: a tag, a space, and a JSON object, as defined by hypereffect.

### 1–2. Client connects, server sends the menu

The QR code on the flyer holds a [connection URI](#connection-uri):

```
cop:5f1c9d0a27e4b6c38d2f71a09e4b5c6d8a3f2e1b0c9d8e7f6a5b4c3d2e1f0a9b?claim=flyer-2026-10&name=Luigi%27s%20Pizza
```

The client connects to the iroh endpoint in it and sends its `hello`: the `claim` from the URI, and an `id` it just generated for this order.

```
hello {"claim":"flyer-2026-10","id":"f1K9xQ2v8Tn4LmZp7Rb3wq"}
```

The server answers with the menu:

```
element {"id":"title","type":"text","variant":"h1","text":"Choose your pizza"}
element {"id":"menu","type":"list"}
element {"id":"margherita","type":"button","parent":"menu","label":"Margherita — $8.50","onPress":{"action":"selectPizza","payload":{"pizza":"margherita"}}}
element {"id":"pepperoni","type":"button","parent":"menu","label":"Pepperoni — $10.00","onPress":{"action":"selectPizza","payload":{"pizza":"pepperoni"}}}
element {"id":"funghi","type":"button","parent":"menu","label":"Funghi — $9.50","onPress":{"action":"selectPizza","payload":{"pizza":"funghi"}}}
```

The payloads carry only *what* was chosen, not its price. The server looks prices up itself; see [Security considerations](#security-considerations).

### 3. Payer picks a pizza; client notifies the server

```
action {"name":"selectPizza","payload":{"pizza":"pepperoni"},"signals":{}}
```

### 4. Server updates the page: selected pizza + topping choice

```
remove {"id":"menu"}
element {"id":"title","type":"text","variant":"h1","text":"Your order"}
element {"id":"selected","type":"text","text":"Pepperoni pizza — $10.00"}
element {"id":"toppings","type":"card","title":"Add an extra topping?"}
element {"id":"topping_row","type":"row","parent":"toppings"}
element {"id":"olives","type":"button","parent":"topping_row","label":"Olives (+$1.00)","onPress":{"action":"selectTopping","payload":{"topping":"olives"}}}
element {"id":"chili","type":"button","parent":"topping_row","label":"Chili (+$0.75)","onPress":{"action":"selectTopping","payload":{"topping":"chili"}}}
element {"id":"skip","type":"button","parent":"topping_row","variant":"plain","label":"No extra topping","onPress":{"action":"selectTopping","payload":{"topping":null}}}
```

### 5. Payer picks a topping; client notifies the server

```
action {"name":"selectTopping","payload":{"topping":"chili"},"signals":{}}
```

### 6. Server rewrites the page: order summary, address, pay button

```
remove {"id":"toppings"}
signal {"order":{"address":""}}
element {"id":"title","type":"text","variant":"h1","text":"Where should we deliver?"}
element {"id":"selected","type":"text","text":"Pepperoni pizza + chili — $10.75"}
element {"id":"address","type":"input","label":"Delivery address","bind":"order.address"}
element {"id":"pay","type":"button","variant":"primary","label":"Pay $10.75","disabled":{"cel":"s.order.address == ''"},"onPress":{"action":"pay"}}
```

The address field is bound to the `order.address` signal. Typing into it updates the client's signals and sends nothing; the pay button stays disabled while the address is empty.

The pay button is an ordinary `button`. Nothing about it is payment-aware: hypereffect has no payment component. Tapping it only tells the server the payer is ready; the server answers with an invoice.

### 7. Payer taps the pay button; client notifies the server

```
action {"name":"pay","signals":{"order":{"address":"221B Baker St, London NW1 6XE"}}}
```

The address arrives in the action's signals. The server checks it anyway: had it been empty, the server could have answered with an updated page asking for it instead of an invoice.

### 8. Server sends the invoice

```
invoice {"invoice":"cassis:eyJhbGciOiJFZERTQSJ9.ord-2f8c","memo":"Pepperoni + chili, to 221B Baker St"}
```

On receiving an `invoice` the client **shows its own payment screen**, with what the invoice itself says: amount, currency, payee, expiry. That screen belongs to the client; this protocol says nothing about what it looks like. See [`invoice`](#invoice-server-client).

The payment travels over the invoice's own settlement mechanism, and the server learns the outcome from there, not from this protocol. Once paid, the server may turn the page into a confirmation: an order number, a delivery time.

### Flows with no UI at all

The example above is the longest kind of flow, not a requirement. A flow is only a stream of messages, so a server can skip the UI entirely.

#### Paying at the till

The QR code on the till names the server and carries a `claim` identifying that till. The client connects, and the server, which already knows what is being bought there, sends an invoice straight away. The client shows its payment screen, the payer pays, and the flow is over. No element was ever sent.

```
invoice {"invoice":"cassis:eyJhbGciOiJFZERTQSJ9.till-2b71","memo":"1 × flat white"}
```

#### Offering the client money

The opposite direction: the server has money for the client — a refund, a cashback, a withdrawal from a prepaid balance — and asks the client to issue an invoice for it.

```
invoicerequest {"amount":"24.00","currency":"USD","memo":"Refund for unused days"}
```

If the payer accepts, the client generates an invoice with its own keys and sends it back. The server pays it.

```
invoice {"invoice":"cassis:eyJhbGciOiJFZERTQSJ9.ref-5c04"}
```

#### Reopening an order

The client reconnects with the same `(claim, id)` pair it used before, and the server shows whatever it wants to show for that order: where an unfinished order left off, a receipt for a paid one, a refund form. See [Sessions, claims and order ids](#sessions-claims-and-order-ids).

---

## Protocol overview

A COP flow is a hypereffect session with two extra kinds of message for money.

A typical flow (the order is not fixed):

1. **Connect:** The payer scans a [connection URI](#connection-uri). The client connects to the server and sends a `hello` with a `claim` and an `id`.
2. **Page:** The server sends hypereffect `element`, `remove` and `signal` messages to build and update the order page. As the payer interacts, the client sends `action` messages, and the server answers with more of them.
3. **Invoice:** At any point the server may send an `invoice`, and the client shows its payment screen for it.
4. **Invoice request:** At any point the server may send an `invoicerequest` offering money, and the client may answer with an `invoice` of its own.

Step 2 is the UI half of the protocol and steps 3–4 the money half. Either may be empty. The smallest possible flow is a connection followed by a single `invoice`; see [Flows with no UI at all](#flows-with-no-ui-at-all).

---

## Connection URI

A server publishes its order endpoint as a URI, usually printed or displayed as a QR code: on a flyer, a table, a till, a vending machine, or the merchant's phone screen.

```
cop:<endpoint-id>?<parameters>
```

- `<endpoint-id>` (required): the server's iroh endpoint ID — its Ed25519 public key, as 64 lowercase hexadecimal characters. This is the only thing the client needs to reach the server and to know it is talking to the right one: iroh authenticates the connection against this key.
- Parameters, all optional and percent-encoded:
  - `relay`: the URL of an iroh relay to reach the server through, instead of the client's default relays. A merchant who cares about privacy can run their own relay, including one reachable only over Tor: a relay URL whose host is a `.onion` address means the client must connect to it through Tor.
  - `claim`: a string the client sends back unchanged in its `hello`. See [Sessions, claims and order ids](#sessions-claims-and-order-ids).
  - `name`: a display name for the server, which the client may show before and while connected. It is the server's own description of itself and is not verified.

Clients must ignore parameters they do not recognise.

**Examples:**

```
cop:5f1c9d0a27e4b6c38d2f71a09e4b5c6d8a3f2e1b0c9d8e7f6a5b4c3d2e1f0a9b
```

```
cop:5f1c9d0a27e4b6c38d2f71a09e4b5c6d8a3f2e1b0c9d8e7f6a5b4c3d2e1f0a9b?claim=table-12&name=Luigi%27s%20Pizza
```

```
cop:5f1c9d0a27e4b6c38d2f71a09e4b5c6d8a3f2e1b0c9d8e7f6a5b4c3d2e1f0a9b?relay=http%3A%2F%2Fexampleonionrelayaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.onion&claim=till-3
```

---

## Transport

A single transport is defined: an **iroh** connection using the ALPN `cassis-order`.

- The **client** always initiates. It dials the endpoint ID from the connection URI with the ALPN `cassis-order`, through the URI's `relay` if one is given.
- The client opens one bidirectional stream on the connection. Everything in the flow travels over that stream, in both directions, as hypereffect lines written directly to the stream.
- The **first line** the client sends is the hypereffect `hello`. COP adds two optional string members to it:
  - `claim`: the `claim` from the connection URI, unchanged. Omitted if the URI had none.
  - `id`: the identifier of this order flow, generated by the client. Omitted for a throwaway flow that nobody can come back to.
- The flow ends when either side closes the connection.

**Example `hello` lines:**

```
hello {}
```

```
hello {"claim":"table-12","id":"f1K9xQ2v8Tn4LmZp7Rb3wq"}
```

---

## Sessions, claims and order ids

Every flow is one conversation about one thing: an order, a bill, a membership. Payers like to be able to come back to it, so the two COP members of the `hello` name it.

- The **`claim`** comes from the server, through the connection URI. It is whatever the server needs to tell its order pages apart: a table number, a till, a flyer campaign, a customer token, or nothing at all. The client treats it as an opaque string and only sends it back.
- The **`id`** is generated by the **client**. It names *this* flow at this server. Two orders with the same `claim` but different `id`s are two different orders; a client that reconnects with the same `(claim, id)` pair is asking for the same order again.

**Clients must generate long, random `id` values: at least 128 bits of randomness.** The pair `(claim, id)` is a bearer token for the order: whoever presents it can reopen the flow and see what the server shows for it. The `claim` is often printed on a table for anyone to read, so the `id` is what keeps a payer's orders private from the next person to sit down. Short, sequential, or human-readable identifiers do not qualify.

**The client keeps a record of its flows.** For each one it stores the server's endpoint ID and relay, the `(claim, id)` pair, and the invoices it paid or issued in that flow. This is the payer's own record, and it is how the payer reopens an order later: the client connects again with the same pair.

**What the server shows on a reopened flow is up to the server.** A reconnection is a new hypereffect session: it starts with an empty page until the server sends one. The server may:

- pick an unfinished order up where it left off;
- show a paid order's details — a receipt, an order number to quote, a delivery time — or a form for requesting a refund;
- show whatever else it thinks is worth showing.

**Servers are allowed to forget.** For a tip jar or a coffee, the server may keep no record at all, and treat every connection as a brand-new flow. A business that expects payers to come back for receipts, refunds or another month of service will want to remember, at least for a while. How long a server remembers is policy, not wire format.

---

## Messages

The page is built with the messages [hypereffect](https://hypereffect.dev) defines: `element`, `remove` and `signal` from the server, `hello` and `action` from the client. COP adds the following, framed the same way:

| Tag              | Direction       |
| ---------------- | --------------- |
| `invoice`        | server → client |
| `invoicerequest` | server → client |
| `invoice`        | client → server, only in answer to an `invoicerequest` |

A plain hypereffect renderer ignores these tags; a COP client must implement them. A message missing a required member is ignored, as hypereffect does with any invalid message.

Money never enters a flow through the page. There is no payment component; a pay button is just a `button` whose handler sends an `action`, and the server answers it with an `invoice`.

### `invoice` (server → client)

Asks the client to pay a **Cassis invoice**. It carries no UI of its own: the client shows **its own payment screen** with what the invoice says — amount, currency, payee, expiry, description. What that screen looks like (a sheet, a modal, a full-screen takeover) is up to the client and out of scope for this protocol.

The payer may pay, or dismiss the payment screen. A dismissed invoice stays with the flow, so the payer can still pay it while the flow is open, and finds it in the client's record afterwards.

An `invoice` may be sent at any point in a flow, including when the page is empty. A later `invoice` replaces an earlier unpaid one: an order whose price changes, or a bill that grows, is handled by sending a new invoice.

**Members:**

- `invoice` (string, required): The encoded Cassis invoice (format defined elsewhere). COP never looks inside it; the client hands it to its payment subsystem.
- `memo` (string, optional): A short note to show alongside the payment, e.g. `"Table 12, second round"`. The client may ignore it. Amount, currency and payee always come from the invoice itself, never from the memo or from the page.

**Example:**

```
invoice {"invoice":"cassis:eyJhbGciOiJFZERTQSJ9.ord-2f8c","memo":"Pepperoni + chili"}
```

The invoice is not an element and is not stored in the signals. Settlement happens through the invoice's own mechanism; a server that wants to know whether it was paid finds out from there, not through this protocol.

### `invoicerequest` (server → client)

The reverse direction of money: the server **offers the client money**, and asks it to issue an invoice for it. This is how a server refunds an order, pays a cashback, or lets the payer withdraw a prepaid balance.

**Members:**

- `amount` (string, required): The amount offered, as a decimal string (e.g. `"24.00"`), in the unit given by `currency`.
- `currency` (string, required): The currency or unit of `amount`, using the same codes as Cassis invoices (for example, the ISO 4217 code `USD`).
- `memo` (string, optional): A description to show to the payer and embed in the generated invoice, e.g. `"Refund for order 2f8c"`.
- `expiresIn` (string, optional): An ISO 8601 duration after which the generated invoice should expire, e.g. `"PT15M"`. The client may ignore it.

**Behavior:**

- The client shows the offer to the payer. If the payer accepts, the client generates a Cassis invoice with its own keys and sends it back in an [`invoice`](#invoice-client-server) message. The server then pays it.
- If the payer declines, the client sends nothing. The server must not wait on an answer that may never come.
- Settlement of the returned invoice is out of scope for this protocol, as it is for one the server sends.
- An `invoicerequest` needs no page. A whole flow can be: connect, receive an `invoicerequest`, return an `invoice`, done.

**Example:**

```
invoicerequest {"amount":"24.00","currency":"USD","memo":"Refund for unused days","expiresIn":"PT15M"}
```

### `invoice` (client → server)

Sent in answer to an [`invoicerequest`](#invoicerequest-server-client), carrying the invoice the client generated with its own keys. The server pays it; settlement is out of scope for this protocol.

**Members:**

- `invoice` (string, required): The encoded Cassis invoice the client created.

**Example:**

```
invoice {"invoice":"cassis:eyJhbGciOiJFZERTQSJ9.ref-5c04"}
```

---

## Security considerations

The security considerations of hypereffect apply. In addition:

- **Only the client's payment screen is trustworthy.** Everything on the page is drawn by the server, including text that says what something costs. The client must take the amount, currency and payee it shows for a payment from the invoice itself, and must show its payment screen in a way the server cannot imitate with elements.
- **Actions are payer input.** The client fills in an action's payload and signals, so a modified client can put anything there. Servers must not take prices, totals or anything else they would not accept from a stranger from them; the examples in this document send only *what* was chosen, and the server prices it.
- **`(claim, id)` is a bearer token.** Anyone who has the pair can reopen the order. Clients must generate `id`s with at least 128 bits of randomness and keep them private. Servers should not put more in a reopened order than its holder ought to see.
- **Remote images leak the payer's network address.** `image` elements load from URLs the server chooses. Fetching them reveals the payer's IP address to whoever hosts them, even when the iroh connection itself goes through a Tor relay. Clients should let payers turn remote images off, and should not load them when the connection URI named a `.onion` relay.
- **`name` is unverified.** The `name` parameter of a connection URI is whatever the server says it is called. What identifies a server is its endpoint ID, and what identifies a payee is the invoice.
