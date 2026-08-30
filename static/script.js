// ============================================
// WORD LISTS
// ============================================

let allowedWords = [];
let answerWords = [];


// ============================================
// GAME STATE
// ============================================

let secretWord = "";

let currentRow = 0;
let currentTile = 0;

let gameOver = false;

let currentGame = null;


// ============================================
// GET TODAY'S DATE
// ============================================

function getToday() {

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


// ============================================
// RANDOM DAILY UNLOCK TIMES
// ============================================

function getDailyChances() {

    const today = getToday();

    const savedDate =
        localStorage.getItem("wordleChanceDate");


    // Generate two new random times
    // when a new day starts

    if (savedDate !== today) {

        let chance1 =
            Math.floor(Math.random() * 1440);

        let chance2 =
            Math.floor(Math.random() * 1440);


        // Make sure the times are different

        while (chance2 === chance1) {

            chance2 =
                Math.floor(Math.random() * 1440);
        }


        const chances =
            [chance1, chance2].sort(
                (a, b) => a - b
            );


        localStorage.setItem(
            "wordleChanceDate",
            today
        );


        localStorage.setItem(
            "wordleDailyChances",
            JSON.stringify(chances)
        );


        // Reset completed games
        // for the new day

        localStorage.setItem(
            "wordleCompletedDate",
            today
        );


        localStorage.setItem(
            "wordleCompletedGames",
            "0"
        );


        return chances;
    }


    return JSON.parse(
        localStorage.getItem(
            "wordleDailyChances"
        )
    );
}


// ============================================
// GET CURRENT TIME IN MINUTES
// ============================================

function getCurrentMinutes() {

    const now = new Date();

    return (
        now.getHours() * 60 +
        now.getMinutes()
    );
}


// ============================================
// COUNT UNLOCKED GAMES
// ============================================

function getUnlockedGames() {

    const chances =
        getDailyChances();

    const currentMinutes =
        getCurrentMinutes();


    let unlocked = 0;


    for (let chance of chances) {

        if (currentMinutes >= chance) {

            unlocked++;
        }
    }


    return unlocked;
}


// ============================================
// GET COMPLETED GAMES
// ============================================

function getCompletedGames() {

    const today = getToday();

    const savedDate =
        localStorage.getItem(
            "wordleCompletedDate"
        );


    if (savedDate !== today) {

        localStorage.setItem(
            "wordleCompletedDate",
            today
        );


        localStorage.setItem(
            "wordleCompletedGames",
            "0"
        );


        return 0;
    }


    return parseInt(
        localStorage.getItem(
            "wordleCompletedGames"
        ) || "0"
    );
}


// ============================================
// CHECK IF PLAYER CAN PLAY
// ============================================

function canPlay() {

    const unlocked =
        getUnlockedGames();

    const completed =
        getCompletedGames();


    return completed < unlocked;
}


// ============================================
// GET ACTIVE GAME NUMBER
// ============================================

function getGameNumber() {

    return getCompletedGames() + 1;
}


// ============================================
// SAVE COMPLETED GAME
// ============================================

function completeGame() {

    let completed =
        getCompletedGames();

    completed++;


    localStorage.setItem(
        "wordleCompletedGames",
        completed
    );


    gameOver = true;
}


// ============================================
// GET A SECRET WORD
// ============================================

function getSecretWord(gameNumber) {

    const today = getToday();


    // Use today's date and game number
    // to consistently choose a word

    const seedString =
        today + "-" + gameNumber;


    let hash = 0;


    for (
        let i = 0;
        i < seedString.length;
        i++
    ) {

        hash =
            ((hash << 5) - hash) +
            seedString.charCodeAt(i);

        hash = hash & hash;
    }


    hash = Math.abs(hash);


    const index =
        hash % answerWords.length;


    return answerWords[index];
}


// ============================================
// FORMAT TIME
// ============================================

function formatTime(minutes) {

    const hours =
        Math.floor(minutes / 60);

    const mins =
        minutes % 60;


    const hour12 =
        hours % 12 || 12;


    const ampm =
        hours >= 12
            ? "PM"
            : "AM";


    return (
        hour12 +
        ":" +
        String(mins).padStart(2, "0") +
        " " +
        ampm
    );
}


// ============================================
// GET NEXT UNLOCK TIME
// ============================================

function getNextChance() {

    const chances =
        getDailyChances();

    const completed =
        getCompletedGames();


    if (completed >= 2) {

        return null;
    }


    return chances[completed];
}


// ============================================
// CREATE STATUS MESSAGE
// ============================================

function updateStatus() {

    let status =
        document.getElementById(
            "game-status"
        );


    if (!status) {

        status =
            document.createElement("div");

        status.id =
            "game-status";

        document.body.insertBefore(
            status,
            document.getElementById("board")
        );
    }


    const completed =
        getCompletedGames();


    const unlocked =
        getUnlockedGames();


    if (completed >= 2) {

        status.innerText =
            "You completed both Wordles today! Come back tomorrow.";

        return;
    }


    if (canPlay()) {

        status.innerText =
            `Wordle ${completed + 1} is ready!`;

        return;
    }


    const nextChance =
        getNextChance();


    status.innerText =
        `Next Wordle unlocks at ${formatTime(nextChance)}`;
}


// ============================================
// CREATE BOARD
// ============================================

const board =
    document.getElementById("board");


function createBoard() {

    board.innerHTML = "";


    for (
        let i = 0;
        i < 30;
        i++
    ) {

        const tile =
            document.createElement("div");


        tile.classList.add("tile");


        board.appendChild(tile);
    }
}


// ============================================
// RESET BOARD
// ============================================

function resetBoard() {

    currentRow = 0;

    currentTile = 0;

    gameOver = false;


    createBoard();


    currentGame =
        getGameNumber();


    secretWord =
        getSecretWord(currentGame);


    console.log(
        "Secret word:",
        secretWord
    );
}


// ============================================
// ADD LETTER
// ============================================

function addLetter(letter) {

    if (gameOver) {

        return;
    }


    if (!canPlay()) {

        alert(
            "Your next Wordle is not unlocked yet!"
        );

        return;
    }


    if (currentTile < 5) {

        const tile =
            board.children[
                currentRow * 5 +
                currentTile
            ];


        tile.innerText =
            letter.toUpperCase();


        currentTile++;
    }
}


// ============================================
// DELETE LETTER
// ============================================

function deleteLetter() {

    if (gameOver) {

        return;
    }


    if (!canPlay()) {

        return;
    }


    if (currentTile > 0) {

        currentTile--;


        const tile =
            board.children[
                currentRow * 5 +
                currentTile
            ];


        tile.innerText = "";
    }
}


// ============================================
// CHECK WORDLE GUESS
// ============================================

function checkGuess(guess) {

    const result =
        Array(5).fill("gray");


    const remaining =
        secretWord.split("");


    // FIRST PASS
    // Check greens

    for (
        let i = 0;
        i < 5;
        i++
    ) {

        if (
            guess[i] ===
            secretWord[i]
        ) {

            result[i] =
                "green";


            remaining[i] =
                null;
        }
    }


    // SECOND PASS
    // Check yellows

    for (
        let i = 0;
        i < 5;
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


// ============================================
// UPDATE KEYBOARD
// ============================================

function updateKeyboard(
    guess,
    result
) {

    for (
        let i = 0;
        i < 5;
        i++
    ) {

        const key =
            document.querySelector(
                `[data-letter="${guess[i].toUpperCase()}"]`
            );


        if (!key) {

            continue;
        }


        const newResult =
            result[i];


        // Green should never be replaced

        if (
            key.classList.contains(
                "green"
            )
        ) {

            continue;
        }


        // Yellow should not be replaced
        // by gray

        if (
            key.classList.contains(
                "yellow"
            ) &&
            newResult === "gray"
        ) {

            continue;
        }


        key.classList.remove(
            "gray",
            "yellow",
            "green"
        );


        key.classList.add(
            newResult
        );
    }
}


// ============================================
// SUBMIT GUESS
// ============================================

function submitGuess() {

    if (gameOver) {

        return;
    }


    if (!canPlay()) {

        alert(
            "Your next Wordle is not unlocked yet!"
        );

        return;
    }


    if (currentTile !== 5) {

        alert(
            "Enter a 5-letter word"
        );

        return;
    }


    let guess = "";


    for (
        let i = 0;
        i < 5;
        i++
    ) {

        guess +=
            board.children[
                currentRow * 5 + i
            ].innerText.toLowerCase();
    }


    // Validate word

    if (
        !allowedWords.includes(
            guess
        )
    ) {

        alert(
            "Not in word list"
        );

        return;
    }


    // Check result

    const result =
        checkGuess(guess);


    // Color tiles

    for (
        let i = 0;
        i < 5;
        i++
    ) {

        const tile =
            board.children[
                currentRow * 5 + i
            ];


        tile.classList.add(
            result[i]
        );
    }


    // Update keyboard

    updateKeyboard(
        guess,
        result
    );


    // Check win

    if (
        guess === secretWord
    ) {

        completeGame();

        updateStatus();


        setTimeout(
            function() {

                alert(
                    "You won!"
                );

            },
            300
        );


        return;
    }


    // Move to next row

    currentRow++;

    currentTile = 0;


    // Check loss

    if (currentRow === 6) {

        completeGame();

        updateStatus();


        setTimeout(
            function() {

                alert(
                    `Game over! The word was ${secretWord.toUpperCase()}`
                );

            },
            300
        );


        return;
    }
}


// ============================================
// CREATE KEYBOARD
// ============================================

const keyboard =
    document.getElementById(
        "keyboard"
    );


function createKeyboard() {

    keyboard.innerHTML = "";


    const rows = [

        "QWERTYUIOP",

        "ASDFGHJKL",

        "ZXCVBNM"
    ];


    rows.forEach(
        function(row, rowIndex) {

            const rowDiv =
                document.createElement(
                    "div"
                );


            rowDiv.classList.add(
                "keyboard-row"
            );


            // Add ENTER to last row

            if (rowIndex === 2) {

                const enter =
                    document.createElement(
                        "button"
                    );


                enter.innerText =
                    "ENTER";


                enter.classList.add(
                    "key",
                    "wide-key"
                );


                enter.addEventListener(
                    "click",
                    submitGuess
                );


                rowDiv.appendChild(
                    enter
                );
            }


            // Create letters

            for (
                let letter of row
            ) {

                const key =
                    document.createElement(
                        "button"
                    );


                key.innerText =
                    letter;


                key.dataset.letter =
                    letter;


                key.classList.add(
                    "key"
                );


                key.addEventListener(
                    "click",
                    function() {

                        addLetter(
                            letter
                        );

                    }
                );


                rowDiv.appendChild(
                    key
                );
            }


            // Add BACKSPACE to last row

            if (rowIndex === 2) {

                const backspace =
                    document.createElement(
                        "button"
                    );


                backspace.innerText =
                    "⌫";


                backspace.classList.add(
                    "key",
                    "wide-key"
                );


                backspace.addEventListener(
                    "click",
                    deleteLetter
                );


                rowDiv.appendChild(
                    backspace
                );
            }


            keyboard.appendChild(
                rowDiv
            );
        }
    );
}


// ============================================
// PHYSICAL KEYBOARD
// ============================================

document.addEventListener(
    "keydown",
    function(event) {

        const key =
            event.key.toUpperCase();


        if (
            key.length === 1 &&
            key >= "A" &&
            key <= "Z"
        ) {

            addLetter(key);
        }


        else if (
            event.key ===
            "Backspace"
        ) {

            deleteLetter();
        }


        else if (
            event.key ===
            "Enter"
        ) {

            submitGuess();
        }
    }
);


// ============================================
// COUNTDOWN / CHECK NEW DAY
// ============================================

setInterval(
    function() {

        updateStatus();


        // If a new chance becomes
        // available, reset the game

        if (
            !gameOver &&
            canPlay() &&
            !secretWord
        ) {

            resetBoard();
        }

    },
    30000
);


// ============================================
// LOAD WORD LISTS
// ============================================

async function loadWords() {

    const allowedResponse =
        await fetch(
            "allowed.txt"
        );


    const answersResponse =
        await fetch(
            "answers.txt"
        );


    const allowedText =
        await allowedResponse.text();


    const answersText =
        await answersResponse.text();


    allowedWords =
        allowedText
            .split("\n")
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


    answerWords =
        answersText
            .split("\n")
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


    startGame();
}


// ============================================
// START GAME
// ============================================

function startGame() {

    createBoard();

    createKeyboard();

    updateStatus();


    if (canPlay()) {

        resetBoard();

    }

    else {

        gameOver = true;
    }
}


// ============================================
// START APPLICATION
// ============================================

loadWords();
