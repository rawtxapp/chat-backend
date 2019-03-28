import express from 'express';
import http from 'http';
import socketio from 'socket.io';
import Message from './Message';
import fs from 'fs';

// Create a new express application instance
const app: express.Application = express();
const httpServer = new http.Server(app);
const io = socketio(httpServer);

let boltheadCounter = 1;
let messages: Message[] = [];
let messageIdCounter = 0;
const MAX_MESSAGES = 200; // don't keep more than this many messages in memory.
const MESSAGES_FILE = 'messages.json';

fs.readFile(MESSAGES_FILE, 'utf8', function (err, data) {
  if (err) {
    console.log('Couldn\'t load messages from disk!', err);
  } else {
    if (data.length > 0) {
      messages = JSON.parse(data);
      const lastMessageId = messages[messages.length - 1].id || 0;
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

  socket.on('newMessage', function (msg: Message) {
    msg.settled = false;
    msg.id = messageIdCounter++;
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