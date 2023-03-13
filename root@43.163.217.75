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
    await socket.join(roomId);
    socket.roomId = roomId;
    socket.in(roomId).emit('user-join', socket.id);
    console.warn(socket.rooms);
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
  console.log('a user connected');
});

server.listen(3000, () => {
  console.log('listening on *:3000');
});