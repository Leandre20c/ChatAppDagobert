

const express = require('express')
const app = express()
const http = require('http').createServer(app)
const io = require('socket.io')(http)

//Dit quel fichier ouvrir pour le client
app.use(express.static('public'))

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
})