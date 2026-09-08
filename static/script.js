const board = document.getElementById("board");
const keyboard = document.getElementById("keyboard");
const toast = document.getElementById("toast");
const gameMessage = document.getElementById("gameMessage");

const ROWS = 6;
const COLS = 5;

// ==========================================
// CHANGE THIS NUMBER
// ==========================================

const GAMES_PER_DAY = 3;

const STORAGE_KEY = "wordle-clone-black-v1";

let allowedWords = new Set();
let answerWords = [];

let answer = "";
let blackLetter = "";

let currentRow = 0;
let currentTile = 0;

let availableRows = ROWS;

let gameOver = false;
let submitting = false;

const keyStates = {};


// ==========================================
// CREATE GAMES
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

            penalties: 0

        };

    }

    return games;

}


// ==========================================
// EMPTY STATE
// ==========================================

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


// ==========================================
// LOAD STATE
// ==========================================

let state = loadState();

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
// TODAY'S DATE
// ==========================================

function todayKey() {

    const now = new Date();

    const year =
        now.getFullYear();

    const month =
        String(
            now.getMonth() + 1
        ).padStart(
            2,
            "0"
        );

    const day =
        String(
            now.getDate()
        ).padStart(
            2,
            "0"
        );

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
        new TextEncoder().encode(
            seed
        );

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
// ==========================================

async function getBlackLetter(
    day,
    gameNumber,
    answer
) {

    const alphabet =
        "abcdefghijklmnopqrstuvwxyz";

    // Only letters that DON'T appear
    // anywhere in the answer

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
        new TextEncoder().encode(
            seed
        );

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


        // ==========================================
        // LOAD ALLOWED WORDS
        // ==========================================

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


        // ==========================================
        // LOAD ANSWERS
        // ==========================================

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


        if (
            answerWords.length === 0
        ) {

            throw new Error(
                "Answer list is empty"
            );

        }


        const today =
            todayKey();


        // ==========================================
        // NEW DAY
        // ==========================================

        if (
            state.day !== today
        ) {

            const oldStats = {

                played:
                    state.played || 0,

                wins:
                    state.wins || 0,

                streak:
                    state.streak || 0,

                maxStreak:
                    state.maxStreak || 0,

                distribution:
                    Array.isArray(
                        state.distribution
                    )
                        ? state.distribution
                        : [
                            0,
                            0,
                            0,
                            0,
                            0,
                            0
                        ]

            };


            state = {

                day: today,

                currentGame: 1,

                games: createGames(),

                ...oldStats

            };


            saveState();

        }


        // ==========================================
        // GAME COUNT CHANGED
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

    currentRow = 0;

    currentTile = 0;

    gameOver = false;

    submitting = false;


    // ==========================================
    // RESET KEYBOARD
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
    // CURRENT GAME
    // ==========================================

    const gameNumber =
        state.currentGame;

    const game =
        state.games[
            gameNumber
        ];


    // ==========================================
    // CALCULATE AVAILABLE ROWS
    // ==========================================

    const penalties =
        game.penalties || 0;

    availableRows =
        ROWS - penalties;


    if (
        availableRows < 1
    ) {

        availableRows = 1;

    }


    // ==========================================
    // CREATE BOARD WITH ONLY
    // AVAILABLE NUMBER OF ROWS
    // ==========================================

    createBoard(
        availableRows
    );


    // ==========================================
    // GET TODAY'S ANSWER
    // ==========================================

    const day =
        todayKey();

    const answerIndex =
        await getDailyIndex(
            day,
            gameNumber
        );

    answer =
        answerWords[
            answerIndex
        ];


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
        "Puzzle:",
        gameNumber,
        "Answer:",
        answer,
        "Black letter:",
        blackLetter
    );


    // ==========================================
    // RESTORE PREVIOUS GAME
    // ==========================================

    restoreGame(game);


    // ==========================================
    // MESSAGE
    // ==========================================

    if (
        game.completed
    ) {

        if (
            gameNumber ===
            GAMES_PER_DAY
        ) {

            gameMessage.textContent =
                `You completed all ${GAMES_PER_DAY} Wordles today!`;

        }

        else {

            gameMessage.textContent =
                `Puzzle ${gameNumber} completed.`;

        }

    }

    else {

        gameMessage.textContent =
            `Puzzle ${gameNumber} of ${GAMES_PER_DAY}`;

    }

}


// ==========================================
// CREATE BOARD
// ==========================================

function createBoard(
    rows = ROWS
) {

    board.innerHTML = "";

    for (
        let i = 0;
        i < rows * COLS;
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


            // ENTER

            if (
                rowIndex === 2
            ) {

                addKey(
                    "ENTER",
                    true,
                    rowDiv
                );

            }


            // LETTERS

            for (
                const letter of row
            ) {

                addKey(
                    letter,
                    false,
                    rowDiv
                );

            }


            // BACKSPACE

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
        currentTile >= COLS
    ) {

        return;

    }


    const tile =
        board.children[
            currentRow *
            COLS +
            currentTile
        ];


    if (!tile) {

        return;

    }


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


    if (!tile) {

        return;

    }


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

        const tile =
            board.children[
                currentRow *
                COLS +
                i
            ];


        if (tile) {

            guess +=
                tile.textContent;

        }

    }


    return guess.toLowerCase();

}


// ==========================================
// CHECK BLACK LETTER
// ==========================================

function containsBlackLetter(
    guess
) {

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
    // ALREADY GUESSED
    // ==========================================

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


    submitting = true;


    // ==========================================
    // BLACK LETTER
    // ==========================================

    if (
        containsBlackLetter(
            guess
        )
    ) {

        await handleBlackLetter(
            guess,
            game
        );

        submitting = false;

        return;

    }


    // ==========================================
    // NORMAL GUESS
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


    // ==========================================
    // REVEAL
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
            game.guesses.length
        );

        submitting = false;

        return;

    }


    // ==========================================
    // NO MORE ROWS
    // ==========================================

    if (
        currentRow >=
        availableRows - 1
    ) {

        finishGame(
            false,
            game.guesses.length
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
// HANDLE BLACK LETTER
// ==========================================

async function handleBlackLetter(
    guess,
    game
) {

    // ==========================================
    // SHOW BLACK GUESS
    // ==========================================

    await revealBlackRow();


    // ==========================================
    // SAVE PENALTY
    // ==========================================

    game.penalties =
        (game.penalties || 0) + 1;


    saveState();


    showToast(
        `BLACK LETTER! -1 GUESS`
    );


    // ==========================================
    // REMOVE LAST ROW FROM GRID
    // ==========================================

    removeLastRow();


    // ==========================================
    // REDUCE AVAILABLE ROWS
    // ==========================================

    availableRows--;


    // ==========================================
    // IF NO ROWS REMAIN
    // ==========================================

    if (
        availableRows <= 0
    ) {

        game.completed = true;

        state.played++;

        state.streak = 0;

        saveState();

        updateStatsModal();

        gameOver = true;

        gameMessage.textContent =
            `The word was ${answer.toUpperCase()}`;

        showToast(
            answer.toUpperCase()
        );

        return;

    }


    // ==========================================
    // MAKE SURE CURRENT ROW
    // STILL EXISTS
    // ==========================================

    if (
        currentRow >=
        availableRows
    ) {

        currentRow =
            availableRows - 1;

    }


    currentTile = 0;


    gameMessage.textContent =
        `Black letter! ${availableRows} guesses remaining.`;

}


// ==========================================
// REVEAL BLACK ROW
// ==========================================

async function revealBlackRow() {

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
                    100
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
                    50
                )
        );

    }


    await new Promise(
        resolve =>
            setTimeout(
                resolve,
                500
            )
    );

}


// ==========================================
// REMOVE LAST ROW
// ==========================================

function removeLastRow() {

    for (
        let i = 0;
        i < COLS;
        i++
    ) {

        const lastTile =
            board.lastElementChild;


        if (
            lastTile
        ) {

            lastTile.remove();

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
    // YELLOW
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

async function revealRow(
    result
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

    const penalties =
        game.penalties || 0;


    availableRows =
        ROWS - penalties;


    if (
        availableRows < 1
    ) {

        availableRows = 1;

    }


    // ==========================================
    // RESTORE GUESSES
    // ==========================================

    game.guesses.forEach(
        (
            guess,
            row
        ) => {

            // Don't restore more rows
            // than currently exist

            if (
                row >= availableRows
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


                const result =
                    game.results[row];


                if (
                    result
                ) {

                    tile.classList.add(
                        "filled",
                        result[i]
                    );

                }

            }


            if (
                game.results[row]
            ) {

                updateKeyboard(
                    game.results[row],
                    guess
                );

            }

        }
    );


    // ==========================================
    // CHECK COMPLETION
    // ==========================================

    if (
        game.completed
    ) {

        gameOver = true;

        currentRow =
            Math.max(
                0,
                Math.min(
                    game.guesses.length - 1,
                    availableRows - 1
                )
            );

        currentTile = COLS;

        return;

    }


    // ==========================================
    // FIND NEXT EMPTY ROW
    // ==========================================

    currentRow =
        game.guesses.length;


    if (
        currentRow >=
        availableRows
    ) {

        currentRow =
            availableRows - 1;

        gameOver = true;

    }


    currentTile = 0;

}


// ==========================================
// FINISH GAME
// ==========================================

function finishGame(
    won,
    attempts
) {

    if (
        gameOver
    ) {

        return;

    }


    gameOver = true;


    const game =
        state.games[
            state.currentGame
        ];


    game.completed =
        true;


    state.played++;


    // ==========================================
    // WIN
    // ==========================================

    if (
        won
    ) {

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


    // ==========================================
    // LOSS
    // ==========================================

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


    // ==========================================
    // ALL PUZZLES FINISHED
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

            handleKey(
                "⌫"
            );

        }

        else if (
            event.key ===
            "Enter"
        ) {

            event.preventDefault();

            handleKey(
                "ENTER"
            );

        }

        else if (
            /^[A-Z]$/.test(
                key
            )
        ) {

            handleKey(
                key
            );

        }

    }
);


// ==========================================
// START
// ==========================================

init();
