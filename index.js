const express = require('express')
const app = express()
const http = require('http').createServer(app)
const io = require('socket.io')(http)
const rooms = []

app.use('/', express.static('public', { index: 'connexion.html' }));

app.get('/', (req, res) => {
    res.send('Le serveur fonctionne correctement')
})

http.listen(3000, () => {
    console.log('Serveur lancé sur http://localhost:3000')
})

io.on('connection', (socket) => {
    console.log('Un utilisateur s\'est connecté')

    socket.on('message', (msg) => {
        io.emit('message', msg)
        console.log(msg)
    })

    socket.on('create-room', (roomName) => {
        if (roomName != null) {
            rooms.push(roomName)
            socket.join(roomName)
            socket.currentRoom = roomName
            socket.emit('message', "Vous avez créé et rejoint la room : "+roomName)
            console.log("room " +roomName+" was created and joined by" +socket.id)
            console.log(rooms)
        }
    })

    socket.on('join-room', (roomName) => {
        if (roomName != null && rooms.indexOf(roomName) !== -1) {
            socket.join(roomName)
            socket.currentRoom = roomName
            socket.emit('message', "Vous avez rejoint la room : "+roomName)
            console.log("room " +roomName+" was joined")
        }
    })
})