const socket = io()

const message_input = document.getElementById('message-input')
const chatDisplay = document.querySelector('.chat-display')
const disconnect_button = document.getElementById("disconnect-button")
const joined_room = document.getElementById('room-join-input')
const usersList = document.querySelector('.user-list')
const roomList = document.querySelector('.room-list')

var username = localStorage.getItem("username")
if (username == null || username == "") {
    window.location.href = 'connexion.html'
}

function sendMessage(e) {
    e.preventDefault()
    socket.emit('message', {
        name: username,
        text: message_input.value
    })
    // Clear the text and focus on text entry so user don't have to click on
    message_input.value = ''
    message_input.focus()
}

function enterRoom(e) {
    e.preventDefault()
    socket.emit('enterRoom', {
        name: username,
        room: joined_room.value
    })

}

// When join room is pressed
document.querySelector('.form-join-room')
    .addEventListener('submit', enterRoom)

// When send message is pressed
document.querySelector('message-form')
    .addEventListener('submit', sendMessage)


disconnect_button.addEventListener("click", (e) => {
    e.preventDefault()

    localStorage.removeItem("username")
    window.location.href = 'connexion.html'
})

socket.on('message', (data) => {
    const { name, text, time } = data
    const li = document.createElement('li')
    li.className = 'post'
    if (name === username) li.className = 'post post--left'
    if (name !== username) li.className = 'post post--right'
    chatDisplay.appendChild(li)
    chatDisplay.scrollTop = chatDisplay.scrollHeight
})

socket.On('userList', ({ users }) => {
    showUsers(users)
})

socket.On('roomList', ({ rooms }) => {
    showUsers(rooms)
})

function showUsers(users) {
    usersList.textContent = ''
    if (users) {
        usersList.innerHTML = `<em>Users in ${chatRoom.value}:</em>`
        users.forEach((user, i) => {
            usersList.textContent += ` ${user.name}`
            if (users.length > 1 && i !== users.length - 1) {
                usersList.textContent += ","
            }
        })
    }
}

function showRooms(rooms) {
    roomList.textContent = ''
    if (rooms) {
        roomList.innerHTML = '<em>Active Rooms:</em>'
        rooms.forEach((room, i) => {
            roomList.textContent += ` ${room}`
            if (rooms.length > 1 && i !== rooms.length - 1) {
                roomList.textContent += ","
            }
        })
    }
}