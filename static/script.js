const board = document.getElementById("board");
const keyboard = document.getElementById("keyboard");
const toast = document.getElementById("toast");
const gameMessage = document.getElementById("gameMessage");

const ROWS = 6;
const COLS = 5;

// ==========================================
// CHANGE THIS NUMBER TO CONTROL DAILY GAMES
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
// EMPTY STATE
// ==========================================

function createGames() {

    const games = {};

    for (let i = 1; i <= GAMES_PER_DAY; i++) {

        games[i] = {
            guesses: [],
            results: [],
            completed: false,
            penaltyCount: 0
        };

    }

    return games;
}


function emptyState() {

    return {

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

    };
}


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
            saved.games &&
            typeof saved.currentGame === "number"
        ) {

            // Make sure newer fields exist
            Object.values(saved.games).forEach(game => {

                if (!Array.isArray(game.guesses)) {
                    game.guesses = [];
                }

                if (!Array.isArray(game.results)) {
                    game.results = [];
                }

                if (typeof game.completed !== "boolean") {
                    game.completed = false;
                }

                if (typeof game.penaltyCount !== "number") {
                    game.penaltyCount = 0;
                }

            });

            return saved;
        }

    } catch (error) {

        console.error(
            "Could not load saved game:",
            error
        );

    }

    return emptyState();
}


// ==========================================
// SAVE STATE
// ==========================================

function saveState() {

    try {

        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(state)
        );

    } catch (error) {

        console.error(
            "Could not save game:",
            error
        );

    }
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
// DAILY WORD INDEX
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
// BLACK LETTER
// ==========================================
// Exactly ONE letter that does not appear
// anywhere in the answer.
//
// The result is deterministic.
// Therefore refreshing the page does NOT
// change the black letter.
// ==========================================

async function getBlackLetter(
    day,
    gameNumber,
    target
) {

    const alphabet =
        "abcdefghijklmnopqrstuvwxyz";

    const availableLetters =
        [...alphabet].filter(
            letter =>
                !target.includes(letter)
        );

    if (!availableLetters.length) {
        return "";
    }

    const seed =
        `${day}-black-letter-${gameNumber}`;

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
        availableLetters.length;

    return availableLetters[index];
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
                    .map(word =>
                        word
                            .trim()
                            .toLowerCase()
                    )
                    .filter(
                        word =>
                            word.length === COLS
                    )

            );

        answerWords =
            answersText
                .split(/\r?\n/)
                .map(word =>
                    word
                        .trim()
                        .toLowerCase()
                )
                .filter(
                    word =>
                        word.length === COLS
                );

        if (!answerWords.length) {

            throw new Error(
                "No answer words found"
            );

        }

        const today =
            todayKey();


        // ==========================================
        // NEW DAY
        // ==========================================

        if (state.day !== today) {

            const stats = {

                played:
                    Number(state.played) || 0,

                wins:
                    Number(state.wins) || 0,

                streak:
                    Number(state.streak) || 0,

                maxStreak:
                    Number(state.maxStreak) || 0,

                distribution:
                    Array.isArray(state.distribution)
                        ? state.distribution
                        : [0, 0, 0, 0, 0, 0]

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
        // HANDLE CHANGED GAME COUNT
        // ==========================================

        if (
            Object.keys(state.games).length !==
            GAMES_PER_DAY
        ) {

            const oldGames =
                state.games || {};

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

    submitting = false;


    // ==========================================
    // RESET KEYBOARD STATE
    // ==========================================

    for (
        const key in keyStates
    ) {

        delete keyStates[key];

    }

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
    // GET THE ONE BLACK LETTER
    // ==========================================

    blackLetter =
        await getBlackLetter(
            day,
            gameNumber,
            answer
        );


    const game =
        state.games[gameNumber];


    if (!game) {

        console.error(
            "Game data missing"
        );

        return;

    }


    // ==========================================
    // RESTORE GAME
    // ==========================================

    restoreGame(game);


    // ==========================================
    // MESSAGE
    // ==========================================

    if (game.completed) {

        if (
            gameNumber ===
            GAMES_PER_DAY
        ) {

            gameMessage.textContent =
                `You completed all ${GAMES_PER_DAY} Wordles today!`;

        } else {

            gameMessage.textContent =
                `Puzzle ${gameNumber} completed.`;

        }

    } else {

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

    key.type = "button";

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

    else if (
        /^[A-Z]$/.test(key)
    ) {

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
        () => tile.classList.remove("pop"),
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


    if (!game) {
        return;
    }


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


    submitting = true;


    // ==========================================
    // BLACK LETTER CHECK
    // ==========================================

    const hasBlackLetter =
        containsBlackLetter(guess);


    // ==========================================
    // NORMAL WORDLE SCORE
    // ==========================================

    const result =
        scoreGuess(
            guess,
            answer
        );


    // ==========================================
    // SAVE GUESS
    // ==========================================

    game.guesses.push(
        guess
    );

    game.results.push(
        result
    );


    if (hasBlackLetter) {

        game.penaltyCount++;

    }


    saveState();


    // ==========================================
    // SHOW NORMAL RESULT
    // ==========================================

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
            game.guesses.length,
            false
        );

        submitting = false;

        return;

    }


    // ==========================================
    // BLACK LETTER PENALTY
    // ==========================================

    if (hasBlackLetter) {

        showToast(
            `Black letter ${blackLetter.toUpperCase()}! -1 guess`
        );


        // Remove one available attempt.
        //
        // We don't delete the row containing
        // the guess because that would visually
        // erase what the player just entered.
        //
        // Instead, the bottom unused row is
        // permanently removed from the board.
        // ==========================================

        removeBottomRow();


        // If there are no attempts remaining,
        // the game ends immediately.
        //
        // A 6-row board becomes effectively
        // a 5-attempt game after one penalty.
        // ==========================================

        const availableRows =
            ROWS - game.penaltyCount;


        if (
            game.guesses.length >=
            availableRows
        ) {

            finishGame(
                false,
                game.guesses.length,
                true
            );

            submitting = false;

            return;

        }

    }


    // ==========================================
    // NORMAL LOSS CHECK
    // ==========================================

    if (
        currentRow >=
        ROWS - game.penaltyCount - 1
    ) {

        finishGame(
            false,
            game.guesses.length,
            false
        );

        submitting = false;

        return;

    }


    // ==========================================
    // NEXT ROW
    // ==========================================

    currentRow++;

    currentTile = 0;

    submitting = false;

}


// ==========================================
// REMOVE BOTTOM UNUSED ROW
// ==========================================

function removeBottomRow() {

    const bottomStart =
        (ROWS - 1) * COLS;

    for (
        let i = 0;
        i < COLS;
        i++
    ) {

        const tile =
            board.children[
                bottomStart + i
            ];

        if (tile) {

            tile.classList.add(
                "removed-row"
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


    // ==========================================
    // GREEN
    // ==========================================

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


    // ==========================================
    // YELLOW / BLACK
    // ==========================================

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


        // ==========================================
        // ONLY THE ONE SELECTED BLACK LETTER
        // ==========================================

        if (
            guess[i] ===
            blackLetter
        ) {

            result[i] =
                "black";

            continue;

        }


        // ==========================================
        // NORMAL YELLOW
        // ==========================================

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


        if (!tile) {
            continue;
        }


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
// UPDATE KEYBOARD
// ==========================================

function updateKeyboard(
    result,
    guess
) {

    const priority = {

        black: 1,

        gray: 2,

        yellow: 3,

        green: 4

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


        const key =
            keyboard.querySelector(
                `[data-key="${letter}"]`
            );


        if (!key) {
            continue;
        }


        if (
            !keyStates[letter] ||
            priority[next] >
            priority[keyStates[letter]]
        ) {

            keyStates[letter] =
                next;


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


// ==========================================
// RESTORE SAVED GAME
// ==========================================

function restoreGame(game) {

    if (
        !game ||
        !Array.isArray(game.guesses)
    ) {

        return;

    }


    game.guesses.forEach(
        (guess, row) => {

            if (
                row >= ROWS
            ) {

                return;

            }


            const result =
                game.results[row] ||
                scoreGuess(
                    guess,
                    answer
                );


            for (
                let i = 0;
                i < COLS;
                i++
            ) {

                const tile =
                    board.children[
                        row * COLS +
                        i
                    ];


                if (!tile) {
                    continue;
                }


                tile.textContent =
                    guess[i].toUpperCase();


                tile.classList.add(
                    "filled",
                    result[i]
                );

            }


            updateKeyboard(
                result,
                guess
            );

        }
    );


    // ==========================================
    // RESTORE REMOVED ROWS
    // ==========================================

    for (
        let penalty = 0;
        penalty < game.penaltyCount;
        penalty++
    ) {

        // We don't physically remove a tile
        // because board dimensions would change.
        //
        // Instead mark the corresponding
        // bottom rows as unavailable.
        const rowIndex =
            ROWS - 1 - penalty;


        if (
            rowIndex >= 0
        ) {

            for (
                let i = 0;
                i < COLS;
                i++
            ) {

                const tile =
                    board.children[
                        rowIndex * COLS +
                        i
                    ];


                if (
                    tile &&
                    !game.guesses[
                        rowIndex
                    ]
                ) {

                    tile.classList.add(
                        "removed-row"
                    );

                }

            }

        }

    }


    // ==========================================
    // DETERMINE GAME POSITION
    // ==========================================

    if (
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

        return;

    }


    if (
        game.guesses.length === 0
    ) {

        currentRow = 0;

        currentTile = 0;

        return;

    }


    const lastResult =
        game.results[
            game.results.length - 1
        ];


    const solved =
        lastResult &&
        lastResult.every(
            value =>
                value === "green"
        );


    if (solved) {

        gameOver = true;

        return;

    }


    const availableRows =
        ROWS - game.penaltyCount;


    if (
        game.guesses.length >=
        availableRows
    ) {

        gameOver = true;

        return;

    }


    currentRow =
        game.guesses.length;

    currentTile = 0;

}


// ==========================================
// FINISH GAME
// ==========================================

function finishGame(
    won,
    attempts,
    penaltyLoss
) {

    if (gameOver) {
        return;
    }


    gameOver = true;


    const game =
        state.games[
            state.currentGame
        ];


    if (!game) {
        return;
    }


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


        const distributionIndex =
            Math.min(
                attempts - 1,
                state.distribution.length - 1
            );


        if (
            distributionIndex >= 0
        ) {

            state.distribution[
                distributionIndex
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

        if (!penaltyLoss) {

            showToast(
                answer.toUpperCase()
            );

        }

    }


    saveState();

    updateStatsModal();


    // ==========================================
    // LOAD NEXT PUZZLE
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
            () => {
                toast.classList.remove(
                    "show"
                );
            },
            1800
        );

}


// ==========================================
// STATISTICS
// ==========================================

function updateStatsModal() {

    const played =
        document.getElementById(
            "played"
        );

    const winRate =
        document.getElementById(
            "winRate"
        );

    const streak =
        document.getElementById(
            "streak"
        );

    const maxStreak =
        document.getElementById(
            "maxStreak"
        );


    if (played) {

        played.textContent =
            state.played;

    }


    if (winRate) {

        winRate.textContent =
            state.played

                ? Math.round(
                    state.wins /
                    state.played *
                    100
                )

                : 0;

    }


    if (streak) {

        streak.textContent =
            state.streak;

    }


    if (maxStreak) {

        maxStreak.textContent =
            state.maxStreak;

    }


    const distribution =
        document.getElementById(
            "distribution"
        );


    if (!distribution) {
        return;
    }


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


            const number =
                document.createElement(
                    "span"
                );

            number.textContent =
                i + 1;


            const bar =
                document.createElement(
                    "div"
                );

            bar.className =
                "dist-bar";

            bar.style.width =
                `${Math.max(
                    8,
                    count / max * 100
                )}%`;

            bar.textContent =
                count;


            row.appendChild(
                number
            );

            row.appendChild(
                bar
            );

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

    const modal =
        document.getElementById(id);

    if (modal) {

        modal.classList.remove(
            "hidden"
        );

    }

}


function closeModal(id) {

    const modal =
        document.getElementById(id);

    if (modal) {

        modal.classList.add(
            "hidden"
        );

    }

}


const helpBtn =
    document.getElementById(
        "helpBtn"
    );

if (helpBtn) {

    helpBtn.addEventListener(
        "click",
        () =>
            openModal(
                "helpModal"
            )
    );

}


const statsBtn =
    document.getElementById(
        "statsBtn"
    );

if (statsBtn) {

    statsBtn.addEventListener(
        "click",
        () =>
            openModal(
                "statsModal"
            )
    );

}


document
    .querySelectorAll(
        "[data-close]"
    )
    .forEach(btn => {

        btn.addEventListener(
            "click",
            () =>
                closeModal(
                    btn.dataset.close
                )
        );

    });


document
    .querySelectorAll(
        ".modal"
    )
    .forEach(modal => {

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
        );

    });


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
