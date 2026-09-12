const board =
    document.getElementById("board");

const keyboard =
    document.getElementById("keyboard");

const toast =
    document.getElementById("toast");

const gameMessage =
    document.getElementById("gameMessage");

const gameMode =
    document.getElementById("gameMode");

const gameDescription =
    document.getElementById("gameDescription");

const timerElement =
    document.getElementById("timer");


const ROWS = 6;
const COLS = 5;

const GAMES_PER_DAY = 3;

const TIMER_SECONDS = 60;

const STORAGE_KEY =
    "wordle-clone-static-v5";

const RESULTS_KEY =
    "wordle-no-mercy-results-v1";


/* ==========================================
   GAME MODES
========================================== */

const GAME_MODES = {

    1: {
        name: "BLACK LETTER",

        description:
            "One secret letter costs you a guess.",

        type: "black"
    },

    2: {
        name: "TIMER",

        description:
            "Solve the word before time runs out.",

        type: "timer"
    },

    3: {
        name: "COLOURBLIND",

        description:
            "Green letters show. Yellow letters stay grey.",

        type: "colourblind"
    }

};


/* ==========================================
   VARIABLES
========================================== */

let allowedWords =
    new Set();

let answerWords =
    [];

let answer =
    "";

let currentRow =
    0;

let currentTile =
    0;

let gameOver =
    false;

let submitting =
    false;

let maxRows =
    ROWS;

let currentBlackLetter =
    "";

let timerInterval =
    null;

let timeRemaining =
    TIMER_SECONDS;

const keyStates =
    {};


/* ==========================================
   EMPTY STATE
========================================== */

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


/* ==========================================
   CREATE GAMES
========================================== */

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

            won: false,

            attempts: 0,

            blackTriggered: false,

            timeTaken: null

        };

    }

    return games;
}


/* ==========================================
   LOAD STATE
========================================== */

let state =
    loadState();


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


/* ==========================================
   SAVE
========================================== */

function saveState() {

    localStorage.setItem(

        STORAGE_KEY,

        JSON.stringify(state)

    );

}


/* ==========================================
   TODAY
========================================== */

function todayKey() {

    const now =
        new Date();

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


/* ==========================================
   DAILY WORD
========================================== */

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


/* ==========================================
   INITIALIZE
========================================== */

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


        /*
         * NEW DAY
         */

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


        /*
         * HANDLE CHANGE
         * IN NUMBER OF GAMES
         */

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


/* ==========================================
   LOAD CURRENT GAME
========================================== */

async function loadCurrentGame() {

    stopTimer();

    currentRow =
        0;

    currentTile =
        0;

    maxRows =
        ROWS;

    gameOver =
        false;

    submitting =
        false;

    currentBlackLetter =
        "";

    resetKeyboard();

    createBoard();


    const gameNumber =
        state.currentGame;


    const mode =
        GAME_MODES[
            gameNumber
        ];


    /*
     * UPDATE MODE TEXT
     */

    gameMode.textContent =
        mode.name;

    gameDescription.textContent =
        mode.description;


    /*
     * GET ANSWER
     */

    const index =
        await getDailyIndex(
            todayKey(),
            gameNumber
        );


    answer =
        answerWords[index];


    /*
     * BLACK LETTER
     */

    if (
        mode.type ===
        "black"
    ) {

        currentBlackLetter =
            chooseBlackLetter(
                answer
            );

    }


    /*
     * RESTORE SAVED GAME
     */

    const game =
        state.games[
            gameNumber
        ];


    restoreGame(game);


    /*
     * TIMER
     */

    if (
        mode.type ===
        "timer" &&
        !game.completed
    ) {

        startTimer();

    }


    /*
     * GAME ALREADY COMPLETED
     */

    if (
        game.completed
    ) {

        gameOver =
            true;

        gameMessage.textContent =
            game.won
                ? `Puzzle ${gameNumber} solved!`
                : `Puzzle ${gameNumber} lost.`;

    }

    else {

        gameMessage.textContent =
            `Puzzle ${gameNumber} of ${GAMES_PER_DAY}`;

    }

}


/* ==========================================
   BLACK LETTER
========================================== */

function chooseBlackLetter(
    target
) {

    const alphabet =
        "abcdefghijklmnopqrstuvwxyz";

    const available =
        alphabet
            .split("")
            .filter(
                letter =>
                    !target.includes(letter)
            );


    if (
        available.length === 0
    ) {

        return "";

    }


    /*
     * Deterministic secret letter.
     *
     * This means the same puzzle
     * always has the same black letter.
     */

    let hash = 0;

    const seed =
        `${todayKey()}-${state.currentGame}-${target}`;

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


    return available[
        hash % available.length
    ];

}


/* ==========================================
   BOARD
========================================== */

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


/* ==========================================
   KEYBOARD
========================================== */

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


/* ==========================================
   ADD KEY
========================================== */

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


/* ==========================================
   RESET KEYBOARD
========================================== */

function resetKeyboard() {

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

}


/* ==========================================
   HANDLE KEY
========================================== */

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


/* ==========================================
   ADD LETTER
========================================== */

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


/* ==========================================
   REMOVE LETTER
========================================== */

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


/* ==========================================
   CURRENT GUESS
========================================== */

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


/* ==========================================
   SUBMIT
========================================== */

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


    /*
     * DUPLICATE
     */

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


    /*
     * VALID WORD
     */

    if (
        !allowedWords.has(guess) &&
        !answerWords.includes(guess)
    ) {

        showToast(
            "Not in word list"
        );

        return;

    }


    submitting =
        true;


    /*
     * CHECK BLACK LETTER
     */

    const mode =
        GAME_MODES[
            state.currentGame
        ];


    const containsBlack =
        mode.type === "black" &&
        currentBlackLetter &&
        guess.includes(
            currentBlackLetter
        );


    /*
     * SCORE
     */

    let result =
        scoreGuess(
            guess,
            answer
        );


    /*
     * COLOURBLIND MODE
     *
     * Yellow becomes gray.
     */

    if (
        mode.type ===
        "colourblind"
    ) {

        result =
            result.map(
                tile =>
                    tile === "yellow"
                        ? "gray"
                        : tile
            );

    }


    /*
     * SAVE GUESS
     */

    game.guesses.push(
        guess
    );

    game.results.push(
        result
    );


    /*
     * BLACK LETTER WAS USED
     */

    if (
        containsBlack
    ) {

        game.blackTriggered =
            true;

    }


    game.attempts =
        game.guesses.length;


    saveState();


    /*
     * REVEAL
     */

    await revealRow(
        result,
        guess,
        containsBlack
    );


    updateKeyboard(
        result,
        guess
    );


    /*
     * WIN
     */

    if (
        guess === answer
    ) {

        finishGame(
            true,
            game.guesses.length
        );

        submitting =
            false;

        return;

    }


    /*
     * BLACK LETTER:
     *
     * remove LAST ROW of board.
     *
     * This permanently reduces
     * the number of guesses.
     */

    if (
        containsBlack &&
        mode.type === "black"
    ) {

        maxRows--;

        removeLastBoardRow();


        /*
         * If the black letter was
         * triggered on the final
         * available opportunity,
         * the player loses.
         */

        if (
            currentRow >= maxRows
        ) {

            finishGame(
                false,
                game.guesses.length
            );

            submitting =
                false;

            return;

        }

    }


    /*
     * TIMER EXPIRED
     */

    if (
        mode.type === "timer" &&
        timeRemaining <= 0
    ) {

        finishGame(
            false,
            game.guesses.length
        );

        submitting =
            false;

        return;

    }


    /*
     * NORMAL ROW LIMIT
     */

    if (
        currentRow >=
        maxRows - 1
    ) {

        finishGame(
            false,
            game.guesses.length
        );

        submitting =
            false;

        return;

    }


    /*
     * NEXT ROW
     */

    currentRow++;

    currentTile =
        0;

    submitting =
        false;

}


/* ==========================================
   REMOVE LAST ROW
========================================== */

function removeLastBoardRow() {

    const lastRow =
        maxRows;

    /*
     * We don't remove DOM elements
     * because the grid must retain
     * its structure.
     *
     * Instead the last available
     * row is hidden.
     */

    for (
        let i = 0;
        i < COLS;
        i++
    ) {

        const index =
            lastRow *
            COLS +
            i;

        if (
            board.children[index]
        ) {

            board.children[index]
                .style.display =
                "none";

        }

    }

}


/* ==========================================
   SCORE GUESS
========================================== */

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


    /*
     * GREEN FIRST
     */

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


    /*
     * YELLOW SECOND
     */

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


/* ==========================================
   REVEAL ROW
========================================== */

async function revealRow(
    result,
    guess,
    containsBlack
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


        await wait(110);


        tile.classList.remove(
            "filled"
        );


        tile.classList.add(
            result[i]
        );


        /*
         * BLACK LETTER
         *
         * ONLY the actual black
         * letter becomes black.
         *
         * Nothing else is black.
         */

        if (
            containsBlack &&
            guess[i] ===
            currentBlackLetter
        ) {

            tile.classList.remove(
                "green",
                "yellow",
                "gray"
            );

            tile.classList.add(
                "black"
            );

        }


        await wait(60);

    }

}


/* ==========================================
   UPDATE KEYBOARD
========================================== */

function updateKeyboard(
    result,
    guess
) {

    const priority = {

        gray: 1,

        yellow: 2,

        green: 3,

        black: 4

    };


    for (
        let i = 0;
        i < guess.length;
        i++
    ) {

        const letter =
            guess[i]
                .toUpperCase();


        const next =
            result[i];


        /*
         * COLOURBLIND:
         *
         * Yellow is already converted
         * to gray, so it won't appear
         * yellow on keyboard.
         */

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


/* ==========================================
   RESTORE GAME
========================================== */

function restoreGame(game) {

    if (
        !game ||
        !game.guesses
    ) {

        return;

    }


    const mode =
        GAME_MODES[
            state.currentGame
        ];


    /*
     * Restore black mode's
     * reduced number of guesses.
     */

    if (
        mode.type === "black" &&
        game.blackTriggered
    ) {

        maxRows =
            ROWS - 1;

    }


    game.guesses.forEach(
        (
            guess,
            row
        ) => {

            if (
                row >= ROWS
            ) {

                return;

            }


            const savedResult =
                game.results[row];


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


                tile.textContent =
                    guess[i]
                        .toUpperCase();


                tile.classList.add(
                    "filled"
                );


                if (
                    savedResult &&
                    savedResult[i]
                ) {

                    tile.classList.add(
                        savedResult[i]
                    );

                }

            }


            updateKeyboard(
                savedResult,
                guess
            );

        }
    );


    /*
     * Hide consumed last row
     * in black mode.
     */

    if (
        mode.type === "black" &&
        game.blackTriggered
    ) {

        const lastRow =
            ROWS - 1;


        for (
            let i = 0;
            i < COLS;
            i++
        ) {

            const tile =
                board.children[
                    lastRow *
                    COLS +
                    i
                ];


            if (
                tile &&
                game.guesses.length <=
                lastRow
            ) {

                tile.style.display =
                    "none";

            }

        }

    }


    /*
     * Restore current position
     */

    if (
        game.completed
    ) {

        gameOver =
            true;

        currentRow =
            Math.min(
                game.guesses.length - 1,
                ROWS - 1
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


/* ==========================================
   FINISH GAME
========================================== */

function finishGame(
    won,
    attempts
) {

    if (
        gameOver
    ) {

        return;

    }


    gameOver =
        true;


    stopTimer();


    const gameNumber =
        state.currentGame;


    const game =
        state.games[
            gameNumber
        ];


    game.completed =
        true;

    game.won =
        won;

    game.attempts =
        attempts;


    state.played++;


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


        state.distribution[
            attempts - 1
        ]++;


        showToast(
            "Great job!"
        );

        gameMessage.textContent =
            `Puzzle ${gameNumber} solved!`;

    }

    else {

        state.streak =
            0;


        showToast(
            answer.toUpperCase()
        );


        gameMessage.textContent =
            `The word was ${answer.toUpperCase()}`;

    }


    saveState();

    updateStatsModal();


    /*
     * NEXT GAME
     */

    if (
        gameNumber <
        GAMES_PER_DAY
    ) {

        setTimeout(
            async () => {

                state.currentGame =
                    gameNumber + 1;

                saveState();

                await loadCurrentGame();

            },
            1800
        );

    }

    else {

        /*
         * ALL THREE COMPLETE
         */

        gameMessage.textContent =
            "All three challenges complete!";

        setTimeout(
            () => {

                goToResultsPage();

            },
            1400
        );

    }

}


/* ==========================================
   RESULTS PAGE
========================================== */

function goToResultsPage() {

    window.location.href =
        "results.html";

}


/* ==========================================
   TIMER
========================================== */

function startTimer() {

    stopTimer();


    const game =
        state.games[
            state.currentGame
        ];


    /*
     * If restored game has
     * timeTaken, don't restart.
     */

    if (
        game.completed
    ) {

        return;

    }


    timeRemaining =
        TIMER_SECONDS;


    timerElement.classList.remove(
        "hidden",
        "danger"
    );


    updateTimerDisplay();


    timerInterval =
        setInterval(
            () => {

                timeRemaining--;

                updateTimerDisplay();


                if (
                    timeRemaining <= 0
                ) {

                    timeRemaining =
                        0;

                    stopTimer();

                    showToast(
                        "Time's up!"
                    );


                    finishGame(
                        false,
                        state.games[
                            state.currentGame
                        ].guesses.length
                    );

                }

            },
            1000
        );

}


/* ==========================================
   TIMER DISPLAY
========================================== */

function updateTimerDisplay() {

    timerElement.textContent =
        `${timeRemaining}s`;


    if (
        timeRemaining <= 10
    ) {

        timerElement.classList.add(
            "danger"
        );

    }

}


/* ==========================================
   STOP TIMER
========================================== */

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


    timerElement.classList.add(
        "hidden"
    );

}


/* ==========================================
   WAIT
========================================== */

function wait(ms) {

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );

}


/* ==========================================
   TOAST
========================================== */

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


/* ==========================================
   STATISTICS
========================================== */

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
                <span>${i + 1}</span>

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


/* ==========================================
   MODALS
========================================== */

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
            openModal(
                "helpModal"
            )
    );


document
    .getElementById("statsBtn")
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
    .querySelectorAll(".modal")
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


/* ==========================================
   PHYSICAL KEYBOARD
========================================== */

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
            /^[A-Z]$/.test(key)
        ) {

            handleKey(
                key
            );

        }

    }
);


/* ==========================================
   START
========================================== */

init();
