const user_form = document.getElementById('user-form')
const name_input = document.getElementById("name-input")

user_form.addEventListener('submit', (e) => {
    e.preventDefault()

    if (name_input.value.trim() !== '') {
        localStorage.setItem("username", name_input.value)
        window.location.href = "/index.html"
    }
})