# Cassis Order Protocol v1.0

A JSON-based protocol for streaming order pages from a merchant to a customer's wallet and settling payments.

**Version:** 1.0 · **Status:** Draft

## Introduction

The Cassis Order Protocol (COP) builds on **[hypereffect](https://hypereffect.dev)**, a protocol for server-driven UI. A **server** (merchant) streams an order page as hypereffect messages to a **client** (customer's wallet). The client renders the page natively, sends user actions back, and settles payments through Cassis invoices.

Framing, components, signals, expressions, and actions are standard hypereffect (where hypereffect says "renderer," this spec says **client**). COP adds:

- **Transport:** An **iroh** connection initiated via a [connection URI](#connection-uri) (typically a QR code) or an [HTTPS web address](#web-addresses).
- **Payment messages:** `invoice` (requesting payment from the client) and `invoicerequest` (offering money to the client and asking it to generate an invoice).
- **`hello` fields:** `params` (from the connection URI), `session` (client-generated session ID), and `force_resume` (requiring the server to resume an existing session or fail).
- **`close` reason:** `session_not_found`, sent when a server cannot resume a requested session.
- **`metadata` field:** `mode`, indicating whether the connection URI can be reused (`single_use`).

### Roles

- **Server (merchant):** A shop, vending machine, or individual hosting an order endpoint on a server or phone. It defines the UI, processes actions, and sends invoices.
- **Client (payer):** A wallet app. It always initiates the connection, renders the UI natively, forwards user actions, and displays its own trusted payment screen when an invoice arrives.

---

## Example: Pizza ordering flow

Every message is a single line: `<tag> <json>`, as defined by hypereffect.

### 1. Client connects, server sends menu

The payer scans a QR code containing a connection URI:

```
cop://5f1c9d0a27e4b6c38d2f71a09e4b5c6d8a3f2e1b0c9d8e7f6a5b4c3d2e1f0a9b#name=Luigi%27s%20Pizza
```

The client connects to the iroh endpoint and sends `hello` with the URI parameters and a newly generated `session` token:

```
hello {"params":{"name":"Luigi's Pizza"},"session":"f1K9xQ2v8Tn4LmZp7Rb3wq"}
```

The server replies with its metadata and menu elements:

```
metadata {"name":"Luigi's Pizza","description":"Wood-fired pizza, Via Roma 12"}
element {"id":"title","type":"text","variant":"h1","text":"Choose your pizza"}
element {"id":"menu","type":"list"}
element {"id":"margherita","type":"button","parent":"menu","label":"Margherita — $8.50","onPress":{"action":"selectPizza","payload":{"pizza":"margherita"}}}
element {"id":"pepperoni","type":"button","parent":"menu","label":"Pepperoni — $10.00","onPress":{"action":"selectPizza","payload":{"pizza":"pepperoni"}}}
element {"id":"funghi","type":"button","parent":"menu","label":"Funghi — $9.50","onPress":{"action":"selectPizza","payload":{"pizza":"funghi"}}}
```

Action payloads carry item identifiers, never prices. The server calculates prices itself.

### 2. Payer picks a pizza

```
action {"name":"selectPizza","payload":{"pizza":"pepperoni"},"signals":{}}
```

The server replaces the menu with topping options:

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

### 3. Payer picks a topping

```
action {"name":"selectTopping","payload":{"topping":"chili"},"signals":{}}
```

The server updates the page with an order summary, a signal-bound address input, and a pay button:

```
remove {"id":"toppings"}
signal {"order":{"address":""}}
element {"id":"title","type":"text","variant":"h1","text":"Where should we deliver?"}
element {"id":"selected","type":"text","text":"Pepperoni pizza + chili — $10.75"}
element {"id":"address","type":"input","label":"Delivery address","bind":"order.address"}
element {"id":"pay","type":"button","variant":"primary","label":"Pay $10.75","disabled":{"cel":"s.order.address == ''"},"onPress":{"action":"pay"}}
```

Typing updates the client's local `order.address` signal without network traffic. The pay button is a standard hypereffect button; tapping it simply notifies the server.

### 4. Payer submits order and pays

```
action {"name":"pay","signals":{"order":{"address":"221B Baker St, London NW1 6XE"}}}
```

The server validates the address and sends a Cassis `invoice`:

```
invoice {"invoice":{"payment_hash":"3f9a…e21c","amount_msat":10750000,"expires_at":1793875200,…}}
```

When the client receives `invoice`, it opens its own native payment prompt showing the invoice's amount, payee, and expiry. Settlement happens over the invoice's payment network outside of COP. Once paid, the server can stream a confirmation page.

### Headless flows (no UI)

UI elements are optional. A flow can consist solely of payment messages.

#### Paying at a till

The client scans a QR code at a till (`#till=2`). The server immediately sends metadata and an invoice:

```
metadata {"name":"Luigi's Pizza","description":"Till 2"}
invoice {"invoice":{"payment_hash":"b207…41d9","amount_msat":3500000,"expires_at":1793871900,…}}
```

#### Refunds and payouts

To send money to the client (refunds, cashback, withdrawals), the server sends `invoicerequest`, typically marking the session `single_use`:

```
metadata {"name":"Luigi's Pizza","description":"Refund","mode":"single_use"}
invoicerequest {"amount":24000,"description":"Refund for unused days"}
```

If the user accepts, the client generates an invoice and replies:

```
invoice {"invoice":{"payment_hash":"5c04…9a7e","amount_msat":24000000,"expires_at":1793872800,…}}
```

#### Resuming an order

To check an order or receipt later, the client reconnects with the saved `session` token and `"force_resume":true`:

```
hello {"params":{"name":"Luigi's Pizza"},"session":"f1K9xQ2v8Tn4LmZp7Rb3wq","force_resume":true}
```

If the server recognizes the session, it streams the current state (unfinished order, receipt, or refund form). If not, it closes the connection:

```
close {"reason":"session_not_found"}
```

---

## Connection URI

Servers publish endpoints as `cop://` URIs (usually in QR codes) or at [HTTPS web addresses](#web-addresses).

```
cop://<endpoint-id>[?_relay=<relay-url>][#<parameters>]
```

- **`<endpoint-id>` (required):** The server's iroh endpoint ID (64-character hex Ed25519 public key). Case-insensitive (clients lowercase it). There is no path component.
- **`_relay` (optional query parameter):** Percent-encoded URL of a custom iroh relay to connect through instead of default relays. If the relay host is a `.onion` address, the client must connect via Tor. `_relay` is consumed by the client for routing and **never sent** in `hello`. Other query parameters are ignored.
- **`<parameters>` (optional fragment):** `&`-separated `key=value` pairs (following [hyperb session parameter rules](https://github.com/hypereffect/hyperb/blob/master/SPEC.md#18-session-parameters)). Keys and values are percent-decoded UTF-8 strings; values may be empty. Missing `=`, empty keys, duplicate keys, or invalid UTF-8 make the URI invalid. Clients forward all fragment parameters in `hello` and ignore unknown ones. COP defines one parameter:
  - `name`: Unverified display name shown while connecting, replaced once `metadata` arrives.

**Examples:**

```
cop://5f1c9d0a27e4b6c38d2f71a09e4b5c6d8a3f2e1b0c9d8e7f6a5b4c3d2e1f0a9b
cop://5f1c9d0a27e4b6c38d2f71a09e4b5c6d8a3f2e1b0c9d8e7f6a5b4c3d2e1f0a9b#table=12&name=Luigi%27s%20Pizza
cop://5f1c9d0a27e4b6c38d2f71a09e4b5c6d8a3f2e1b0c9d8e7f6a5b4c3d2e1f0a9b?_relay=http%3A%2F%2Fexampleonionrelayaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.onion#till=3
```

### Web addresses

A web address (with or without a scheme, e.g., `example.com/order/123` or `https://example.com/order/123`) can be used in place of a `cop://` URI.

1. The client normalizes the URL to `https://` (never fetching over plain HTTP) and performs a `GET` request, following only HTTPS redirects.
2. It parses the HTML `<head>` for the first valid `<link>` with `rel="cassis-order"` and an absolute `cop://` `href`:
   ```html
   <link rel="cassis-order" href="cop://5f1c9d0a27e4b6c38d2f71a09e4b5c6d8a3f2e1b0c9d8e7f6a5b4c3d2e1f0a9b#table=12">
   ```
3. The client connects using the resolved `cop://` URI. Query and fragment parameters on the HTTPS URL itself are ignored.

The client must not render the web page or execute its scripts, and should enforce strict fetch limits (timeout, response size, redirect count). The server's identity is determined solely by the iroh endpoint ID in the resolved `cop://` URI.

---

## Transport

COP runs over an **iroh** connection using the ALPN `cassis-order`.

1. The client dials the server's endpoint ID (via `_relay` if specified) and opens a single bidirectional stream.
2. Both sides exchange newline-delimited hypereffect messages on this stream.
3. The client's first message must be `hello` with the following fields (servers ignore unknown fields):
   - `session` (string, required): Client-generated session token with at least 128 bits of entropy. If missing or empty, the server may close the connection.
   - `params` (object of strings, optional): Decoded fragment parameters from the `cop://` URI. Omitted if there are none; non-string-object values are ignored.
   - `force_resume` (boolean, optional): If `true`, requires the server to resume the named session or close with `session_not_found`.
4. Either side ends the flow by closing the connection. A server may send a `close` message before disconnecting.

**Example `hello` messages:**

```
hello {"session":"f1K9xQ2v8Tn4LmZp7Rb3wq"}
hello {"params":{"table":"12","name":"Luigi's Pizza"},"session":"f1K9xQ2v8Tn4LmZp7Rb3wq"}
hello {"params":{"table":"12","name":"Luigi's Pizza"},"session":"f1K9xQ2v8Tn4LmZp7Rb3wq","force_resume":true}
```

---

## Sessions

Every flow is identified by a `session` token generated by the client.

- **Session tokens are bearer tokens:** Anyone with the token can reopen the flow. Clients must generate tokens with at least 128 bits of randomness.
- **Local history:** Clients store the server's endpoint ID, relay, URI parameters, `session` token, and paid/issued invoices so the user can view history or reconnect later.
- **Connection URI reuse vs. session resume:** Scanning a reusable QR code (like a table menu) generates a fresh `session` token for a new order. Reconnecting from history reuses the saved `session` token (and original `params`) with `"force_resume":true`.
- **Client endpoint IDs:** Because iroh mutually authenticates connections, the server sees the client's iroh public key. Wallets choose their own key rotation policy (per-flow, per-merchant, or global). Servers may use the client endpoint ID as a hint or for rate-limiting, but must not rely on it as a stable account identity.
- **Retention policy:** Servers decide how long to remember sessions. A coffee stand might keep no state at all, while a merchant offering receipts or refunds will store session state.

### Resuming a session

- **Without `"force_resume":true`:** The server may either resume the session (if known) or start a fresh flow.
- **With `"force_resume":true`:** The server must resume the session if known. If the session is unknown or expired, the server must not start a new flow; it must send `close` with reason `session_not_found` and disconnect:
  ```
  close {"reason":"session_not_found"}
  ```
  When a client receives `session_not_found`, it notifies the user that the server no longer has the order while keeping its own local receipt record.

---

## Messages

In addition to standard hypereffect messages (`hello`, `metadata`, `element`, `remove`, `signal`, `action`, `close`), COP defines:

| Tag              | Direction       | Purpose                                                        |
| ---              | ---             | ---                                                            |
| `invoice`        | server → client | Request payment from the client                                |
| `invoicerequest` | server → client | Offer money to the client and ask for an invoice               |
| `invoice`        | client → server | Return a client-generated invoice in reply to `invoicerequest` |

Invalid messages or messages missing required fields are ignored.

### `metadata` (server → client)

Extends the hypereffect `metadata` message (`name`, `description`, `icon`) with one optional field:

- `mode` (string, optional): Controls URI reuse. If omitted, the URI is reusable for new flows. Unknown values are ignored.
  - `"single_use"`: The URI is intended for a single transaction (e.g., a refund voucher or single-checkout QR). The client should not start new flows from this URI. If scanned again, the client should resume its existing session for that URI or warn the user it was already used. Servers must still enforce single-use payouts on their end.

```
metadata {"name":"Luigi's Pizza","description":"Refund for order 2f8c","mode":"single_use"}
```

### `invoice` (server → client)

Asks the client to pay a Cassis invoice.

- `invoice` (object, required): The Cassis invoice JSON object.

```
invoice {"invoice":{"payment_hash":"3f9a…e21c","amount_msat":10750000,"expires_at":1793875200,…}}
```

**Behavior:**
- The client displays its native payment prompt. Amount and payee must always be read from `invoice`, never from page elements.
- If the user dismisses the prompt, the invoice remains attached to the session so the user can pay it later while the flow is open.
- A new `invoice` message replaces any previous unpaid invoice in the session.

### `invoicerequest` (server → client)

Offers money to the client and asks it to generate an invoice.

- `amount` (integer, required): Amount offered in satoshis (the resulting Cassis invoice will be for `amount × 1000` msat).
- `description` (string, optional): Description to display to the user and include in the generated invoice.

```
invoicerequest {"amount":24000,"description":"Refund for unused days"}
```

**Behavior:**
- If the user accepts, the client generates a Cassis invoice and sends it in an `invoice` message.
- If the user declines, the client sends nothing. Servers must not block waiting for a reply.

### `invoice` (client → server)

Sent by the client in response to an `invoicerequest`.

- `invoice` (object, required): The client-generated Cassis invoice JSON object.

```
invoice {"invoice":{"payment_hash":"5c04…9a7e","amount_msat":24000000,"expires_at":1793872800,…}}
```

