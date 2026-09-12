const board = document.getElementById("board");
const keyboard = document.getElementById("keyboard");
const toast = document.getElementById("toast");
const gameMessage = document.getElementById("gameMessage");

const gameMode = document.getElementById("gameMode");
const gameDescription = document.getElementById("gameDescription");
const timerElement = document.getElementById("timer");

const ROWS = 6;
const COLS = 5;


// ==========================================
// SETTINGS
// ==========================================

const GAMES_PER_DAY = 3;

const STORAGE_KEY =
    "wordle-clone-static-v4";


// Game 2 timer
// Change this number to change the time.

const TIME_LIMIT = 120;


// ==========================================
// GAME STATE
// ==========================================

let allowedWords = new Set();

let answerWords = [];

let answer = "";

let currentRow = 0;

let currentTile = 0;

let gameOver = false;

let submitting = false;


// Secret black letter.
// ONLY used in Game 1.

let blackLetter = "";


// Timer variables.
// ONLY used in Game 2.

let timeRemaining = TIME_LIMIT;

let timerInterval = null;


// Keyboard state.

const keyStates = {};


// ==========================================
// CREATE DAILY GAMES
// ==========================================

function createGames() {

    const games = {};

    for (
        let i = 1;
        i <= GAMES_PER_DAY;
        i++
    ) {

        games[i] = {

            guesses: [],

            results: [],

            completed: false,

            // Used by black-letter game
            blackLetter: "",

            // Used by timer game
            timeRemaining: TIME_LIMIT

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

        const saved =
            JSON.parse(
                localStorage.getItem(
                    STORAGE_KEY
                )
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
// TODAY
// ==========================================

function todayKey() {

    const now = new Date();

    const year =
        now.getFullYear();

    const month =
        String(
            now.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            now.getDate()
        ).padStart(2, "0");


    return `${year}-${month}-${day}`;

}


// ==========================================
// GET DAILY WORD
// ==========================================

async function getDailyIndex(
    day,
    gameNumber
) {

    const seed =
        `${day}-game-${gameNumber}`;


    const bytes =
        new TextEncoder()
            .encode(seed);


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

                games:
                    createGames(),

                ...stats

            };


            saveState();

        }


        // ==========================================
        // HANDLE CHANGED NUMBER OF GAMES
        // ==========================================

        if (
            Object.keys(
                state.games
            ).length !==
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

                if (
                    oldGames[i]
                ) {

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

    stopTimer();


    currentRow = 0;

    currentTile = 0;

    gameOver = false;

    submitting = false;


    // Clear keyboard states

    for (
        const key in keyStates
    ) {

        delete keyStates[key];

    }


    // Clear keyboard colors

    document
        .querySelectorAll(".key")
        .forEach(
            key => {

                key.classList.remove(
                    "green",
                    "yellow",
                    "gray"
                );

            }
        );


    // Fresh board

    createBoard();


    const day =
        todayKey();


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
        state.games[
            gameNumber
        ];


    // ==========================================
    // GAME 1 — BLACK LETTER
    // ==========================================

    if (
        gameNumber === 1
    ) {

        gameMode.textContent =
            "BLACK LETTER";

        gameDescription.textContent =
            "A secret letter costs you a guess if you use it.";

        timerElement.textContent = "";


        // Generate secret letter only once.

        if (
            !game.blackLetter
        ) {

            game.blackLetter =
                generateBlackLetter(
                    answer
                );

            saveState();

        }


        blackLetter =
            game.blackLetter;

    }


    // ==========================================
    // GAME 2 — TIME CHALLENGE
    // ==========================================

    else if (
        gameNumber === 2
    ) {

        gameMode.textContent =
            "TIME CHALLENGE";

        gameDescription.textContent =
            "Solve the word before the timer runs out.";


        blackLetter = "";


        timeRemaining =
            game.timeRemaining ??
            TIME_LIMIT;


        if (
            !game.completed
        ) {

            startTimer();

        }

    }


    // ==========================================
    // GAME 3 — COLOURBLIND
    // ==========================================

    else if (
        gameNumber === 3
    ) {

        gameMode.textContent =
            "COLOURBLIND";

        gameDescription.textContent =
            "Yellow letters are hidden, green and gray work normally.";

        timerElement.textContent = "";


        blackLetter = "";

    }


    // Restore previous guesses.

    restoreGame(game);


    // ==========================================
    // MESSAGE
    // ==========================================

    if (
        game.completed &&
        gameNumber ===
        GAMES_PER_DAY
    ) {

        gameMessage.textContent =
            `You completed all ${GAMES_PER_DAY} Wordles today!`;

    }

    else if (
        game.completed
    ) {

        gameMessage.textContent =
            `Puzzle ${gameNumber} complete.`;

    }

    else {

        gameMessage.textContent =
            `Puzzle ${gameNumber} of ${GAMES_PER_DAY}`;

    }

}


// ==========================================
// GENERATE SECRET BLACK LETTER
// ==========================================

function generateBlackLetter(
    target
) {

    const alphabet =
        "abcdefghijklmnopqrstuvwxyz";


    // Black letter must NOT appear
    // anywhere in the answer.

    const candidates =
        alphabet
            .split("")
            .filter(
                letter =>
                    !target.includes(letter)
            );


    if (
        candidates.length === 0
    ) {

        return "";

    }


    const randomIndex =
        Math.floor(
            Math.random() *
            candidates.length
        );


    return candidates[
        randomIndex
    ];

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
            document.createElement(
                "div"
            );


        tile.className =
            "tile";


        board.appendChild(
            tile
        );

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
                document.createElement(
                    "div"
                );


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
        document.createElement(
            "button"
        );


    key.className =
        `key${
            wide
                ? " wide"
                : ""
        }`;


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
        currentTile >=
        COLS
    ) {

        return;

    }


    const tile =
        board.children[
            currentRow *
            COLS +
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
            tile.classList.remove(
                "pop"
            ),

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
            currentRow *
            COLS +
            currentTile
        ];


    tile.textContent =
        "";


    tile.classList.remove(
        "filled"
    );

}


// ==========================================
// CURRENT GUESS
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
                currentRow *
                COLS +
                i
            ].textContent;

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
        game.guesses.includes(
            guess
        )
    ) {

        showToast(
            "You already guessed that"
        );

        return;

    }


    // ==========================================
    // VALID WORD
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


    // ==========================================
    // BLACK LETTER CHECK
    // ==========================================

    if (
        state.currentGame === 1 &&
        blackLetter &&
        guess.includes(blackLetter)
    ) {

        await handleBlackLetter(
            guess,
            game
        );

        return;

    }


    submitting = true;


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
// HANDLE BLACK LETTER
// ==========================================

async function handleBlackLetter(
    guess,
    game
) {

    submitting = true;


    showToast(
        "Black letter! You lose a guess."
    );


    // Reveal the guess normally,
    // but show ONLY the black letter
    // as black.

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


    await revealBlackLetterRow(
        result,
        guess
    );


    updateKeyboard(
        result,
        guess
    );


    // ==========================================
    // REMOVE THE LAST AVAILABLE ROW
    // ==========================================

    const rowsLeft =
        ROWS -
        game.guesses.length;


    // If the player has reached the final
    // available row, they lose.

    if (
        rowsLeft <= 0
    ) {

        finishGame(
            false,
            game.guesses.length
        );

        submitting = false;

        return;

    }


    // Move to the next row.

    currentRow++;

    currentTile = 0;


    // Remove the final physical row
    // from the board.

    removeLastBoardRow();


    submitting = false;

}


// ==========================================
// REVEAL BLACK LETTER ROW
// ==========================================

async function revealBlackLetterRow(
    result,
    guess
) {

    const start =
        currentRow *
        COLS;


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


        // Black letter gets black tile.

        if (
            guess[i] ===
            blackLetter
        ) {

            tile.classList.add(
                "black"
            );

        }

        else {

            tile.classList.add(
                result[i]
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


// ==========================================
// REMOVE LAST BOARD ROW
// ==========================================

function removeLastBoardRow() {

    const tiles =
        board.children;


    // Remove exactly 5 tiles.

    for (
        let i = 0;
        i < COLS;
        i++
    ) {

        if (
            board.lastElementChild
        ) {

            board.removeChild(
                board.lastElementChild
            );

        }

    }

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
            result[i] ===
            "green"
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
        currentRow *
        COLS;


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


        let displayResult =
            result[i];


        // ==========================================
        // GAME 3 — COLOURBLIND
        // ==========================================

        if (
            state.currentGame === 3 &&
            displayResult === "yellow"
        ) {

            displayResult =
                "gray";

        }


        tile.classList.add(
            displayResult
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
            guess[i]
                .toUpperCase();


        let next =
            result[i];


        // ==========================================
        // COLOURBLIND MODE
        // ==========================================

        if (
            state.currentGame === 3 &&
            next === "yellow"
        ) {

            next = "gray";

        }


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
        (
            guess,
            row
        ) => {

            // Don't try to restore a row
            // that no longer exists.

            if (
                row >= ROWS
            ) {

                return;

            }


            for (
                let i = 0;
                i < COLS;
                i++
            ) {

                const tile =
                    board.children[
                        row *
                        COLS +
                        i
                    ];


                if (!tile) {
                    continue;
                }


                tile.textContent =
                    guess[i]
                        .toUpperCase();


                tile.classList.add(
                    "filled"
                );


                let result =
                    game.results[
                        row
                    ][i];


                // Colourblind mode:
                // yellow becomes gray.

                if (
                    state.currentGame === 3 &&
                    result === "yellow"
                ) {

                    result =
                        "gray";

                }


                // Black letter:
                // show black tile internally.

                if (
                    state.currentGame === 1 &&
                    game.blackLetter &&
                    guess[i] ===
                    game.blackLetter
                ) {

                    tile.classList.add(
                        "black"
                    );

                }

                else {

                    tile.classList.add(
                        result
                    );

                }

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
            x =>
                x === "green"
        );


    if (
        solved ||
        game.completed
    ) {

        gameOver = true;


        currentRow =
            Math.min(
                game.guesses.length - 1,
                ROWS - 1
            );


        currentTile =
            COLS;


        stopTimer();

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

    if (gameOver) {
        return;
    }


    gameOver = true;


    stopTimer();


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


        if (
            attempts >= 1 &&
            attempts <= 6
        ) {

            state.distribution[
                attempts - 1
            ]++;

        }


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
    // NEXT GAME
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
    // ALL GAMES COMPLETE
    // ==========================================

    else {

        gameMessage.textContent =
            `You completed all ${GAMES_PER_DAY} Wordles today!`;

    }

}


// ==========================================
// TIMER
// ==========================================

function startTimer() {

    stopTimer();


    updateTimerDisplay();


    timerInterval =
        setInterval(
            () => {

                if (
                    gameOver
                ) {

                    stopTimer();

                    return;

                }


                timeRemaining--;


                const game =
                    state.games[2];


                game.timeRemaining =
                    timeRemaining;


                saveState();


                updateTimerDisplay();


                if (
                    timeRemaining <= 0
                ) {

                    timeOut();

                }

            },

            1000
        );

}


// ==========================================
// STOP TIMER
// ==========================================

function stopTimer() {

    if (
        timerInterval
    ) {

        clearInterval(
            timerInterval
        );

        timerInterval =
            null;

    }

}


// ==========================================
// TIMER DISPLAY
// ==========================================

function updateTimerDisplay() {

    if (
        state.currentGame !== 2
    ) {

        timerElement.textContent =
            "";

        return;

    }


    const minutes =
        Math.floor(
            timeRemaining / 60
        );


    const seconds =
        timeRemaining % 60;


    timerElement.textContent =
        `${minutes}:${String(
            seconds
        ).padStart(2, "0")}`;

}


// ==========================================
// TIME OUT
// ==========================================

function timeOut() {

    if (
        gameOver
    ) {

        return;

    }


    stopTimer();


    gameOver = true;


    const game =
        state.games[2];


    game.completed =
        true;


    state.played++;


    state.streak = 0;


    saveState();

    updateStatsModal();


    showToast(
        `Time's up! ${answer.toUpperCase()}`
    );


    if (
        state.currentGame <
        GAMES_PER_DAY
    ) {

        gameMessage.textContent =
            `Time's up! The word was ${answer.toUpperCase()}. Loading next puzzle...`;


        setTimeout(
            async () => {

                state.currentGame++;

                saveState();

                await loadCurrentGame();

            },

            1800
        );

    }

    else {

        gameMessage.textContent =
            `Time's up! The word was ${answer.toUpperCase()}`;

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
        .getElementById(
            "played"
        )
        .textContent =
            state.played;


    document
        .getElementById(
            "winRate"
        )
        .textContent =
            state.played

                ? Math.round(
                    state.wins /
                    state.played *
                    100
                )

                : 0;


    document
        .getElementById(
            "streak"
        )
        .textContent =
            state.streak;


    document
        .getElementById(
            "maxStreak"
        )
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


            row.innerHTML =
                `
                <span>
                    ${i + 1}
                </span>

                <div
                    class="dist-bar"
                    style="
                        width:
                        ${Math.max(
                            8,
                            count /
                            max *
                            100
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
    .getElementById(
        "helpBtn"
    )
    .addEventListener(
        "click",
        () =>
            openModal(
                "helpModal"
            )
    );


document
    .getElementById(
        "statsBtn"
    )
    .addEventListener(
        "click",
        () =>
            openModal(
                "statsModal"
            )
    );


document
    .querySelectorAll(
        "[data-close]"
    )
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
    .querySelectorAll(
        ".modal"
    )
    .forEach(
        modal =>
            modal.addEventListener(
                "click",
                event => {

                    if (
                        event.target ===
                        modal
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
