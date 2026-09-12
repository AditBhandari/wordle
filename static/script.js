const board = document.getElementById("board");
const keyboard = document.getElementById("keyboard");
const toast = document.getElementById("toast");
const gameMessage = document.getElementById("gameMessage");

const gameModeElement = document.getElementById("gameMode");
const timerElement = document.getElementById("timer");
const blackLetterDisplay = document.getElementById("blackLetterDisplay");
const blackLetterElement = document.getElementById("blackLetter");

const ROWS = 6;
const COLS = 5;

/*
==================================================
CHANGE NUMBER OF GAMES HERE
==================================================
*/

const GAMES_PER_DAY = 3;


/*
==================================================
GAME TYPES
==================================================
*/

const GAME_TYPES = {

    1: {
        name: "TIME CHALLENGE",
        type: "timed"
    },

    2: {
        name: "GREEN ONLY",
        type: "greenOnly"
    },

    3: {
        name: "BLACK LETTER",
        type: "blackLetter"
    }

};


/*
==================================================
TIME LIMIT FOR GAME 1
==================================================
*/

const TIME_LIMIT_SECONDS = 120;


/*
==================================================
STORAGE
==================================================
*/

const STORAGE_KEY =
    "wordle-no-mercy-v5";


/*
==================================================
GAME VARIABLES
==================================================
*/

let allowedWords = new Set();

let answerWords = [];

let answer = "";

let currentRow = 0;

let currentTile = 0;

let gameOver = false;

let submitting = false;

let timerInterval = null;

const keyStates = {};


/*
==================================================
EMPTY STATE
==================================================
*/

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

            timedOut: false,

            timeRemaining:
                null,

            timerStartedAt:
                null,

            timerEndsAt:
                null,

            blackLetter:
                null,

            blackUsed:
                false,

            lostGuesses:
                0

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


/*
==================================================
LOAD STATE
==================================================
*/

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

    }

    catch (error) {

        console.error(
            "Could not load saved game:",
            error
        );

    }


    return emptyState();

}


/*
==================================================
SAVE STATE
==================================================
*/

function saveState() {

    localStorage.setItem(

        STORAGE_KEY,

        JSON.stringify(state)

    );

}


/*
==================================================
TODAY
==================================================
*/

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

    return (
        `${year}-${month}-${day}`
    );

}


/*
==================================================
GET DAILY WORD INDEX
==================================================
*/

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


/*
==================================================
GET CURRENT GAME OBJECT
==================================================
*/

function getCurrentGame() {

    return state.games[
        state.currentGame
    ];

}


/*
==================================================
GET GAME TYPE
==================================================
*/

function getGameType() {

    const config =
        GAME_TYPES[
            state.currentGame
        ];

    return config
        ? config.type
        : "normal";

}


/*
==================================================
INITIALIZE
==================================================
*/

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
                    cache:
                        "no-store"
                }
            ),

            fetch(
                "answers.txt",
                {
                    cache:
                        "no-store"
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


        if (
            answerWords.length === 0
        ) {

            throw new Error(
                "answers.txt is empty"
            );

        }


        const today =
            todayKey();


        /*
        ==========================================
        NEW DAY
        ==========================================
        */

        if (
            state.day !== today
        ) {

            const oldStats = {

                played:
                    Number(
                        state.played || 0
                    ),

                wins:
                    Number(
                        state.wins || 0
                    ),

                streak:
                    Number(
                        state.streak || 0
                    ),

                maxStreak:
                    Number(
                        state.maxStreak || 0
                    ),

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

                games:
                    createGames(),

                ...oldStats

            };


            saveState();

        }


        /*
        ==========================================
        IF GAME COUNT CHANGED
        ==========================================
        */

        const existingGameCount =
            Object.keys(
                state.games || {}
            ).length;


        if (
            existingGameCount !==
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

                if (
                    oldGames[i]
                ) {

                    state.games[i] = {

                        ...state.games[i],

                        ...oldGames[i]

                    };

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


/*
==================================================
LOAD CURRENT GAME
==================================================
*/

async function loadCurrentGame() {

    stopTimer();


    currentRow = 0;

    currentTile = 0;

    gameOver = false;

    submitting = false;


    /*
    ==========================================
    RESET KEYBOARD
    ==========================================
    */

    for (
        const key in keyStates
    ) {

        delete keyStates[key];

    }


    /*
    ==========================================
    RESET BOARD
    ==========================================
    */

    createBoard();

    createKeyboard();


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
        getCurrentGame();


    /*
    ==========================================
    SETUP GAME UI
    ==========================================
    */

    setupGameUI();


    /*
    ==========================================
    SETUP BLACK LETTER
    ==========================================
    */

    if (
        getGameType() ===
        "blackLetter"
    ) {

        setupBlackLetter(
            game
        );

    }


    /*
    ==========================================
    RESTORE PREVIOUS GAME
    ==========================================
    */

    restoreGame(game);


    /*
    ==========================================
    START / RESTORE TIMER
    ==========================================
    */

    if (
        getGameType() ===
        "timed"
    ) {

        setupTimer(game);

    }


    /*
    ==========================================
    MESSAGE
    ==========================================
    */

    if (
        game.completed
    ) {

        if (
            game.timedOut
        ) {

            gameMessage.textContent =
                `Time's up! The word was ${answer.toUpperCase()}`;

        }

        else if (
            state.currentGame ===
            GAMES_PER_DAY
        ) {

            gameMessage.textContent =
                `You completed all ${GAMES_PER_DAY} Wordles today!`;

        }

        else {

            gameMessage.textContent =
                `Puzzle ${state.currentGame} completed.`;

        }

    }

    else {

        gameMessage.textContent =
            `Puzzle ${state.currentGame} of ${GAMES_PER_DAY}`;

    }

}


/*
==================================================
SETUP GAME UI
==================================================
*/

function setupGameUI() {

    const config =
        GAME_TYPES[
            state.currentGame
        ];


    if (config) {

        gameModeElement.textContent =
            `PUZZLE ${state.currentGame} — ${config.name}`;

    }

    else {

        gameModeElement.textContent =
            `PUZZLE ${state.currentGame}`;

    }


    timerElement.classList.add(
        "hidden"
    );


    timerElement.classList.remove(
        "warning"
    );


    blackLetterDisplay.classList.add(
        "hidden"
    );

}


/*
==================================================
SETUP BLACK LETTER
==================================================
*/

function setupBlackLetter(game) {

    /*
    Only letters NOT present in answer
    can become black letters.
    */

    if (
        !game.blackLetter
    ) {

        const alphabet =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ";


        const safeLetters =
            alphabet
                .split("")
                .filter(
                    letter =>
                        !answer
                            .toUpperCase()
                            .includes(
                                letter
                            )
                );


        const randomIndex =
            Math.floor(
                Math.random() *
                safeLetters.length
            );


        game.blackLetter =
            safeLetters[
                randomIndex
            ];

        saveState();

    }


    blackLetterElement.textContent =
        game.blackLetter;


    blackLetterDisplay.classList.remove(
        "hidden"
    );

}


/*
==================================================
CREATE BOARD
==================================================
*/

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


/*
==================================================
CREATE KEYBOARD
==================================================
*/

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


/*
==================================================
ADD KEY
==================================================
*/

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


/*
==================================================
HANDLE KEY
==================================================
*/

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


/*
==================================================
ADD LETTER
==================================================
*/

function addLetter(letter) {

    if (
        currentTile >=
        COLS
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
            tile.classList.remove(
                "pop"
            ),
        120
    );


    currentTile++;

}


/*
==================================================
REMOVE LETTER
==================================================
*/

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


/*
==================================================
CURRENT GUESS
==================================================
*/

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


/*
==================================================
SUBMIT GUESS
==================================================
*/

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
        getCurrentGame();


    /*
    ==========================================
    DUPLICATE GUESS
    ==========================================
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
    ==========================================
    VALID WORD
    ==========================================
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


    submitting = true;


    /*
    ==========================================
    BLACK LETTER CHECK
    ==========================================
    */

    const gameType =
        getGameType();


    let usedBlackLetter =
        false;


    if (
        gameType ===
        "blackLetter"
    ) {

        const black =
            game.blackLetter
                .toLowerCase();


        if (
            guess.includes(black)
        ) {

            usedBlackLetter =
                true;

        }

    }


    /*
    ==========================================
    SCORE
    ==========================================
    */

    const result =
        scoreGuess(
            guess,
            answer
        );


    /*
    ==========================================
    SAVE GUESS
    ==========================================
    */

    game.guesses.push(
        guess
    );


    game.results.push(
        result
    );


    if (
        usedBlackLetter
    ) {

        game.blackUsed =
            true;

        game.lostGuesses++;

    }


    saveState();


    /*
    ==========================================
    REVEAL
    ==========================================
    */

    await revealRow(
        result,
        guess,
        usedBlackLetter
    );


    /*
    ==========================================
    KEYBOARD
    ==========================================
    */

    updateKeyboard(
        result,
        guess,
        usedBlackLetter
    );


    /*
    ==========================================
    WIN
    ==========================================
    */

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


    /*
    ==========================================
    BLACK LETTER PENALTY
    ==========================================
    */

    if (
        usedBlackLetter
    ) {

        /*
        Remove the LAST row from the board.
        This genuinely reduces the number of
        guesses available to the player.
        */

        removeLastBoardRow();


        /*
        If the player was already on the final
        remaining row, there are now no
        opportunities left.
        */

        if (
            currentRow >=
            getAvailableRows() - 1
        ) {

            finishGame(
                false,
                game.guesses.length
            );

            submitting = false;

            return;

        }

    }


    /*
    ==========================================
    NORMAL LOSS
    ==========================================
    */

    if (
        currentRow >=
        getAvailableRows() - 1
    ) {

        finishGame(
            false,
            game.guesses.length
        );

        submitting = false;

        return;

    }


    /*
    ==========================================
    NEXT ROW
    ==========================================
    */

    currentRow++;

    currentTile = 0;

    submitting = false;

}


/*
==================================================
AVAILABLE ROWS

Normal = 6

Each black-letter hit = minus 1
==================================================
*/

function getAvailableRows() {

    const game =
        getCurrentGame();


    return Math.max(
        1,
        ROWS -
        Number(
            game.lostGuesses || 0
        )
    );

}


/*
==================================================
REMOVE LAST BOARD ROW
==================================================
*/

function removeLastBoardRow() {

    /*
    The physical last five tiles are removed.
    */

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


/*
==================================================
SCORE GUESS
==================================================
*/

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
    GREEN
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
    YELLOW
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


/*
==================================================
REVEAL ROW
==================================================
*/

async function revealRow(
    result,
    guess,
    usedBlackLetter
) {

    const start =
        currentRow *
        COLS;


    const gameType =
        getGameType();


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


        await wait(110);


        tile.classList.remove(
            "filled"
        );


        /*
        ==========================================
        BLACK LETTER
        ==========================================
        */

        if (
            usedBlackLetter &&
            guess[i].toUpperCase() ===
            getCurrentGame()
                .blackLetter
        ) {

            tile.classList.remove(
                "green",
                "yellow",
                "gray"
            );

            tile.classList.add(
                "black"
            );

            tile.textContent =
                guess[i]
                    .toUpperCase();

        }


        /*
        ==========================================
        GREEN ONLY
        ==========================================
        */

        else if (
            gameType ===
            "greenOnly"
        ) {

            if (
                result[i] ===
                "green"
            ) {

                tile.classList.add(
                    "green"
                );

                tile.textContent =
                    guess[i]
                        .toUpperCase();

            }

            else {

                /*
                Hide the entire tile.
                No yellow or gray letter
                remains visible.
                */

                tile.textContent =
                    "";

                tile.classList.add(
                    "hidden-letter"
                );

            }

        }


        /*
        ==========================================
        NORMAL / TIMED
        ==========================================
        */

        else {

            tile.classList.add(
                result[i]
            );

        }


        await wait(60);

    }

}


/*
==================================================
WAIT HELPER
==================================================
*/

function wait(ms) {

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );

}


/*
==================================================
UPDATE KEYBOARD
==================================================
*/

function updateKeyboard(
    result,
    guess,
    usedBlackLetter
) {

    const priority = {

        gray: 1,

        yellow: 2,

        green: 3

    };


    const gameType =
        getGameType();


    for (
        let i = 0;
        i < guess.length;
        i++
    ) {

        const letter =
            guess[i]
                .toUpperCase();


        /*
        ==========================================
        BLACK LETTER
        ==========================================
        */

        if (
            usedBlackLetter &&
            letter ===
            getCurrentGame()
                .blackLetter
        ) {

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
                    "black"
                );

            }


            continue;

        }


        /*
        ==========================================
        GREEN ONLY MODE
        ==========================================
        */

        if (
            gameType ===
            "greenOnly"
        ) {

            /*
            Only green keys are colored.
            Yellow and gray information is hidden.
            */

            if (
                result[i] ===
                "green"
            ) {

                const key =
                    keyboard.querySelector(
                        `[data-key="${letter}"]`
                    );


                if (key) {

                    key.classList.remove(
                        "yellow",
                        "gray"
                    );

                    key.classList.add(
                        "green"
                    );

                }

            }


            continue;

        }


        /*
        ==========================================
        NORMAL KEYBOARD
        ==========================================
        */

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


/*
==================================================
RESTORE GAME
==================================================
*/

function restoreGame(game) {

    /*
    ==========================================
    RESTORE BLACK LETTER
    ==========================================
    */

    if (
        getGameType() ===
        "blackLetter" &&
        game.blackLetter
    ) {

        blackLetterElement.textContent =
            game.blackLetter;

        blackLetterDisplay.classList.remove(
            "hidden"
        );

    }


    /*
    ==========================================
    RESTORE GUESSES
    ==========================================
    */

    game.guesses.forEach(
        (
            guess,
            row
        ) => {

            const result =
                game.results[row];


            if (!result) {
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


                const letter =
                    guess[i]
                        .toUpperCase();


                /*
                ==========================================
                GREEN ONLY
                ==========================================
                */

                if (
                    getGameType() ===
                    "greenOnly"
                ) {

                    if (
                        result[i] ===
                        "green"
                    ) {

                        tile.textContent =
                            letter;

                        tile.classList.add(
                            "filled",
                            "green"
                        );

                    }

                    else {

                        tile.textContent =
                            "";

                        tile.classList.add(
                            "hidden-letter"
                        );

                    }

                }


                /*
                ==========================================
                BLACK LETTER
                ==========================================
                */

                else if (
                    getGameType() ===
                    "blackLetter" &&
                    game.blackLetter &&
                    letter ===
                    game.blackLetter
                ) {

                    tile.textContent =
                        letter;

                    tile.classList.add(
                        "filled",
                        "black"
                    );

                }


                /*
                ==========================================
                NORMAL / TIMED
                ==========================================
                */

                else {

                    tile.textContent =
                        letter;

                    tile.classList.add(
                        "filled",
                        result[i]
                    );

                }

            }


            updateKeyboard(
                result,
                guess,
                game.blackLetter &&
                guess.includes(
                    game.blackLetter
                        .toLowerCase()
                )
            );

        }
    );


    /*
    ==========================================
    REMOVE PENALTY ROWS AGAIN
    ==========================================
    */

    if (
        getGameType() ===
        "blackLetter"
    ) {

        const lost =
            Number(
                game.lostGuesses || 0
            );


        for (
            let i = 0;
            i < lost;
            i++
        ) {

            removeLastBoardRow();

        }

    }


    /*
    ==========================================
    DETERMINE CURRENT POSITION
    ==========================================
    */

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


    currentRow =
        game.guesses.length;


    currentTile = 0;


    /*
    Safety check.
    */

    if (
        currentRow >=
        getAvailableRows()
    ) {

        gameOver = true;

    }

}


/*
==================================================
FINISH GAME
==================================================
*/

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
        getCurrentGame();


    game.completed =
        true;


    /*
    ==========================================
    TOTAL PLAYED
    ==========================================
    */

    state.played++;


    /*
    ==========================================
    WIN
    ==========================================
    */

    if (won) {

        state.wins++;


        state.streak++;


        state.maxStreak =
            Math.max(
                state.maxStreak,
                state.streak
            );


        /*
        Prevent invalid distribution index.
        */

        const distributionIndex =
            Math.min(
                5,
                Math.max(
                    0,
                    attempts - 1
                )
            );


        state.distribution[
            distributionIndex
        ]++;


        gameMessage.textContent =
            `Solved in ${attempts} guesses!`;


        showToast(
            "Great job!"
        );

    }


    /*
    ==========================================
    LOSS
    ==========================================
    */

    else {

        state.streak = 0;


        if (
            game.timedOut
        ) {

            gameMessage.textContent =
                `Time's up! The word was ${answer.toUpperCase()}`;

            showToast(
                answer.toUpperCase()
            );

        }

        else {

            gameMessage.textContent =
                `The word was ${answer.toUpperCase()}`;

            showToast(
                answer.toUpperCase()
            );

        }

    }


    saveState();

    updateStatsModal();


    /*
    ==========================================
    NEXT GAME
    ==========================================
    */

    if (
        state.currentGame <
        GAMES_PER_DAY
    ) {

        gameMessage.textContent +=
            ` Loading Puzzle ${state.currentGame + 1}...`;


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


/*
==================================================
TIMER
==================================================
*/

function setupTimer(game) {

    timerElement.classList.remove(
        "hidden"
    );


    /*
    ==========================================
    FIRST START
    ==========================================
    */

    if (
        !game.timerEndsAt
    ) {

        const now =
            Date.now();


        game.timerStartedAt =
            now;


        game.timerEndsAt =
            now +
            TIME_LIMIT_SECONDS *
            1000;


        game.timeRemaining =
            TIME_LIMIT_SECONDS;


        saveState();

    }


    updateTimer();


    timerInterval =
        setInterval(
            updateTimer,
            250
        );

}


/*
==================================================
UPDATE TIMER
==================================================
*/

function updateTimer() {

    if (
        gameOver
    ) {

        stopTimer();

        return;

    }


    const game =
        getCurrentGame();


    if (
        !game ||
        !game.timerEndsAt
    ) {

        return;

    }


    const remainingMs =
        game.timerEndsAt -
        Date.now();


    const remainingSeconds =
        Math.max(
            0,
            Math.ceil(
                remainingMs / 1000
            )
        );


    game.timeRemaining =
        remainingSeconds;


    const minutes =
        Math.floor(
            remainingSeconds / 60
        );


    const seconds =
        remainingSeconds % 60;


    timerElement.textContent =
        `${minutes}:${String(seconds).padStart(2, "0")}`;


    /*
    Warning under 30 seconds.
    */

    if (
        remainingSeconds <= 30
    ) {

        timerElement.classList.add(
            "warning"
        );

    }

    else {

        timerElement.classList.remove(
            "warning"
        );

    }


    /*
    TIME UP
    */

    if (
        remainingSeconds <= 0
    ) {

        timeUp();

    }

}


/*
==================================================
TIME UP
==================================================
*/

function timeUp() {

    if (
        gameOver
    ) {

        return;

    }


    const game =
        getCurrentGame();


    game.timedOut =
        true;


    game.completed =
        true;


    game.timeRemaining =
        0;


    saveState();


    finishGame(
        false,
        game.guesses.length
    );

}


/*
==================================================
STOP TIMER
==================================================
*/

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


/*
==================================================
TOAST
==================================================
*/

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


/*
==================================================
STATISTICS
==================================================
*/

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


            const barWidth =
                Math.max(
                    8,
                    count /
                    max *
                    100
                );


            row.innerHTML = `

                <span>
                    ${i + 1}
                </span>

                <div
                    class="dist-bar"
                    style="
                        width:${barWidth}%;
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


/*
==================================================
MODALS
==================================================
*/

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


/*
==================================================
PHYSICAL KEYBOARD
==================================================
*/

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


/*
==================================================
START
==================================================
*/

init();
