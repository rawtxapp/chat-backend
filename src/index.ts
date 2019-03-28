import express from 'express';
import http from 'http';
import socketio from 'socket.io';
import Message from './Message';
import fs from 'fs';
import RestLnd from './RestLnd';

// Create a new express application instance
const app: express.Application = express();
const httpServer = new http.Server(app);
const io = socketio(httpServer);

let boltheadCounter = 1;
let messages: Message[] = [];
let messageIdCounter = 0;
const MAX_MESSAGES = 200; // don't keep more than this many messages in memory.
const MESSAGES_FILE = 'messages.json';
const lndBackend = new RestLnd(process.env.LND_BACKEND_HOST, process.env.LND_BACKEND_PORT);
lndBackend.setAdminMacaroon(process.env.ADMIN_MACAROON || "");

const SAT_PER_MESSAGE = "10";

const unhealthyLnd = () => {
  console.log('Unhealthy lnd backend.');
  process.exit();
};

lndBackend.getInfo().then(a => {
  if (!a.identity_pubkey) {
    unhealthyLnd();
  }
}).catch(() => {
  unhealthyLnd();
});

fs.readFile(MESSAGES_FILE, 'utf8', function (err, data) {
  if (err) {
    console.log('Couldn\'t load messages from disk!', err);
  } else {
    if (data.length > 0) {
      messages = JSON.parse(data);
      let lastMessageId = 0;
      if (messages.length > 1) {
        lastMessageId = messages[messages.length - 1].id || 0;
      }
      console.log('Loaded messages from file, last message id:', lastMessageId);
      messageIdCounter = lastMessageId + 1;
    }
  }
});

app.get('/', function (req, res) {
  res.send('Hello World!');
});

io.on('connection', function (socket) {
  console.log('a user connected');

  boltheadCounter++;
  io.emit('updateBoltheadCounter', boltheadCounter);

  socket.emit('initialMessages', messages);

  socket.on('disconnect', function () {
    console.log('a user disconnected');

    boltheadCounter--;
    io.emit('updateBoltheadCounter', boltheadCounter);
  });

  socket.on('newMessage', async (msg: Message) => {
    msg.settled = false;
    msg.id = messageIdCounter++;
    const invoice = await lndBackend.addInvoiceSimple(msg.id.toString(),
      SAT_PER_MESSAGE);
    if (!invoice.payment_request) {
      console.log('Failed to get a payment_request, got ', invoice, ' instead');
      return;
    }
    msg.invoice = invoice.payment_request;
    // SET INVOICE msg.invoice =
    messages.push(msg);
    if (messages.length > MAX_MESSAGES) {
      // inefficient and ugly.
      messages.shift();
    }
    io.emit('newMessage', msg);
  });
});

httpServer.listen(3001, function () {
  console.log('Listening on port 3001!');
});

process.on('SIGINT', function () {
  process.exit();
});

process.on('exit', function () {
  console.log('');
  console.log("Exiting: saving in-memory messages to disk!");
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages));
});