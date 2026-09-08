const board = document.getElementById("board");
const keyboard = document.getElementById("keyboard");
const toast = document.getElementById("toast");
const gameMessage = document.getElementById("gameMessage");

const ROWS = 6;
const COLS = 5;

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
// CREATE DAILY GAMES
// ==========================================

function createGames() {

    const games = {};

    for (let i = 1; i <= GAMES_PER_DAY; i++) {

        games[i] = {

            guesses: [],

            results: [],

            completed: false,

            // Number of guesses still available
            maxAttempts: ROWS

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

            // Make sure old games get maxAttempts
            Object.keys(saved.games).forEach(gameNumber => {

                if (
                    !saved.games[gameNumber].maxAttempts
                ) {

                    saved.games[gameNumber].maxAttempts = ROWS;

                }

            });

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
        String(now.getMonth() + 1)
            .padStart(2, "0");

    const day =
        String(now.getDate())
            .padStart(2, "0");

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
// ==========================================

async function getBlackLetter(
    day,
    gameNumber,
    target
) {

    const alphabet =
        "abcdefghijklmnopqrstuvwxyz";

    // Only letters NOT present in answer
    const possibleLetters =
        alphabet
            .split("")
            .filter(
                letter =>
                    !target.includes(letter)
            );

    if (!possibleLetters.length) {
        return "";
    }

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

                day:
                    today,

                currentGame:
                    1,

                games:
                    createGames(),

                ...stats

            };


            saveState();

        }


        // ==========================================
        // NUMBER OF GAMES CHANGED
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


    // Clear keyboard states

    for (
        const key in keyStates
    ) {

        delete keyStates[key];

    }


    // Clear keyboard colors

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


    // Create fresh board

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


    // Generate black letter

    blackLetter =
        await getBlackLetter(
            day,
            gameNumber,
            answer
        );


    const game =
        state.games[
            gameNumber
        ];


    // Make sure maxAttempts exists

    if (
        !game.maxAttempts ||
        game.maxAttempts > ROWS
    ) {

        game.maxAttempts =
            ROWS;

        saveState();

    }


    // Restore board using the number
    // of attempts still available

    restoreGame(game);


    // ==========================================
    // MARK BLACK LETTER
    // ==========================================

    if (blackLetter) {

        const blackKey =
            keyboard.querySelector(
                `[data-key="${blackLetter.toUpperCase()}"]`
            );

        if (blackKey) {

            blackKey.classList.add("black");

        }

    }


    // ==========================================
    // MESSAGE
    // ==========================================

    if (game.completed) {

        if (
            gameNumber === GAMES_PER_DAY
        ) {

            gameMessage.textContent =
                `You completed all ${GAMES_PER_DAY} Wordles today!`;

        }
        else {

            gameMessage.textContent =
                `Puzzle ${gameNumber} complete`;

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
// SUBMIT GUESS
// ==========================================

async function submitGuess() {

    const game =
        state.games[
            state.currentGame
        ];


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
    // CHECK BLACK LETTER
    // ==========================================

    const usedBlackLetter =
        blackLetter &&
        guess.includes(blackLetter);


    // ==========================================
    // SCORE GUESS
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
    // REVEAL GUESS
    // ==========================================

    await revealRow(
        result
    );


    updateKeyboard(
        result,
        guess
    );


    // ==========================================
    // BLACK LETTER PENALTY
    // ==========================================

    if (
        usedBlackLetter
    ) {

        showToast(
            `Black letter! -1 guess`
        );


        // Reduce available guesses

        if (
            game.maxAttempts > 1
        ) {

            game.maxAttempts--;

        }


        saveState();


        // ==========================================
        // REMOVE THE LAST UNUSED ROW
        // ==========================================

        removeLastUnusedRow(
            game
        );

    }


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
    // CHECK AVAILABLE ATTEMPTS
    // ==========================================

    if (
        game.guesses.length >=
        game.maxAttempts
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

    currentRow =
        game.guesses.length;

    currentTile =
        0;


    submitting = false;

}


// ==========================================
// REMOVE LAST UNUSED ROW
// ==========================================

function removeLastUnusedRow(game) {

    /*
        Example:

        6 rows initially

        Guess 1 contains black letter

        maxAttempts becomes 5

        Rows 1-5 remain.
        Row 6 disappears.
    */


    const unusedRows =
        ROWS -
        game.guesses.length;


    if (
        unusedRows <= 0
    ) {

        return;

    }


    const rowToRemove =
        game.maxAttempts;


    // Remove exactly the row at the
    // new maximum attempt position.

    for (
        let i = 0;
        i < COLS;
        i++
    ) {

        const index =
            rowToRemove * COLS -
            COLS +
            i;


        const tile =
            board.children[index];


        if (tile) {

            tile.remove();

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


    // GREEN

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


    // YELLOW

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


    // Re-add black styling if necessary

    if (blackLetter) {

        const blackKey =
            keyboard.querySelector(
                `[data-key="${blackLetter.toUpperCase()}"]`
            );


        if (blackKey) {

            blackKey.classList.remove(
                "green",
                "yellow",
                "gray"
            );

            blackKey.classList.add(
                "black"
            );

        }

    }

}


// ==========================================
// RESTORE GAME
// ==========================================

function restoreGame(game) {

    // Restore guesses

    game.guesses.forEach(
        (
            guess,
            row
        ) => {

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
                    game.results[row][i]
                );

            }


            updateKeyboard(
                game.results[row],
                guess
            );

        }
    );


    // ==========================================
    // REMOVE PENALTY ROWS
    // ==========================================

    const rowsToRemove =
        ROWS -
        game.maxAttempts;


    for (
        let i = 0;
        i < rowsToRemove;
        i++
    ) {

        removeLastUnusedRow(
            {
                ...game,
                guesses: game.guesses
            }
        );

    }


    // ==========================================
    // GAME OVER
    // ==========================================

    if (
        game.completed
    ) {

        gameOver = true;

        currentRow =
            Math.max(
                0,
                game.guesses.length - 1
            );

        currentTile =
            COLS;

        return;

    }


    // ==========================================
    // CHECK MAX ATTEMPTS
    // ==========================================

    if (
        game.guesses.length >=
        game.maxAttempts
    ) {

        gameOver = true;

        currentRow =
            Math.max(
                0,
                game.maxAttempts - 1
            );

        currentTile =
            COLS;

        return;

    }


    currentRow =
        game.guesses.length;

    currentTile =
        0;

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


    if (
        game.completed
    ) {

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


        state.distribution[
            Math.min(
                attempts - 1,
                5
            )
        ]++;


        gameMessage.textContent =
            `Solved in ${attempts} guesses`;

        showToast(
            "Great job!"
        );

    }

    else {

        state.streak =
            0;


        gameMessage.textContent =
            `The word was ${answer.toUpperCase()}`;

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
