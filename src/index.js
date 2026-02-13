const express = require('express')
const app = express()
const http = require('http').createServer(app)
const io = require('socket.io')(http)
const { UserDB, MessageDB, RoomDB, db } = require('./database')
const fs = require('fs')
const sharp = require('sharp')
let activeRooms = []

// For images
const multer = require('multer')
const path = require('path')

const UPLOAD_TEMP_DIR = path.join(__dirname, 'temp_uploads')
const UPLOAD_FINAL_DIR = path.join(__dirname, '../public/uploads')

// TEMP_UPLOAD AND UPLOADS HAVE TO EXIST FOR SURE
if (!fs.existsSync(UPLOAD_TEMP_DIR)) {
    console.log('Creating temporary folder:', UPLOAD_TEMP_DIR)
    fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true })
}

if (!fs.existsSync(UPLOAD_FINAL_DIR)) {
    console.log('Creating final folder:', UPLOAD_FINAL_DIR)
    fs.mkdirSync(UPLOAD_FINAL_DIR, { recursive: true })
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_TEMP_DIR)
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
    }
})
const upload = multer({ storage: storage })

function loadRooms() {
    const stmt = db.prepare('SELECT id, room_name, is_permanent FROM rooms')
    activeRooms = stmt.all()
    console.log(`${activeRooms.length} rooms loaded:`, activeRooms.map(r => r.room_name))
}

// Load all permanent rooms
loadRooms()

// State
const UsersState = {
    users: [], // [{socketId, userId, username, room, status}]

    setUsers: function (newUsersArray) {
        this.users = newUsersArray
    },

    // Add/modify a connected user
    addUser: function(socketId, userId, username) {
        const user = { socketId, userId, username, room: 'General', status: 'online' }
        this.users = [...this.users.filter(u => u.socketId !== socketId), user]
        return user
    },

    // Update the room
    setUserRoom: function(socketId, room) {
        const user = this.users.find(u => u.socketId === socketId)
        if (user) {
            user.room = room
        }
        return user
    },

    // Get user by socket id
    getBySocketId: function(socketId) {
        return this.users.find(u => u.socketId === socketId)
    },

    // Get user by his id (database)
    getByUserId: function(userId) {
        return this.users.find(u => u.userId === userId)
    },

    // Get user by his username
    getUserByName: function(username) {
        return this.users.find(u => u.username === username)
    },

    // Get all users in a room
    getUsersInRoom: function(room) {
        return this.users.filter(u => u.room === room)
    },

    // On disconnect
    removeUser: function(socketId) {
        this.users = this.users.filter(u => u.socketId !== socketId)
    },

    // Get all active rooms
    getActiveRooms: function() {
        return [...new Set(this.users.map(u => u.room).filter(room => room !== null))]
    }
}

// Make everything accessible with express
app.use(express.static('public'))

// Photo upload endpoint
app.post('/upload-photo', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' })
        }

        const user = UsersState.getBySocketId(req.body.socketId)
        if (!user) {
            fs.unlinkSync(req.file.path)
            return res.status(401).json({ error: 'User not authenticated' })
        }

        // SHARP CONVERSION
        const processedFilename = `img${Date.now()}_${Math.round(Math.random() * 1E9)}.webp`
        const finalFilePath = path.join(UPLOAD_FINAL_DIR, processedFilename)

        await sharp(req.file.path)
            .resize(800, 600, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .webp({ quality: 80 })
            .toFile(finalFilePath)

        // CLEAN TEMP STORAGE
        fs.unlinkSync(req.file.path)

        const publicUrl = `/uploads/${processedFilename}`

        // Get room info
        const rooms = RoomDB.getAllRooms()
        const room = rooms.find(r => r.room_name === user.room)

        if (room) {
            // Get file size
            const stats = fs.statSync(finalFilePath)
            const fileSize = stats.size

            // Message text
            const messageText = req.body.message && req.body.message.trim() !== '' 
                ? req.body.message.trim() 
                : ''

            // Save photo message to database
            const result = MessageDB.save(
                user.userId,
                user.username,
                room.id,
                messageText,
                publicUrl,
                'image/webp',
                fileSize,
                processedFilename
            )

            if (result.success) {
                const messageQuery = db.prepare(`
                    SELECT 
                        m.*,
                        a.file_path,
                        a.file_type,
                        a.file_size,
                        a.original_name
                    FROM messages m
                    LEFT JOIN message_attachments a ON m.id = a.message_id
                    WHERE m.id = ?
                `).get(result.messageId)
                
                io.to(user.room).emit('message', messageQuery)
            }
        }

        res.json({ success: true, photoUrl: publicUrl })

    } catch (error) {
        console.error('Error processing photo:', error)
        res.status(500).json({ error: 'Error processing photo' })
    }
})

// Start the server
http.listen(3000, () => {
    console.log('Server started on http://localhost:3000')
})

// All events
io.on('connection', (socket) => {
    console.log('User ' + socket.id + ' connected')

    // On register
    socket.on('register', async ({ username, password }) => {
        const result = await UserDB.register(username, password)

        if (result.success === true) {
            socket.emit('register-success')
        } else {
            socket.emit('connexion-error', result.error)
        }
    })

    // On login
    socket.on('login', async ({ username, password}) => {
        const result = await UserDB.login(username, password)

        if (result.success === true) {
            socket.emit('login-success')
        } else {
            socket.emit('connexion-error', result.error)
        }
    })

    socket.on('verify-session', (username) => {
        // Verify if the user is in the db
        const stmt = db.prepare('SELECT id, username FROM users WHERE username = ?')
        const user = stmt.get(username)

        if (user) {
            // Check where the user is
            const roomStmt = db.prepare(`
                SELECT r.id, r.room_name 
                FROM room_members rm
                JOIN rooms r ON rm.room_id = r.id
                WHERE rm.user_id = ?
            `)
            let userRoom = roomStmt.get(user.id)

            // If no room attributed, move him to general
            if (!userRoom) {
                const generalRoom = db.prepare('SELECT id, room_name FROM rooms WHERE room_name = ?').get('General')
                if (generalRoom) {
                    RoomDB.joinRoomById(user.id, generalRoom.id)
                    userRoom = generalRoom
                }
            }

            UsersState.addUser(socket.id, user.id, user.username)
            const userState = UsersState.getBySocketId(socket.id)
            userState.room = userRoom.room_name

            socket.join(userRoom.room_name)

            socket.emit('session-valid', { 
                username: user.username, 
                userId: user.id,
                roomName: userRoom.room_name
            })

            // Load message history
            const historyResult = MessageDB.getByRoom(userRoom.id, 50)
            if (historyResult.success) {
                socket.emit('messageHistory', historyResult.messages)
            }

            socket.emit('roomList', {
                rooms: RoomDB.getAllRooms().map(room => ({
                    ...room,
                    userCount: UsersState.getUsersInRoom(room.room_name).length
                }))
            })

            socket.emit('userList', {
                users: UsersState.getUsersInRoom(userRoom.room_name)
            })

            broadcastRoomList()

            sendMessage(userRoom.room_name, username, `${username} joined the room`, {
                messageType: MESSAGE_TYPES.USER_JOIN,
                target: 'others',
                socketId: socket.id
            })

            broadcastUserList(userRoom.room_name)

        } else {
            // User is not in the db
            socket.emit('session-invalid')
        }
    })

    socket.on('try-create-room', ({roomName}) => {
        const user = UsersState.getBySocketId(socket.id)
        
        if (!user) {
            socket.emit('create-room-failed', {errorMessage: 'You must be connected.'})
            return
        }

        if (!roomName || roomName.trim() === '') {
            socket.emit('create-room-failed', {errorMessage: 'Room name cannot be empty.'})
            return
        }

        const normalizedRoomName = roomName.trim().charAt(0).toUpperCase() + roomName.trim().slice(1).toLowerCase()

        // Check if room already exists
        const existingRoom = db.prepare('SELECT id FROM rooms WHERE room_name = ?').get(normalizedRoomName)
        if (existingRoom) {
            socket.emit('create-room-failed', {errorMessage: 'This room already exists.'})
            return
        }

        // Create the room
        const result = RoomDB.createRoom(user.userId, normalizedRoomName)
        
        if (!result.success) {
            socket.emit('create-room-failed', {errorMessage: result.error})
            return
        }

        // Join the new room (same logic as enterRoom)
        const prevRoom = user.room

        // Leave previous room
        if (prevRoom != null) {
            socket.leave(prevRoom)
            sendMessage(prevRoom, 'INFO', user.username + ' left the room', {
                isSystemMessage: true,
                target: 'room'
            })
            broadcastUserList(prevRoom)
            
            const deleteResult = RoomDB.deleteEmptyRooms()
            if (deleteResult.deletedCount > 0) console.log(`${deleteResult.deletedCount} rooms removed.`)
        }

        // Update user's room
        user.room = normalizedRoomName
        socket.join(normalizedRoomName)

        // Notify
        sendMessage(normalizedRoomName, "INFO", user.username + " created and joined the room", {
            isSystemMessage: true,
            target: 'room'
        })

        socket.emit('roomChanged', normalizedRoomName)

        // Update lists
        broadcastUserList(normalizedRoomName)
        broadcastRoomList()

        socket.emit('create-room-success')
    })

    // When user sends message
    socket.on('message', (data) => {
        const user = UsersState.getBySocketId(socket.id)
        
        if (!user) {
            socket.emit('error', 'You must be connected to send messages')
            return
        }

        if (!user.room) {
            socket.emit('error', 'You must be in a room to send messages')
            return
        }

        sendMessage(user.room, user.username, data.text, {
            messageType: MESSAGE_TYPES.USER_MESSAGE,
            isSystemMessage: false,
            target: 'room'
        })
    })

    // When user enters a room
    socket.on('enterRoom', async ({name, roomName}) => {
        const user = UsersState.getBySocketId(socket.id)
        
        if (!user) {
            socket.emit('error', 'You must be connected.')
            return
        }

        if (!roomName || roomName.trim() === '') {
            console.log('Invalid room:', roomName)
            socket.emit('error', 'Invalid room name: ' + roomName)
            return
        }

        const normalizedRoomName = roomName.trim().charAt(0).toUpperCase() + roomName.trim().slice(1).toLowerCase()

        // Join the room (it creates one if the room doesn't exist)
        const result = RoomDB.joinRoomByName(user.userId, normalizedRoomName)
        if (!result.success) {
            socket.emit('error', result.error)
            return
        }

        const prevRoom = user.room

        // Cannot join a room that you are already in
        if (prevRoom === normalizedRoomName) {
            sendMessage(normalizedRoomName, 'SYSTEM', 'You are already in this room', {
                messageType: MESSAGE_TYPES.SYSTEM_ALERT,
                target: 'client',
                socketId: socket.id
            })
            return
        }

        // Update previous room
        if (prevRoom != null) {
            socket.leave(prevRoom)
            sendMessage(prevRoom, user.username, `${user.username} left the room`, {
                messageType: MESSAGE_TYPES.USER_LEAVE,
                target: 'room'
            })
            
            broadcastUserList(prevRoom)

            const deleteResult = RoomDB.deleteEmptyRooms()
            if (deleteResult.deletedCount > 0) console.log(`${deleteResult.deletedCount} rooms removed.`)
        }

        // Update user's room
        user.room = normalizedRoomName
        socket.join(normalizedRoomName)

        // Load message history
        const rooms = RoomDB.getAllRooms()
        const currentRoom = rooms.find(r => r.room_name === normalizedRoomName)
        
        if (currentRoom) {
            const historyResult = MessageDB.getByRoom(currentRoom.id, 50)
            if (historyResult.success) {
                socket.emit('messageHistory', historyResult.messages)
            }
        }

        // Tell everyone except the client
        sendMessage(normalizedRoomName, user.username, `${user.username} joined the room`, {
            messageType: MESSAGE_TYPES.USER_JOIN,
            target: 'others',
            socketId: socket.id
        })

        // Only to client
        sendMessage(normalizedRoomName, 'SYSTEM', `You have joined ${normalizedRoomName}`, {
            messageType: MESSAGE_TYPES.SYSTEM_INFO,
            target: 'client',
            socketId: socket.id
        })

        // To display the correct room
        socket.emit('roomChanged', normalizedRoomName)

        // Update lists
        broadcastUserList(normalizedRoomName)
        broadcastRoomList()
    })

    // Disconnect
    socket.on('disconnect', () => {
        const user = UsersState.getBySocketId(socket.id)
        
        if (user) {
            const userRoom = user.room
            
            RoomDB.leaveRoom(user.userId)

            sendMessage(userRoom, user.username, `${user.username} disconnected`, {
                messageType: MESSAGE_TYPES.USER_DISCONNECT,
                target: 'room'
            })
            
            broadcastUserList(userRoom)

            UsersState.removeUser(socket.id)

            const result = RoomDB.deleteEmptyRooms()
            if (result.deletedCount > 0) console.log(`${result.deletedCount} rooms removed.`)

            broadcastRoomList()

            console.log(`User ${user.username} (${socket.id}) disconnected`)
        } else {
            console.log(`Unknown user ${socket.id} disconnected`)
        }
    })
})

const MESSAGE_TYPES = {
    USER_MESSAGE: 'USER_MESSAGE',
    USER_JOIN: 'USER_JOIN',
    USER_LEAVE: 'USER_LEAVE',
    USER_DISCONNECT: 'USER_DISCONNECT',
    ROOM_CREATED: 'ROOM_CREATED',
    SYSTEM_INFO: 'SYSTEM_INFO',
    SYSTEM_ALERT: 'SYSTEM_ALERT',
    SYSTEM_ERROR: 'SYSTEM_ERROR'
}

// Helper functions
function sendMessage(roomName, username, text, options = {}) {
    const {
        messageType = MESSAGE_TYPES.USER_MESSAGE,
        target = 'room',
        socketId = null
    } = options

    const rooms = RoomDB.getAllRooms()
    const room = rooms.find(r => r.room_name === roomName)
    
    if (!room) {
        console.error(`Room ${roomName} not found`)
        return
    }

    // System user (id = 0)
    let userId = 0
    if (messageType === MESSAGE_TYPES.USER_MESSAGE) {
        const user = UsersState.getUserByName(username)
        userId = user ? user.userId : 0
    }

    let messageQuery
    if (target !== 'client') {
        const result = MessageDB.save(userId, username, room.id, text, null, null, null, null, messageType)
        
        if (!result.success) {
            console.error('Error saving message:', result.error)
            return
        }

        messageQuery = db.prepare(`
            SELECT * FROM messages WHERE id = ?
        `).get(result.messageId)
    } else {
        messageQuery = {
            username: username,
            message: text,
            message_type: messageType,
            created_at: new Date().toISOString()
        }
    }

    switch(target) {
        case 'room':
            io.to(roomName).emit('message', messageQuery)
            break
        case 'client':
            if (!socketId) {
                console.error('socketId required for client target')
                return
            }
            io.to(socketId).emit('message', messageQuery)
            break
        case 'others':
            if (!socketId) {
                console.error('socketId required for others target')
                return
            }
            io.to(socketId).to(roomName).emit('message', messageQuery)
            break
    }
}

function broadcastRoomList() {
    io.emit('roomList', {
        rooms: RoomDB.getAllRooms().map(room => ({
            ...room,
            userCount: UsersState.getUsersInRoom(room.room_name).length
        }))
    })
}

function broadcastUserList(roomName) {
    io.to(roomName).emit('userList', {
        users: UsersState.getUsersInRoom(roomName)
    })
}