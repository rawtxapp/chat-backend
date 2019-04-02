import express from 'express';
import http from 'http';
import socketio from 'socket.io';
import Message from './Message';
import fs from 'fs';
import RestLnd from './RestLnd';
import MessageDB from './MessageDB';

// Create a new express application instance
const app: express.Application = express();
const httpServer = new http.Server(app);
const io = socketio(httpServer);

let boltheadCounter = 1;
const MAX_MESSAGES = 200; // don't keep more than this many messages in memory.
const lndBackend = new RestLnd(process.env.LND_BACKEND_HOST, process.env.LND_BACKEND_PORT);
lndBackend.setAdminMacaroon(process.env.ADMIN_MACAROON || "");
const messageBackend = new MessageDB();

const SAT_PER_MESSAGE = "10";

let lndAddress = "";

const unhealthyLnd = (msg = "") => {
  console.log('Unhealthy lnd backend:', msg, '.');
  process.exit();
};

lndBackend.getInfo().then(a => {
  if (!a.identity_pubkey) {
    unhealthyLnd("no identity pubkey");
  } else {
    lndAddress = a.uris[0];
    lndBackend.subInvoices((i: any) => {
      if (i.result.settled) {
        messageBackend.settleMessageWithInvoice(i.result.payment_request, (id: number) => {
          io.emit('settled', id);
        }, (sat: number) => {
          io.emit('satoshiCounter', sat * 10);
        });
      }
    });
  }
}).catch((err) => {
  unhealthyLnd(err);
});


app.get('/', function (req, res) {
  res.send('Hello World!');
});

io.on('connection', function (socket) {
  console.log('a user connected');

  boltheadCounter++;
  io.emit('updateBoltheadCounter', boltheadCounter);
  io.emit('satoshiCounter', messageBackend.satoshiCounter * 10);
  io.emit('nodeAddress', lndAddress);

  messageBackend.getLastNMessages(MAX_MESSAGES, (msgs: Message[]) => {
    socket.emit('initialMessages', msgs);
  });

  socket.on('disconnect', function () {
    console.log('a user disconnected');

    boltheadCounter--;
    io.emit('updateBoltheadCounter', boltheadCounter);
  });

  socket.on('newMessage', async (msg: Message) => {
    msg.settled = false;
    const invoice = await lndBackend.addInvoiceSimple(msg.message.substr(0, 20),
      SAT_PER_MESSAGE);
    if (!invoice.payment_request) {
      console.log('Failed to get a payment_request, got ', invoice, ' instead');
      return;
    }
    msg.invoice = invoice.payment_request;
    // messages.push(msg);
    messageBackend.addNewMessage(msg);
    io.emit('newMessage', msg);
  });
});

httpServer.listen(3001, function () {
  console.log('Listening on port 3001!');
});