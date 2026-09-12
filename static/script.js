const board = document.getElementById("board");
const keyboard = document.getElementById("keyboard");
const toast = document.getElementById("toast");
const gameMessage = document.getElementById("gameMessage");

const ROWS = 6;
const COLS = 5;

const GAMES_PER_DAY = 3;

const STORAGE_KEY = "wordle-no-mercy-v5";

// Game 1 timer
const TIME_LIMIT = 60;

let allowedWords = new Set();
let answerWords = [];

let answer = "";
let currentRow = 0;
let currentTile = 0;

let gameOver = false;
let submitting = false;

let timerInterval = null;
let timeLeft = TIME_LIMIT;

const keyStates = {};


// ======================================================
// GAME MODES
// ======================================================

const GAME_MODES = {
    1: "time",
    2: "colourblind",
    3: "black"
};


// ======================================================
// CREATE DAILY GAMES
// ======================================================

function createGames() {

    const games = {};

    for (let i = 1; i <= GAMES_PER_DAY; i++) {

        games[i] = {
            guesses: [],
            results: [],
            completed: false,

            // Number of rows still available.
            // This matters for the black-letter game.
            rowsAvailable: ROWS,

            // Timer state for Game 1
            timeLeft: TIME_LIMIT
        };

    }

    return games;
}


// ======================================================
// EMPTY STATE
// ======================================================

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


// ======================================================
// LOAD STATE
// ======================================================

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


// ======================================================
// SAVE STATE
// ======================================================

function saveState() {

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state)
    );

}


// ======================================================
// TODAY'S DATE
// ======================================================

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


// ======================================================
// GET DAILY WORD
// ======================================================

async function getDailyIndex(day, gameNumber) {

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


// ======================================================
// INITIALIZE
// ======================================================

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


        // ==================================================
        // NEW DAY
        // ==================================================

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

                games: createGames(),

                ...stats

            };


            saveState();

        }


        // ==================================================
        // HANDLE GAME COUNT CHANGES
        // ==================================================

        if (
            Object.keys(state.games).length !==
            GAMES_PER_DAY
        ) {

            const oldGames =
                state.games;

            const newGames =
                createGames();


            for (
                let i = 1;
                i <= GAMES_PER_DAY;
                i++
            ) {

                if (oldGames[i]) {

                    newGames[i] = {
                        ...newGames[i],
                        ...oldGames[i]
                    };

                }

            }


            state.games = newGames;


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


// ======================================================
// GET CURRENT MODE
// ======================================================

function getCurrentMode() {

    return GAME_MODES[
        state.currentGame
    ];

}


// ======================================================
// LOAD CURRENT GAME
// ======================================================

async function loadCurrentGame() {

    stopTimer();

    currentRow = 0;

    currentTile = 0;

    gameOver = false;

    submitting = false;


    // Clear keyboard states

    for (const key in keyStates) {

        delete keyStates[key];

    }


    // Reset keyboard colours

    document
        .querySelectorAll(".key")
        .forEach(key => {

            key.classList.remove(
                "green",
                "yellow",
                "gray",
                "black"
            );

        });


    createBoard();


    const gameNumber =
        state.currentGame;


    const index =
        await getDailyIndex(
            todayKey(),
            gameNumber
        );


    answer =
        answerWords[index];


    const game =
        state.games[gameNumber];


    // Make sure older saved games have this
    // property.

    if (
        typeof game.rowsAvailable !==
        "number"
    ) {

        game.rowsAvailable = ROWS;

    }


    if (
        typeof game.timeLeft !==
        "number"
    ) {

        game.timeLeft = TIME_LIMIT;

    }


    restoreGame(game);


    updateGameMessage();


    // ==================================================
    // GAME 1 TIMER
    // ==================================================

    if (
        getCurrentMode() === "time" &&
        !game.completed
    ) {

        timeLeft =
            game.timeLeft;

        startTimer();

    }

}


// ======================================================
// GAME MESSAGE
// ======================================================

function updateGameMessage() {

    const game =
        state.games[
            state.currentGame
        ];


    if (game.completed) {

        if (
            state.currentGame ===
            GAMES_PER_DAY
        ) {

            gameMessage.textContent =
                `You completed all ${GAMES_PER_DAY} Wordles today!`;

        }

        else {

            gameMessage.textContent =
                `Puzzle ${state.currentGame} complete.`;

        }

        return;

    }


    const mode =
        getCurrentMode();


    if (mode === "time") {

        gameMessage.textContent =
            `Time Challenge — ${formatTime(timeLeft)}`;

    }

    else if (mode === "colourblind") {

        gameMessage.textContent =
            `Colourblind — Puzzle ${state.currentGame} of ${GAMES_PER_DAY}`;

    }

    else if (mode === "black") {

        gameMessage.textContent =
            `Black Letter — Puzzle ${state.currentGame} of ${GAMES_PER_DAY}`;

    }

}


// ======================================================
// TIMER
// ======================================================

function startTimer() {

    stopTimer();

    updateTimerDisplay();


    timerInterval =
        setInterval(() => {

            if (gameOver) {

                stopTimer();

                return;

            }


            timeLeft--;

            const game =
                state.games[
                    state.currentGame
                ];

            game.timeLeft =
                timeLeft;

            saveState();

            updateTimerDisplay();


            if (timeLeft <= 0) {

                stopTimer();

                timeExpired();

            }

        }, 1000);

}


function stopTimer() {

    if (timerInterval) {

        clearInterval(timerInterval);

        timerInterval = null;

    }

}


function updateTimerDisplay() {

    if (
        getCurrentMode() !== "time"
    ) {

        return;

    }


    gameMessage.textContent =
        `Time Challenge — ${formatTime(timeLeft)}`;

}


function formatTime(seconds) {

    const mins =
        Math.floor(seconds / 60);

    const secs =
        seconds % 60;

    return (
        `${mins}:${String(secs).padStart(2, "0")}`
    );

}


// ======================================================
// TIME EXPIRED
// ======================================================

function timeExpired() {

    if (gameOver) {

        return;

    }


    gameOver = true;


    const game =
        state.games[
            state.currentGame
        ];


    game.completed = true;

    game.timeLeft = 0;


    state.played++;

    state.streak = 0;


    saveState();

    updateStatsModal();


    gameMessage.textContent =
        `Time's up! The word was ${answer.toUpperCase()}`;

    showToast("Time's up!");


    moveToNextGame();

}


// ======================================================
// CREATE BOARD
// ======================================================

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


// ======================================================
// CREATE KEYBOARD
// ======================================================

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


            for (const letter of row) {

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


// ======================================================
// ADD KEY
// ======================================================

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
        () => handleKey(label)
    );


    container.appendChild(key);

}


// ======================================================
// HANDLE KEY
// ======================================================

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


// ======================================================
// ADD LETTER
// ======================================================

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


// ======================================================
// REMOVE LETTER
// ======================================================

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


// ======================================================
// CURRENT GUESS
// ======================================================

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


// ======================================================
// SUBMIT GUESS
// ======================================================

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


    // ==================================================
    // BLACK LETTER CHECK
    // ==================================================

    let blackLetterUsed = false;


    if (
        getCurrentMode() === "black"
    ) {

        blackLetterUsed =
            checkBlackLetter(guess);

    }


    // ==================================================
    // SCORE GUESS
    // ==================================================

    const actualResult =
        scoreGuess(
            guess,
            answer
        );


    // ==================================================
    // COLOURBLIND MODE
    //
    // Yellow becomes grey.
    // ==================================================

    let displayedResult =
        [...actualResult];


    if (
        getCurrentMode() === "colourblind"
    ) {

        displayedResult =
            actualResult.map(
                result =>
                    result === "green"
                        ? "green"
                        : "gray"
            );

    }


    game.guesses.push(guess);

    game.results.push(
        displayedResult
    );


    saveState();


    // Reveal using displayed result.

    await revealRow(
        displayedResult,
        blackLetterUsed,
        guess
    );


    // ==================================================
    // UPDATE KEYBOARD
    // ==================================================

    updateKeyboard(
        displayedResult,
        guess
    );


    // ==================================================
    // BLACK LETTER PENALTY
    // ==================================================

    if (blackLetterUsed) {

        game.rowsAvailable--;

        saveState();


        // Remove the LAST AVAILABLE row.

        removeLastAvailableRow();


        showToast(
            "Black letter! One guess lost."
        );


        // If there are no guesses left,
        // the game ends.

        if (
            game.rowsAvailable <= 0
        ) {

            finishGame(
                false,
                game.guesses.length
            );

            submitting = false;

            return;

        }

    }


    // ==================================================
    // WIN
    // ==================================================

    if (guess === answer) {

        finishGame(
            true,
            game.guesses.length
        );

    }


    // ==================================================
    // NORMAL LOSS
    // ==================================================

    else if (
        game.guesses.length >=
        game.rowsAvailable
    ) {

        finishGame(
            false,
            game.guesses.length
        );

    }


    // ==================================================
    // CONTINUE
    // ==================================================

    else {

        currentRow++;

        currentTile = 0;

    }


    submitting = false;

}


// ======================================================
// BLACK LETTER
// ======================================================
//
// IMPORTANT:
//
// The black letter is NEVER displayed.
// It is generated secretly from the alphabet,
// excluding every letter in the answer.
//
// ======================================================

function getBlackLetter() {

    const answerLetters =
        new Set(answer.toUpperCase().split(""));

    const alphabet =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    const possibleLetters =
        alphabet
            .split("")
            .filter(
                letter =>
                    !answerLetters.has(letter)
            );


    if (!possibleLetters.length) {

        return null;

    }


    // Deterministic daily secret.
    //
    // This means refreshing the page does NOT
    // change the black letter.

    let hash = 0;

    const seed =
        `${todayKey()}-black-letter-${state.currentGame}`;

    for (
        let i = 0;
        i < seed.length;
        i++
    ) {

        hash =
            (
                hash * 31 +
                seed.charCodeAt(i)
            ) >>> 0;

    }


    return possibleLetters[
        hash % possibleLetters.length
    ];

}


// ======================================================
// CHECK BLACK LETTER
// ======================================================

function checkBlackLetter(guess) {

    const blackLetter =
        getBlackLetter();


    if (!blackLetter) {

        return false;

    }


    return guess
        .toUpperCase()
        .includes(blackLetter);

}


// ======================================================
// SCORE GUESS
// ======================================================

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
            guess[i] === target[i]
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


        if (index !== -1) {

            result[i] =
                "yellow";

            remaining[index] =
                null;

        }

    }


    return result;

}


// ======================================================
// REVEAL ROW
// ======================================================

async function revealRow(
    result,
    blackLetterUsed,
    guess
) {

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


        // ==================================================
        // BLACK LETTER
        //
        // ONLY the actual black letter becomes black.
        //
        // Nothing else gets black.
        // ==================================================

        if (
            blackLetterUsed &&
            guess[i].toUpperCase() ===
            getBlackLetter()
        ) {

            tile.classList.remove(
                "gray",
                "yellow",
                "green"
            );

            tile.classList.add(
                "black"
            );

        }


        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    60
                )
        );

    }

}


// ======================================================
// REMOVE LAST AVAILABLE ROW
// ======================================================

function removeLastAvailableRow() {

    // Find the last row that is still on screen.

    let lastRow =
        -1;


    for (
        let row = ROWS - 1;
        row >= 0;
        row--
    ) {

        const start =
            row * COLS;


        const rowHasTiles =
            Array.from(
                board.children
            )
            .slice(
                start,
                start + COLS
            )
            .some(
                tile =>
                    tile.textContent !== ""
            );


        if (!rowHasTiles) {

            lastRow = row;

            break;

        }

    }


    // If all empty rows have been used,
    // remove the bottom-most row.

    if (lastRow === -1) {

        lastRow = ROWS - 1;

    }


    for (
        let i = 0;
        i < COLS;
        i++
    ) {

        const tile =
            board.children[
                lastRow * COLS + i
            ];


        if (tile) {

            tile.classList.add(
                "removed-row"
            );

        }

    }


    // The important part:
    //
    // Reduce the number of actual guesses available.

    currentRow =
        Math.min(
            currentRow,
            state.games[
                state.currentGame
            ].rowsAvailable - 1
        );

}


// ======================================================
// UPDATE KEYBOARD
// ======================================================

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


        // Colourblind mode never gives yellow.

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


// ======================================================
// RESTORE GAME
// ======================================================

function restoreGame(game) {

    game.guesses.forEach(
        (guess, row) => {

            if (row >= ROWS) {

                return;

            }


            for (
                let i = 0;
                i < COLS;
                i++
            ) {

                const tile =
                    board.children[
                        row * COLS + i
                    ];


                if (!tile) {

                    continue;

                }


                tile.textContent =
                    guess[i].toUpperCase();


                tile.classList.add(
                    "filled",
                    game.results[row][i]
                );


                // Restore black letter visually.

                if (
                    getCurrentMode() === "black" &&
                    guess[i].toUpperCase() ===
                    getBlackLetter()
                ) {

                    tile.classList.remove(
                        "gray",
                        "yellow",
                        "green"
                    );

                    tile.classList.add(
                        "black"
                    );

                }

            }


            updateKeyboard(
                game.results[row],
                guess
            );

        }
    );


    // Mark removed rows in black-letter mode.

    if (
        getCurrentMode() === "black" &&
        game.rowsAvailable < ROWS
    ) {

        const removed =
            ROWS - game.rowsAvailable;


        for (
            let row = ROWS - removed;
            row < ROWS;
            row++
        ) {

            for (
                let i = 0;
                i < COLS;
                i++
            ) {

                const tile =
                    board.children[
                        row * COLS + i
                    ];


                if (
                    tile &&
                    !tile.textContent
                ) {

                    tile.classList.add(
                        "removed-row"
                    );

                }

            }

        }

    }


    if (!game.results.length) {

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


    if (
        solved ||
        game.completed ||
        game.guesses.length >=
        game.rowsAvailable
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

        currentTile = 0;

    }

}


// ======================================================
// FINISH GAME
// ======================================================

function finishGame(
    won,
    attempts
) {

    stopTimer();

    gameOver = true;


    const game =
        state.games[
            state.currentGame
        ];


    if (game.completed) {

        return;

    }


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


        if (
            attempts >= 1 &&
            attempts <= 6
        ) {

            state.distribution[
                attempts - 1
            ]++;

        }


        gameMessage.textContent =
            `Solved in ${attempts}/6`;

        showToast(
            "Great job!"
        );

    }

    else {

        state.streak = 0;

        gameMessage.textContent =
            `The word was ${answer.toUpperCase()}`;

        showToast(
            answer.toUpperCase()
        );

    }


    saveState();

    updateStatsModal();


    moveToNextGame();

}


// ======================================================
// MOVE TO NEXT GAME
// ======================================================

function moveToNextGame() {

    if (
        state.currentGame <
        GAMES_PER_DAY
    ) {

        const completedGame =
            state.currentGame;


        setTimeout(
            async () => {

                state.currentGame =
                    completedGame + 1;

                saveState();

                await loadCurrentGame();

            },
            1800
        );

    }

    else {

        gameMessage.textContent =
            `You completed all ${GAMES_PER_DAY} Wordles today!`;

    }

}


// ======================================================
// TOAST
// ======================================================

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


// ======================================================
// STATISTICS
// ======================================================

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


    distribution.innerHTML = "";


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


            row.innerHTML = `
                <span>${i + 1}</span>
                <div
                    class="dist-bar"
                    style="width:${Math.max(
                        8,
                        count / max * 100
                    )}%"
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


// ======================================================
// MODALS
// ======================================================

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


// ======================================================
// PHYSICAL KEYBOARD
// ======================================================

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


// ======================================================
// START
// ======================================================

init();
