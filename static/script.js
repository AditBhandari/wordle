const board = document.getElementById("board");
const keyboard = document.getElementById("keyboard");
const toast = document.getElementById("toast");
const gameMessage = document.getElementById("gameMessage");

const ROWS = 6;
const COLS = 5;
const STORAGE_KEY = "wordle-clone-static-v2";

let allowedWords = new Set();
let answerWords = [];
let answer = "";
let currentRow = 0;
let currentTile = 0;
let gameOver = false;
let submitting = false;

const keyStates = {};

const emptyState = () => ({
    day: null,

    // Which puzzle is currently being played
    currentGame: 1,

    // Game 1 and Game 2 progress
    games: {
        1: {
            guesses: [],
            results: [],
            completed: false
        },

        2: {
            guesses: [],
            results: [],
            completed: false
        }
    },

    // Statistics
    played: 0,
    wins: 0,
    streak: 0,
    maxStreak: 0,
    distribution: [0, 0, 0, 0, 0, 0]
});

let state = loadState();


// ==========================================
// LOAD / SAVE
// ==========================================

function loadState() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(STORAGE_KEY)
        );

        if (
            saved &&
            saved.games &&
            saved.games[1] &&
            saved.games[2]
        ) {
            return saved;
        }

        return emptyState();

    } catch {
        return emptyState();
    }
}


function saveState() {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state)
    );
}


// ==========================================
// DATE
// ==========================================

function todayKey() {

    const now = new Date();

    const year = now.getFullYear();

    const month = String(
        now.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        now.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


// ==========================================
// GET DAILY WORD
// ==========================================

async function getDailyIndex(day, gameNumber) {

    // Different seed for Game 1 and Game 2
    const seed = `${day}-game-${gameNumber}`;

    const bytes =
        new TextEncoder().encode(seed);

    const hash =
        await crypto.subtle.digest(
            "SHA-256",
            bytes
        );

    const view = new DataView(hash);

    return (
        view.getUint32(0) %
        answerWords.length
    );
}


// ==========================================
// INITIALIZE
// ==========================================

async function init() {

    createBoard();

    createKeyboard();

    try {

        const [
            allowedResponse,
            answersResponse
        ] = await Promise.all([

            fetch("allowed.txt", {
                cache: "no-store"
            }),

            fetch("answers.txt", {
                cache: "no-store"
            })

        ]);


        if (
            !allowedResponse.ok ||
            !answersResponse.ok
        ) {
            throw new Error(
                "Word lists could not be loaded"
            );
        }


        const [
            allowedText,
            answersText
        ] = await Promise.all([

            allowedResponse.text(),

            answersResponse.text()

        ]);


        allowedWords =
            new Set(
                allowedText
                    .split(/\r?\n/)
                    .map(
                        word =>
                            word
                                .trim()
                                .toLowerCase()
                    )
                    .filter(
                        word =>
                            word.length === 5
                    )
            );


        answerWords =
            answersText
                .split(/\r?\n/)
                .map(
                    word =>
                        word
                            .trim()
                            .toLowerCase()
                )
                .filter(
                    word =>
                        word.length === 5
                );


        const today = todayKey();


        // New day = reset the two games
        if (state.day !== today) {

            const stats = {

                played: state.played,

                wins: state.wins,

                streak: state.streak,

                maxStreak: state.maxStreak,

                distribution:
                    state.distribution
            };


            state = {
                day: today,

                currentGame: 1,

                games: {

                    1: {
                        guesses: [],
                        results: [],
                        completed: false
                    },

                    2: {
                        guesses: [],
                        results: [],
                        completed: false
                    }

                },

                ...stats
            };


            saveState();
        }


        await loadCurrentGame();

        updateStatsModal();

    } catch (error) {

        console.error(error);

        showToast(
            "Could not load the word list"
        );

    }
}


// ==========================================
// LOAD CURRENT GAME
// ==========================================

async function loadCurrentGame() {

    currentRow = 0;

    currentTile = 0;

    gameOver = false;


    // Reset keyboard states
    for (const key in keyStates) {
        delete keyStates[key];
    }


    // Clear keyboard colors
    document
        .querySelectorAll(".key")
        .forEach(key => {

            key.classList.remove(
                "green",
                "yellow",
                "gray"
            );

        });


    createBoard();


    const day = todayKey();

    const gameNumber =
        state.currentGame;


    const index =
        await getDailyIndex(
            day,
            gameNumber
        );


    answer =
        answerWords[index];


    const game =
        state.games[gameNumber];


    // Restore previous guesses
    restoreGame(game);


    // Update message
    if (
        game.completed &&
        gameNumber === 2
    ) {

        gameMessage.textContent =
            "You completed both Wordles today!";

    }

    else if (
        game.completed &&
        gameNumber === 1
    ) {

        gameMessage.textContent =
            "Puzzle 1 complete! Starting Puzzle 2...";

    }

    else {

        gameMessage.textContent =
            `Puzzle ${gameNumber} of 2`;

    }

}


// ==========================================
// CREATE BOARD
// ==========================================

function createBoard() {

    board.innerHTML = "";

    for (
        let i = 0;
        i < ROWS * COLS;
        i++
    ) {

        const tile =
            document.createElement("div");

        tile.className = "tile";

        board.appendChild(tile);

    }

}


// ==========================================
// CREATE KEYBOARD
// ==========================================

function createKeyboard() {

    keyboard.innerHTML = "";

    const rows = [

        "QWERTYUIOP",

        "ASDFGHJKL",

        "ZXCVBNM"

    ];


    rows.forEach(
        (row, rowIndex) => {

            const rowDiv =
                document.createElement("div");

            rowDiv.className =
                "keyboard-row";


            if (rowIndex === 2) {

                addKey(
                    "ENTER",
                    true,
                    rowDiv
                );

            }


            for (
                const letter of row
            ) {

                addKey(
                    letter,
                    false,
                    rowDiv
                );

            }


            if (rowIndex === 2) {

                addKey(
                    "⌫",
                    true,
                    rowDiv
                );

            }


            keyboard.appendChild(
                rowDiv
            );

        }
    );

}


function addKey(
    label,
    wide,
    container
) {

    const key =
        document.createElement("button");


    key.className =
        `key${wide ? " wide" : ""}`;


    key.textContent = label;


    key.dataset.key =
        label;


    key.setAttribute(
        "aria-label",

        label === "⌫"
            ? "Backspace"
            : label
    );


    key.addEventListener(
        "click",

        () =>
            handleKey(label)
    );


    container.appendChild(key);

}


// ==========================================
// HANDLE KEY
// ==========================================

function handleKey(key) {

    if (
        gameOver ||
        submitting ||
        !answer
    ) {
        return;
    }


    if (key === "ENTER") {

        submitGuess();

    }

    else if (key === "⌫") {

        removeLetter();

    }

    else {

        addLetter(key);

    }

}


// ==========================================
// ADD LETTER
// ==========================================

function addLetter(letter) {

    if (currentTile >= COLS) {
        return;
    }


    const tile =
        board.children[
            currentRow * COLS +
            currentTile
        ];


    tile.textContent = letter;


    tile.classList.add(
        "filled",
        "pop"
    );


    setTimeout(
        () =>
            tile.classList.remove("pop"),

        120
    );


    currentTile++;

}


// ==========================================
// REMOVE LETTER
// ==========================================

function removeLetter() {

    if (currentTile <= 0) {
        return;
    }


    currentTile--;


    const tile =
        board.children[
            currentRow * COLS +
            currentTile
        ];


    tile.textContent = "";


    tile.classList.remove(
        "filled"
    );

}


// ==========================================
// GET CURRENT GUESS
// ==========================================

function currentGuess() {

    let guess = "";


    for (
        let i = 0;
        i < COLS;
        i++
    ) {

        guess +=
            board.children[
                currentRow * COLS + i
            ]
                .textContent;

    }


    return guess.toLowerCase();

}


// ==========================================
// SUBMIT GUESS
// ==========================================

async function submitGuess() {

    if (
        currentTile !== COLS ||
        gameOver ||
        submitting ||
        !answer
    ) {

        if (
            currentTile !== COLS &&
            !gameOver
        ) {

            showToast(
                "Not enough letters"
            );

        }

        return;

    }


    const guess =
        currentGuess();


    const game =
        state.games[
            state.currentGame
        ];


    if (
        game.guesses.includes(guess)
    ) {

        showToast(
            "You already guessed that"
        );

        return;

    }


    if (
        !allowedWords.has(guess) &&
        !answerWords.includes(guess)
    ) {

        showToast(
            "Not in word list"
        );

        return;

    }


    submitting = true;


    const result =
        scoreGuess(
            guess,
            answer
        );


    game.guesses.push(guess);

    game.results.push(result);


    saveState();


    await revealRow(result);


    updateKeyboard(
        result,
        guess
    );


    // WIN
    if (guess === answer) {

        finishGame(
            true,
            game.guesses.length
        );

    }


    // LOSS
    else if (
        currentRow === ROWS - 1
    ) {

        finishGame(
            false,
            game.guesses.length
        );

    }


    // CONTINUE
    else {

        currentRow++;

        currentTile = 0;

    }


    submitting = false;

}


// ==========================================
// SCORE GUESS
// ==========================================

function scoreGuess(
    guess,
    target
) {

    const result = [
        "gray",
        "gray",
        "gray",
        "gray",
        "gray"
    ];


    const remaining =
        target.split("");


    // Greens first
    for (
        let i = 0;
        i < COLS;
        i++
    ) {

        if (
            guess[i] ===
            target[i]
        ) {

            result[i] =
                "green";

            remaining[i] =
                null;

        }

    }


    // Then yellows
    for (
        let i = 0;
        i < COLS;
        i++
    ) {

        if (
            result[i] ===
            "green"
        ) {
            continue;
        }


        const index =
            remaining.indexOf(
                guess[i]
            );


        if (index !== -1) {

            result[i] =
                "yellow";

            remaining[index] =
                null;

        }

    }


    return result;

}


// ==========================================
// REVEAL ROW
// ==========================================

async function revealRow(result) {

    const start =
        currentRow * COLS;


    for (
        let i = 0;
        i < COLS;
        i++
    ) {

        const tile =
            board.children[
                start + i
            ];


        tile.classList.add("flip");


        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    110
                )
        );


        tile.classList.remove(
            "filled"
        );


        tile.classList.add(
            result[i]
        );


        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    60
                )
        );

    }

}


// ==========================================
// UPDATE KEYBOARD
// ==========================================

function updateKeyboard(
    result,
    guess
) {

    const priority = {

        gray: 1,

        yellow: 2,

        green: 3

    };


    for (
        let i = 0;
        i < guess.length;
        i++
    ) {

        const letter =
            guess[i].toUpperCase();


        const next =
            result[i];


        if (
            !keyStates[letter] ||
            priority[next] >
            priority[
                keyStates[letter]
            ]
        ) {

            keyStates[letter] =
                next;


            const key =
                keyboard.querySelector(
                    `[data-key="${letter}"]`
                );


            if (key) {

                key.classList.remove(
                    "green",
                    "yellow",
                    "gray"
                );


                key.classList.add(
                    next
                );

            }

        }

    }

}


// ==========================================
// RESTORE GAME
// ==========================================

function restoreGame(game) {

    game.guesses.forEach(
        (guess, row) => {

            for (
                let i = 0;
                i < COLS;
                i++
            ) {

                const tile =
                    board.children[
                        row * COLS + i
                    ];


                tile.textContent =
                    guess[i].toUpperCase();


                tile.classList.add(
                    "filled",
                    game.results[row][i]
                );

            }


            updateKeyboard(
                game.results[row],
                guess
            );

        }
    );


    if (
        !game.results.length
    ) {
        return;
    }


    const lastResult =
        game.results[
            game.results.length - 1
        ];


    const solved =
        lastResult.every(
            x => x === "green"
        );


    if (
        solved ||
        game.guesses.length >= ROWS
    ) {

        gameOver = true;


        currentRow =
            Math.min(
                game.guesses.length - 1,
                ROWS - 1
            );


        currentTile = COLS;

    }

    else {

        currentRow =
            game.guesses.length;


        currentTile = 0;

    }

}


// ==========================================
// FINISH GAME
// ==========================================

function finishGame(
    won,
    attempts
) {

    gameOver = true;


    const game =
        state.games[
            state.currentGame
        ];


    game.completed = true;


    state.played++;


    if (won) {

        state.wins++;

        state.streak++;

        state.maxStreak =
            Math.max(
                state.maxStreak,
                state.streak
            );


        state.distribution[
            attempts - 1
        ]++;


        showToast(
            "Great job!"
        );

    }

    else {

        state.streak = 0;


        showToast(
            answer.toUpperCase()
        );

    }


    saveState();

    updateStatsModal();


    // Move automatically to Puzzle 2
    if (
        state.currentGame === 1
    ) {

        gameMessage.textContent =
            won
                ? "Puzzle 1 solved! Loading Puzzle 2..."
                : `The word was ${answer.toUpperCase()}. Loading Puzzle 2...`;


        setTimeout(
            async () => {

                state.currentGame = 2;

                saveState();

                await loadCurrentGame();

            },

            1800
        );

    }


    // Both games completed
    else {

        gameMessage.textContent =
            "You completed both Wordles today!";

    }

}


// ==========================================
// TOAST
// ==========================================

function showToast(message) {

    toast.textContent =
        message;


    toast.classList.add(
        "show"
    );


    clearTimeout(
        showToast.timer
    );


    showToast.timer =
        setTimeout(
            () =>
                toast.classList.remove(
                    "show"
                ),

            1600
        );

}


// ==========================================
// STATISTICS
// ==========================================

function updateStatsModal() {

    document.getElementById(
        "played"
    ).textContent =
        state.played;


    document.getElementById(
        "winRate"
    ).textContent =
        state.played
            ? Math.round(
                state.wins /
                state.played *
                100
            )
            : 0;


    document.getElementById(
        "streak"
    ).textContent =
        state.streak;


    document.getElementById(
        "maxStreak"
    ).textContent =
        state.maxStreak;


    const distribution =
        document.getElementById(
            "distribution"
        );


    distribution.innerHTML =
        "";


    const max =
        Math.max(
            1,
            ...state.distribution
        );


    state.distribution.forEach(
        (count, i) => {

            const row =
                document.createElement(
                    "div"
                );


            row.className =
                "dist-row";


            row.innerHTML =
                `<span>${i + 1}</span>
                <div
                    class="dist-bar"
                    style="
                        width:
                        ${Math.max(
                            8,
                            count / max * 100
                        )}%
                    "
                >
                    ${count}
                </div>`;


            distribution.appendChild(
                row
            );

        }
    );

}


// ==========================================
// MODALS
// ==========================================

function openModal(id) {

    document
        .getElementById(id)
        .classList.remove("hidden");

}


function closeModal(id) {

    document
        .getElementById(id)
        .classList.add("hidden");

}


document
    .getElementById("helpBtn")
    .addEventListener(
        "click",
        () => openModal("helpModal")
    );


document
    .getElementById("statsBtn")
    .addEventListener(
        "click",
        () => openModal("statsModal")
    );


document
    .querySelectorAll("[data-close]")
    .forEach(
        btn =>
            btn.addEventListener(
                "click",
                () =>
                    closeModal(
                        btn.dataset.close
                    )
            )
    );


document
    .querySelectorAll(".modal")
    .forEach(
        modal =>
            modal.addEventListener(
                "click",
                e => {

                    if (
                        e.target === modal
                    ) {

                        modal.classList.add(
                            "hidden"
                        );

                    }

                }
            )
    );


// ==========================================
// PHYSICAL KEYBOARD
// ==========================================

document.addEventListener(
    "keydown",

    event => {

        if (
            event.ctrlKey ||
            event.metaKey ||
            event.altKey
        ) {
            return;
        }


        const key =
            event.key.toUpperCase();


        if (
            event.key ===
            "Backspace"
        ) {

            event.preventDefault();

            handleKey("⌫");

        }

        else if (
            event.key ===
            "Enter"
        ) {

            event.preventDefault();

            handleKey("ENTER");

        }

        else if (
            /^[A-Z]$/.test(key)
        ) {

            handleKey(key);

        }

    }
);


// ==========================================
// START
// ==========================================

init();
