const socket = io()

const regForm = document.getElementById("reg-form")
const usernameInput = document.getElementById("username")
const passwordInput = document.getElementById("password")

regForm.addEventListener('submit', registerUser)

async function registerUser(e) {
    e.preventDefault()
    console.log("caca")
    
    const username = usernameInput.value.trim()
    const password = passwordInput.value

    if (username.length < 3 || username.length > 16) {
        alert('Username must contain between 3 and 16 caracters.')
        return
    }

    if (password.length < 6) {
        alert('Password must be at least 6 caracters.')
        return
    }

    socket.emit('register', { username, password })
}

socket.on('register-success', () => {
    alert('Account created!')
    localStorage.setItem('username', usernameInput.value.trim())
    window.location.href = '../../src/index.html'
})

socket.on('register-error', (error) => {
    alert(error)
})