import express from 'express';
import http from 'http';
import socketio from 'socket.io';

// Create a new express application instance
const app: express.Application = express();
const httpServer = new http.Server(app);
const io = socketio(httpServer);

app.get('/', function (req, res) {
  res.send('Hello World!');
});

io.on('connection', function(socket) {
  console.log('a user connected');
  socket.on('disconnect', function() {
    console.log('a user disconnected');
  })
});

httpServer.listen(3001, function () {
  console.log('Listening on port 3001!');
});