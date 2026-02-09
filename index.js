const express = require('express')
const app = express()
const http = require('http').createServer(app)
const io = require('socket.io')(http)
const rooms = []

// State
const UsersState = {
    users: [],
    setUsers: function (newUsersArray) {
        this.users = newUsersArray
    }
}

app.use('/', express.static('public', { index: 'connexion.html' }));

app.get('/', (req, res) => {
    res.send('Le serveur fonctionne correctement')
})

http.listen(3000, () => {
    console.log('Serveur lancé sur http://localhost:3000')
})

io.on('connection', (socket) => {
    console.log('User ' + socket.id + ' connected')

    socket.on('register-username', (username) => {
        if (!username || username.trim() === '' || username.length > 16) {
            socket.emit('username-error', 'Pseudo invalide')
            return
        }

        // If username already exist
        const existingUser = UsersState.users.find(u => u.name.toLowerCase() === username.toLowerCase())
        if (existingUser) {
            socket.emit('username-error', 'Ce pseudo est déjà utilisé')
            return
        }

        // Register user without name
        const user = activateUser(socket.id, username, null)
        socket.emit('username-accepted', username)
        
        console.log(`User ${socket.id} registered as ${username}`)
    })

    socket.on('message', (data) => {
        const user = getUser(socket.id)
        
        if (!user) {
            socket.emit('error', 'Vous devez être connecté pour envoyer des messages')
            return
        }

        if (user.room) {
            io.to(user.room).emit('message', buildMessage(data.name, data.text))
        } else {
            io.emit('message', buildMessage(data.name, data.text))
        }
    })

    socket.on('enterRoom', ({name, room}) => {
        const user = getUser(socket.id)
        
        if (!user) {
            socket.emit('error', 'Vous devez être connecté')
            return
        }

        if (!room || room.trim() === '') {
            socket.emit('error', 'Nom de room invalide')
            return
        }

        const prevRoom = user.room

        if (prevRoom != null) {
            socket.leave(prevRoom)
            io.to(prevRoom).emit('message', buildMessage('INFO', name + ' a quitté le salon'))
            
            // Update previous room
            io.to(prevRoom).emit('userList', {
                users: getUsersInRoom(prevRoom)
            })
        }

        // Update user's room
        user.room = room
        socket.join(room)

        // If room doesnt exist, add it
        if (!rooms.includes(room)) {
            rooms.push(room)
        }

        socket.emit('message', buildMessage("INFO", "Vous avez rejoint : " + room))
        io.to(room).emit('message', buildMessage("INFO", name + " a rejoint le salon"))

        // Update lists
        io.to(room).emit('userList', {
            users: getUsersInRoom(room)
        })

        io.emit('roomList', {
            rooms: getAllActiveRooms()
        })
    })

    // Disconnect
    socket.on('disconnect', () => {
        const user = getUser(socket.id)
        
        if (user) {
            if (user.room) {
                io.to(user.room).emit('message', buildMessage('INFO', `${user.name} s'est déconnecté`))
                
                io.to(user.room).emit('userList', {
                    users: getUsersInRoom(user.room)
                })
            }

            userLeavesApp(socket.id)

            io.emit('roomList', {
                rooms: getAllActiveRooms()
            })

            console.log(`User ${user.name} (${socket.id}) disconnected`)
        } else {
            console.log(`Unknown user ${socket.id} disconnected`)
        }
    })
})


function buildMessage(name, text) {
    return {
        name,
        text,
        time: new Intl.DateTimeFormat('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date())
    }
}

// User functions
function activateUser(id, name, room) {
    const user = {id, name, room}
    UsersState.setUsers([
        ...UsersState.users.filter(user => user.id != id),
        user
    ])
    return user
}

function userLeavesApp(id) {
    UsersState.setUsers(
        UsersState.users.filter(user => user.id !== id)
    )
}

function getUser(id) {
    return UsersState.users.find(user => user.id === id)
}

function getUsersInRoom(room) {
    return UsersState.users.filter(user => user.room === room)
}

function getAllActiveRooms() {
    return Array.from(new Set(UsersState.users.map(user => user.room)))
}