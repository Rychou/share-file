const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {  cors: { origin: "*" }});

app.get('/', (req, res) => {
  // res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
  socket.on('join', async (roomId) => {
    const currentSockets = await io.sockets.fetchSockets()
    if (currentSockets.length >= 10) {
      socket.emit('error', `more than 10 users are out of services, current users: ${currentSockets.length}`)
      return
    }
    await socket.join(roomId);
    console.warn('user joined ', socket.id)
    socket.roomId = roomId;
    // socket.in(roomId).emit('user-join', socket.id);
    const sockets = await io.in(roomId).fetchSockets();
    console.warn(sockets.map(socket => socket.id), socket.id);
    const otherSocket = sockets.find(item => item.id !== socket.id);
    console.warn(otherSocket);
    if (otherSocket) {
      socket.emit('user-join', otherSocket.id);
      otherSocket.emit('user-join', socket.id);
    }
    // console.warn(socket.rooms);
  })
  socket.on('offer', data => {
    console.log('receive offer')
    socket.in(socket.roomId).emit('offer', data);
  })
  socket.on('answer', data => {
    console.log('receive answer')
    socket.in(socket.roomId).emit('answer', data);
  })
  socket.on('candidate', data => {
    socket.in(socket.roomId).emit('candidate', data);
  })
  console.log('a user connected, ' + socket.id);
});

server.listen(3000, '0.0.0.0', () => {
  console.log('listening on *:3000');
});