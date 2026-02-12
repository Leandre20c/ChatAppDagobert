const socket = io()

const regForm = document.getElementById("reg-form")
const logForm = document.getElementById("log-form")
const usernameInput = document.getElementById("username")
const passwordInput = document.getElementById("password")

// if are necessary, otherwise it crashed silently bcause either regform or logform is null
if (regForm) regForm.addEventListener('submit', registerUser)
//logForm.addEventListener('submit', registerUser)
if (logForm) logForm.addEventListener('submit', logUser) // Working better quand I put the correct function


// Im currently writing this code and I feel like those lines are fire 🔥🔥🔥 <- not chat gpt btw https://emojiterra.com/fr/feu/ bro gave the sources
// after few tests, j'admet que ça marche pas
function registerUser(e) {
    console.log("Try to register user")
    e.preventDefault()
    
    const username = usernameInput.value.trim()
    const password = passwordInput.value

    if (username.length < 6 || username.length > 16) {
        alert('Username must contain between 6 and 16 caracters.')
        return
    }

    if (password.length < 6) {
        alert('Password must be at least 6 caracters.')
        return
    }

    socket.emit('register', { username, password })
}

function logUser(e) {
    e.preventDefault()
    
    const username = usernameInput.value.trim()
    const password = passwordInput.value


    socket.emit('login', { username, password })
}

socket.on('register-success', () => {
    console.log('Register success')
    localStorage.setItem('username', usernameInput.value.trim())
    window.location.href = '../chat.html'
})

socket.on('login-success', () => {
    console.log('Login success')
    localStorage.setItem('username', usernameInput.value.trim())
    window.location.href = '../chat.html'
})

socket.on('connexion-error', (error) => {
    console.log('Error during connexion:', error)
    alert(error)
})