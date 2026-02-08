const socket = io()

const form = document.getElementById('form')
const input = document.getElementById('input')
const messages = document.getElementById('messages')

form.addEventListener('submit', (e) => {
    e.preventDefault()

    if (input.value.trim() !== '') {
        socket.emit('message', input.value)
        input.value = ''
    }
})

socket.on('message', (msg) => {
    const item = document.createElement('div')
    item.textContent = msg
    messages.appendChild(item)
})