const username = localStorage.getItem('username')

const socket = io()

const message_input = document.getElementById('message-input')
const chatDisplay = document.querySelector('.chat-display')
const disconnect_button = document.getElementById("disconnect-button")
const joined_room = document.getElementById('room-join-input')
const usersList = document.querySelector('.user-list')
const roomList = document.querySelector('.room-list')
const usernameDisplay = document.querySelector("#current-username")

// Should be useless now, but j'ai pas envie de retirer en real
if (!username || username.trim() === "") {
    window.location.href = '/'
} else {
    socket.emit('verify-session', username)
}

// If there is something wrongggg
socket.on('session-invalid', () => {
    localStorage.removeItem('username')
    alert('Votre session a expiré, veuillez vous reconnecter')
    window.location.href = '/'
})

// If session is valid
socket.on('session-valid', (userData) => {
    // Afficher le username
    usernameDisplay.textContent = username 
    console.log('Connecté en tant que:', userData.username)
})


socket.on('error', (errorMessage) => {
    alert(errorMessage)
})

function sendMessage(e) {
    e.preventDefault()
    if (message_input.value.trim() !== '') {
        socket.emit('message', {
            name: username,
            text: message_input.value
        })
        // Clear the text and focus on text entry so user don't have to click on
        message_input.value = ''
    }
    message_input.focus()
}

function enterRoom(e) {
    e.preventDefault()
    if (joined_room.value.trim() !== '') {
        socket.emit('enterRoom', {
            name: username,
            room: joined_room.value
        })
        joined_room.value = ''
    }
}

// When join room is pressed
document.querySelector('.form-join-room')
    .addEventListener('submit', enterRoom)

// When send message is pressed
document.querySelector('.message-form')
    .addEventListener('submit', sendMessage)


disconnect_button.addEventListener("click", (e) => {
    e.preventDefault()
    localStorage.removeItem("username")
    window.location.href = 'connexion/login.html'
})

socket.on('message', (data) => {
    const { name, text, time } = data
    const li = document.createElement('li')
    li.className = 'post'
    if (name === username) li.className = 'post post--right'
    if (name !== username) li.className = 'post post--left'
    if (name === 'INFO') li.className = 'post post--info'
    if (name === 'ALERT') li.className = 'post post--alert'


    if (name === 'ALERT') {
        li.innerHTML =
        `<div class="post__header">
            <i class="fa-solid fa-circle-exclamation alert--icon"></i>
            <span class="post__header--time">${time}</span>
        </div>
        <div class="post__text">${text}</div>`
    }
    else if (name === 'INFO') {
        li.innerHTML =
        `<div class="post__header">
            <i class="fa-solid fa-circle-info info--icon"></i>
            <span class="post__header--time">${time}</span>
        </div>
        <div class="post__text">${text}</div>`
    }
    else if (name !== username) {
        li.innerHTML = `<div class="post__header">
            <span class="post__header--name">${name}</span>
            <span class="post__header--time">${time}</span>
        </div>
        <div class="post__text">${text}</div>`
    } else {
        li.innerHTML = `<div class="post__text">${text}</div>
        <div class="post__header">
            <span class="post__header--time">${time}</span>
        </div>`
    }
    chatDisplay.appendChild(li)
    chatDisplay.scrollTop = chatDisplay.scrollHeight
})

socket.on('userList', ({ users }) => {
    showUsers(users)
})

socket.on('roomList', ({ rooms }) => {
    showRooms(rooms)
})

function showUsers(users) {
    usersList.textContent = ''
    if (users && users.length > 0) {
        users.forEach((user, i) => {
            usersList.textContent += ` ${user.username}`
            if (users.length > 1 && i !== users.length - 1) {
                usersList.textContent += ","
            }
        })
    }
}

function showRooms(rooms) {
    roomList.textContent = ''
    if (rooms && rooms.length > 0) {
        rooms.forEach((room) => {
            const roomDiv = document.createElement('div')
            roomDiv.className = 'roomItem'

            // Room item content
            roomDiv.innerHTML = `
                <span class="roomItem--count"><i class="fa-solid fa-user"></i>${room.userCount}</span>
                <span class="roomItem--name">${room.name}</span>
            `
            
            // Tooltip
            roomDiv.title = `Click to join ${room.name} (${room.userCount} user${room.userCount > 1 ? 's' : ''})`
            
            // Click action
            roomDiv.addEventListener('click', () => {
                socket.emit('enterRoom', {
                    name: username,
                    room: room.name
                })
            })
            
            roomList.appendChild(roomDiv)
        })
    }
}