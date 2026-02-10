const Database = require('better-sqlite3')
const path = require('path')
const { createUserDB } = require('../database')

const testDb = new Database(':memory:')
testDb.pragma('journal_mode = WAL')

testDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        room TEXT,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
`)

const UserDB = createUserDB(testDb)

function assert(condition, message = 'Assertion failed') {
    if (!condition) {
        throw new Error(message)
    }
    console.log('Test passed:', message)
}

// TESTS
async function runTests() {
    console.log('--- Tests ---\n')

    // Nettoyer la db avant les tests
    testDb.exec('DELETE FROM users')

    const users = [
        ["Jean", "motdepassejean"],
        ["Pierre", "lecaca_09"],
        ["Elouan", "7mdequeue"],
        ["Leandre", "seulement0.5m"]
    ]

    // On initialise avec des users pour test
    console.log('Test 1: Creating users')
    for (const [username, password] of users) {
        const result = await UserDB.register(username, password)
        assert(result.success === true, `${username}'s profile created`)
    }

    // Pseudo deja existant
    console.log('\nTest 2: Trying to register a dupplication')
    const duplicateResult = await UserDB.register("Jean", "onsaitqueçaexistedeja")
    assert(duplicateResult.success === false, 'Duplication correctly refused')

    // login avec mauvais password
    console.log('\nTest 3: Login with wrong password')
    const wrongPasswordResult = await UserDB.login("Jean", "lacpaslebon")
    assert(wrongPasswordResult.success === false, 'Wrong pass word correctly refused')

    // login correct
    console.log('\nTest 4: Login correct')
    const correctLoginResult = await UserDB.login("Jean", "motdepassejean")
    assert(correctLoginResult.success === true, 'Login successful with correct password')

    // login avec user existe pas
    console.log('\nTest 5: login with unexisting user')
    const noUserResult = await UserDB.login("existepas", "nimportequoi")
    assert(noUserResult.success === false, 'Utilisateur inexistant refusé')

    console.log('\nAll tests passed')
    
    // Fermer la DB
    testDb.close()
}

// Lancer les tests
runTests().catch(error => {
    console.error('Test failed:', error.message)
    testDb.close()
    process.exit(1)
})

