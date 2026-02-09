const express = require('express')
const app = express()
const http = require('http').createServer(app)
const io = require('socket.io')(http)
const rooms = []

// State
const UsersState = {
    users: [],
    setUsers: function (newUsersArray) {
        this.user = newUsersArray
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
    const currUser = socket.id
    console.log('User ' + currUser + ' connected :)')

    socket.on('message', (msg) => {
        io.emit('message', msg)
        console.log(msg)
    })

    socket.on('create-room', (roomName) => {
        if (roomName != null) {
            rooms.push(roomName)
            joinRoom(roomName)
            socket.emit('message', "Vous avez créé : "+roomName)
            console.log("room " +roomName+" was created and joined by" +socket.id)
            console.log(rooms)
        }
    })

    socket.on('join-room', ({username, roomName}) => {
        if (roomName != null && rooms.indexOf(roomName) !== -1) {
            const prevRoom = getUser(currUser)?.room

            if (prevRoom != null) {
                socket.leave(prevRoom)
                io.to(prevRoom).emit('message', buildMessage('INFO', username + ' has left the room'))
            }

            const user = activateUser(currUser, name, room)

            if (prevRoom) {
                io.to(prevRoom).emit('userList', {
                    users: [getUsersInRoom(prevRoom)]
                })
            }

            socket.join(user.room)

            socket.emit('message', buildMessage("INFO", "You joined the room: " + user.room))

            io.to(user.room).emit('userList', {
                users: getUsersInRoom(user.room)
            })

            io.emit('roomList', {
                rooms: getAllActiveRooms()
            })
        }
    })

    // When user disconnect
    socket.on('disconnect', () => {
        const user = getUser(socket.id)
        userLeavesApp(socket.id)

        if (user) {
            io.to(user.room).emit('message', buildMsg(ADMIN, `${user.name} has left the room`))

            io.to(user.room).emit('userList', {
                users: getUsersInRoom(user.room)
            })

            io.emit('roomList', {
                rooms: getAllActiveRooms()
            })
        }

        console.log(`User ${socket.id} disconnected`)
    })
})


function buildMessage(name, text) {
    return {
        name,
        text,
        time: new Intl.DateTimeFormat('default', {
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric'
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