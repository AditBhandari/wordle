const board = document.getElementById("board");
const keyboard = document.getElementById("keyboard");
const toast = document.getElementById("toast");
const gameMessage = document.getElementById("gameMessage");

const ROWS = 6;
const COLS = 5;

// ==========================================
// CHANGE THIS NUMBER ANYTIME
// ==========================================

const GAMES_PER_DAY = 3;

const STORAGE_KEY = "wordle-clone-static-v4";

let allowedWords = new Set();
let answerWords = [];

let answer = "";
let blackLetter = "";

let currentRow = 0;
let currentTile = 0;

let gameOver = false;
let submitting = false;

const keyStates = {};


// ==========================================
// CREATE GAMES
// ==========================================

function createGames() {

    const games = {};

    for (let i = 1; i <= GAMES_PER_DAY; i++) {

        games[i] = {
            guesses: [],
            results: [],
            completed: false
        };

    }

    return games;

}


// ==========================================
// EMPTY STATE
// ==========================================

const emptyState = () => ({

    day: null,

    currentGame: 1,

    games: createGames(),

    played: 0,

    wins: 0,

    streak: 0,

    maxStreak: 0,

    distribution: [
        0,
        0,
        0,
        0,
        0,
        0
    ]

});


let state = loadState();


// ==========================================
// LOAD STATE
// ==========================================

function loadState() {

    try {

        const saved = JSON.parse(
            localStorage.getItem(STORAGE_KEY)
        );

        if (
            saved &&
            saved.games
        ) {

            return saved;

        }

        return emptyState();

    }

    catch {

        return emptyState();

    }

}


// ==========================================
// SAVE STATE
// ==========================================

function saveState() {

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state)
    );

}


// ==========================================
// TODAY'S DATE
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
// GET DAILY WORD INDEX
// ==========================================

async function getDailyIndex(
    day,
    gameNumber
) {

    const seed =
        `${day}-game-${gameNumber}`;

    const bytes =
        new TextEncoder().encode(seed);

    const hash =
        await crypto.subtle.digest(
            "SHA-256",
            bytes
        );

    const view =
        new DataView(hash);

    return (
        view.getUint32(0) %
        answerWords.length
    );

}


// ==========================================
// GET BLACK LETTER
//
// The letter:
// 1. Is NOT in the answer
// 2. Is deterministic
// 3. Is different for different games
// ==========================================

async function getBlackLetter(
    day,
    gameNumber,
    answer
) {

    const alphabet =
        "abcdefghijklmnopqrstuvwxyz";

    const possibleLetters =
        alphabet
            .split("")
            .filter(
                letter =>
                    !answer.includes(letter)
            );

    const seed =
        `${day}-black-${gameNumber}`;

    const bytes =
        new TextEncoder().encode(seed);

    const hash =
        await crypto.subtle.digest(
            "SHA-256",
            bytes
        );

    const view =
        new DataView(hash);

    const index =
        view.getUint32(0) %
        possibleLetters.length;

    return possibleLetters[index];

}


// ==========================================
// INITIALIZE GAME
// ==========================================

async function init() {

    createBoard();

    createKeyboard();

    try {

        const [
            allowedResponse,
            answersResponse
        ] = await Promise.all([

            fetch(
                "allowed.txt",
                {
                    cache: "no-store"
                }
            ),

            fetch(
                "answers.txt",
                {
                    cache: "no-store"
                }
            )

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


        const today =
            todayKey();


        // ==========================================
        // NEW DAY
        // ==========================================

        if (
            state.day !== today
        ) {

            const stats = {

                played:
                    state.played,

                wins:
                    state.wins,

                streak:
                    state.streak,

                maxStreak:
                    state.maxStreak,

                distribution:
                    state.distribution

            };


            state = {

                day: today,

                currentGame: 1,

                games: createGames(),

                ...stats

            };


            saveState();

        }


        // ==========================================
        // IF NUMBER OF GAMES CHANGED
        // ==========================================

        if (
            Object.keys(state.games).length !==
            GAMES_PER_DAY
        ) {

            const oldGames =
                state.games;

            state.games =
                createGames();


            for (
                let i = 1;
                i <= GAMES_PER_DAY;
                i++
            ) {

                if (oldGames[i]) {

                    state.games[i] =
                        oldGames[i];

                }

            }


            if (
                state.currentGame >
                GAMES_PER_DAY
            ) {

                state.currentGame =
                    GAMES_PER_DAY;

            }


            saveState();

        }


        await loadCurrentGame();

        updateStatsModal();

    }

    catch (error) {

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

    submitting = false;


    // ==========================================
    // RESET KEYBOARD STATES
    // ==========================================

    for (
        const key in keyStates
    ) {

        delete keyStates[key];

    }


    document
        .querySelectorAll(".key")
        .forEach(
            key => {

                key.classList.remove(
                    "green",
                    "yellow",
                    "gray",
                    "black"
                );

            }
        );


    // ==========================================
    // CREATE FRESH BOARD
    // ==========================================

    createBoard();


    const day =
        todayKey();

    const gameNumber =
        state.currentGame;


    // ==========================================
    // GET ANSWER
    // ==========================================

    const index =
        await getDailyIndex(
            day,
            gameNumber
        );


    answer =
        answerWords[index];


    // ==========================================
    // GET BLACK LETTER
    // ==========================================

    blackLetter =
        await getBlackLetter(
            day,
            gameNumber,
            answer
        );


    console.log(
        `Puzzle ${gameNumber}:`,
        "Answer:",
        answer,
        "Black letter:",
        blackLetter
    );


    const game =
        state.games[gameNumber];


    // ==========================================
    // RESTORE PREVIOUS GAME
    // ==========================================

    restoreGame(game);


    // ==========================================
    // MESSAGE
    // ==========================================

    if (
        game.completed &&
        gameNumber === GAMES_PER_DAY
    ) {

        gameMessage.textContent =
            `You completed all ${GAMES_PER_DAY} Wordles today!`;

    }

    else if (game.completed) {

        gameMessage.textContent =
            `Puzzle ${gameNumber} completed.`;

    }

    else {

        gameMessage.textContent =
            `Puzzle ${gameNumber} of ${GAMES_PER_DAY}`;

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

        tile.className =
            "tile";

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
        (
            row,
            rowIndex
        ) => {

            const rowDiv =
                document.createElement("div");

            rowDiv.className =
                "keyboard-row";


            if (
                rowIndex === 2
            ) {

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


            if (
                rowIndex === 2
            ) {

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


// ==========================================
// ADD KEY
// ==========================================

function addKey(
    label,
    wide,
    container
) {

    const key =
        document.createElement("button");

    key.className =
        `key${wide ? " wide" : ""}`;

    key.textContent =
        label;

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


    container.appendChild(
        key
    );

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


    if (
        key === "ENTER"
    ) {

        submitGuess();

    }

    else if (
        key === "⌫"
    ) {

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

    if (
        currentTile >= COLS
    ) {

        return;

    }


    const tile =
        board.children[
            currentRow * COLS +
            currentTile
        ];


    tile.textContent =
        letter;


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

    if (
        currentTile <= 0
    ) {

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
                currentRow * COLS +
                i
            ].textContent;

    }

    return guess.toLowerCase();

}


// ==========================================
// CHECK BLACK LETTER
// ==========================================

function containsBlackLetter(guess) {

    return guess.includes(
        blackLetter
    );

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


    // ==========================================
    // DUPLICATE GUESS
    // ==========================================

    if (
        game.guesses.includes(guess)
    ) {

        showToast(
            "You already guessed that"
        );

        return;

    }


    // ==========================================
    // WORD VALIDATION
    // ==========================================

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


    // ==========================================
    // BLACK LETTER
    // ==========================================

    if (
        containsBlackLetter(guess)
    ) {

        game.guesses.push(
            guess
        );

        game.results.push([
            "black",
            "black",
            "black",
            "black",
            "black"
        ]);


        saveState();


        await revealBlackRow();


        showToast(
            `BLACK LETTER: ${blackLetter.toUpperCase()}`
        );


        // ==========================================
        // GUESS IS CONSUMED
        // ==========================================

        if (
            currentRow === ROWS - 1
        ) {

            finishGame(
                false,
                game.guesses.length
            );

        }

        else {

            currentRow++;

            currentTile = 0;

            gameMessage.textContent =
                `Puzzle ${state.currentGame} of ${GAMES_PER_DAY}`;

        }


        submitting = false;

        return;

    }


    // ==========================================
    // NORMAL WORDLE GUESS
    // ==========================================

    const result =
        scoreGuess(
            guess,
            answer
        );


    game.guesses.push(
        guess
    );


    game.results.push(
        result
    );


    saveState();


    await revealRow(
        result
    );


    updateKeyboard(
        result,
        guess
    );


    // ==========================================
    // WIN
    // ==========================================

    if (
        guess === answer
    ) {

        finishGame(
            true,
            game.guesses.length
        );

    }


    // ==========================================
    // LOSS
    // ==========================================

    else if (
        currentRow === ROWS - 1
    ) {

        finishGame(
            false,
            game.guesses.length
        );

    }


    // ==========================================
    // CONTINUE
    // ==========================================

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


    // GREEN FIRST

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


    // YELLOW SECOND

    for (
        let i = 0;
        i < COLS;
        i++
    ) {

        if (
            result[i] === "green"
        ) {

            continue;

        }


        const index =
            remaining.indexOf(
                guess[i]
            );


        if (
            index !== -1
        ) {

            result[i] =
                "yellow";

            remaining[index] =
                null;

        }

    }


    return result;

}


// ==========================================
// REVEAL NORMAL ROW
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


        tile.classList.add(
            "flip"
        );


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
// REVEAL BLACK ROW
// ==========================================

async function revealBlackRow() {

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


        tile.classList.add(
            "flip"
        );


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
            "black"
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
            priority[keyStates[letter]]
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
                    "gray",
                    "black"
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
        (
            guess,
            row
        ) => {

            const result =
                game.results[row];


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
                    result[i]
                );

            }


            // Don't color keyboard
            // black for the special
            // black-letter guess.

            if (
                result[0] !== "black"
            ) {

                updateKeyboard(
                    result,
                    guess
                );

            }

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
            x =>
                x === "green"
        );


    const usedAllRows =
        game.guesses.length >= ROWS;


    if (
        solved ||
        usedAllRows
    ) {

        gameOver = true;


        currentRow =
            Math.min(
                game.guesses.length - 1,
                ROWS - 1
            );


        currentTile =
            COLS;

    }

    else {

        currentRow =
            game.guesses.length;

        currentTile =
            0;

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


    game.completed =
        true;


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


    // ==========================================
    // NEXT PUZZLE
    // ==========================================

    if (
        state.currentGame <
        GAMES_PER_DAY
    ) {

        gameMessage.textContent =
            won

                ? `Puzzle ${state.currentGame} solved! Loading next puzzle...`

                : `The word was ${answer.toUpperCase()}. Loading next puzzle...`;


        setTimeout(
            async () => {

                state.currentGame++;

                saveState();

                await loadCurrentGame();

            },
            1800
        );

    }


    // ==========================================
    // ALL PUZZLES COMPLETE
    // ==========================================

    else {

        gameMessage.textContent =
            `You completed all ${GAMES_PER_DAY} Wordles today!`;

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

    document
        .getElementById("played")
        .textContent =
            state.played;


    document
        .getElementById("winRate")
        .textContent =
            state.played

                ? Math.round(
                    state.wins /
                    state.played *
                    100
                )

                : 0;


    document
        .getElementById("streak")
        .textContent =
            state.streak;


    document
        .getElementById("maxStreak")
        .textContent =
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
        (
            count,
            i
        ) => {

            const row =
                document.createElement(
                    "div"
                );


            row.className =
                "dist-row";


            row.innerHTML = `
                <span>
                    ${i + 1}
                </span>

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
                </div>
            `;


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
        .classList.remove(
            "hidden"
        );

}


function closeModal(id) {

    document
        .getElementById(id)
        .classList.add(
            "hidden"
        );

}


document
    .getElementById("helpBtn")
    .addEventListener(
        "click",
        () =>
            openModal("helpModal")
    );


document
    .getElementById("statsBtn")
    .addEventListener(
        "click",
        () =>
            openModal("statsModal")
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
                event => {

                    if (
                        event.target === modal
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
            event.key === "Backspace"
        ) {

            event.preventDefault();

            handleKey("⌫");

        }

        else if (
            event.key === "Enter"
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
