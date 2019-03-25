import express from 'express';
import http from 'http';
import socketio from 'socket.io';
import Message from './Message';

// Create a new express application instance
const app: express.Application = express();
const httpServer = new http.Server(app);
const io = socketio(httpServer);

let boltheadCounter = 3;
let messages: Message[] = [];
const MAX_MESSAGES = 200; // don't keep more than this many messages in memory.

app.get('/', function (req, res) {
  res.send('Hello World!');
});

io.on('connection', function(socket) {
  console.log('a user connected');

  boltheadCounter++;
  io.emit('updateBoltheadCounter', boltheadCounter);

  socket.emit('initialMessages', messages);

  socket.on('disconnect', function() {
    console.log('a user disconnected');

    boltheadCounter--;
    io.emit('updateBoltheadCounter', boltheadCounter);
  });

  socket.on('newMessage', function(msg: Message) {
    console.log('adding message', msg);
    msg.settled = false;
    // SET INVOICE msg.invoice =
    messages.push(msg);
    if(messages.length > MAX_MESSAGES){
      // inefficient and ugly.
      messages.shift();
    }
    io.emit('newMessage', msg);
  });
});

httpServer.listen(3001, function () {
  console.log('Listening on port 3001!');
});