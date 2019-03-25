import express from 'express';
import http from 'http';
import socketio from 'socket.io';
import Message from './Message';

// Create a new express application instance
const app: express.Application = express();
const httpServer = new http.Server(app);
const io = socketio(httpServer);

let boltheadCounter = 3;

app.get('/', function (req, res) {
  res.send('Hello World!');
});

io.on('connection', function(socket) {
  console.log('a user connected');

  boltheadCounter++;
  io.emit('updateBoltheadCounter', boltheadCounter);

  socket.on('disconnect', function() {
    console.log('a user disconnected');

    boltheadCounter--;
    io.emit('updateBoltheadCounter', boltheadCounter);
  });

  socket.on('newMessage', function(msg: Message) {
    msg.settled = false;
    // SET INVOICE msg.invoice =
    io.emit('newMessage', msg);
  });
});

httpServer.listen(3001, function () {
  console.log('Listening on port 3001!');
});