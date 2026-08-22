const board = document.getElementById("board");
const keyboard = document.getElementById("keyboard");
const toast = document.getElementById("toast");
const gameMessage = document.getElementById("gameMessage");

const ROWS = 6;
const COLS = 5;
const STORAGE_KEY = "wordle-clone-static-v1";

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
    guesses: [],
    results: [],
    played: 0,
    wins: 0,
    streak: 0,
    maxStreak: 0,
    distribution: [0, 0, 0, 0, 0, 0]
});

let state = loadState();

function loadState() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return saved && Array.isArray(saved.guesses) ? saved : emptyState();
    } catch {
        return emptyState();
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function todayKey() {
    return new Date().toISOString().slice(0, 10);
}

async function getDailyIndex(day) {
    const bytes = new TextEncoder().encode(day);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const view = new DataView(hash);
    return view.getUint32(0) % answerWords.length;
}

async function init() {
    createBoard();
    createKeyboard();

    try {
        const [allowedResponse, answersResponse] = await Promise.all([
            fetch("allowed.txt", { cache: "no-store" }),
            fetch("answers.txt", { cache: "no-store" })
        ]);

        if (!allowedResponse.ok || !answersResponse.ok) {
            throw new Error("Word lists could not be loaded");
        }

        const [allowedText, answersText] = await Promise.all([
            allowedResponse.text(),
            answersResponse.text()
        ]);

        allowedWords = new Set(allowedText.split(/\r?\n/).map(w => w.trim().toLowerCase()).filter(w => w.length === 5));
        answerWords = answersText.split(/\r?\n/).map(w => w.trim().toLowerCase()).filter(w => w.length === 5);

        const day = todayKey();
        const index = await getDailyIndex(day);
        answer = answerWords[index];

        if (state.day !== day) {
            state.day = day;
            state.guesses = [];
            state.results = [];
            saveState();
        } else {
            restoreGame();
        }

        updateStatsModal();
    } catch (error) {
        console.error(error);
        showToast("Could not load the word list");
    }
}

function createBoard() {
    board.innerHTML = "";
    for (let i = 0; i < ROWS * COLS; i++) {
        const tile = document.createElement("div");
        tile.className = "tile";
        board.appendChild(tile);
    }
}

function createKeyboard() {
    keyboard.innerHTML = "";
    const rows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

    rows.forEach((row, rowIndex) => {
        if (rowIndex === 2) addKey("ENTER", true);
        for (const letter of row) addKey(letter, false);
        if (rowIndex === 2) addKey("⌫", true);
    });
}

function addKey(label, wide) {
    const key = document.createElement("button");
    key.className = `key${wide ? " wide" : ""}`;
    key.textContent = label;
    key.dataset.key = label;
    key.setAttribute("aria-label", label === "⌫" ? "Backspace" : label);
    key.addEventListener("click", () => handleKey(label));
    keyboard.appendChild(key);
}

function handleKey(key) {
    if (gameOver || submitting || !answer) return;
    if (key === "ENTER") submitGuess();
    else if (key === "⌫") removeLetter();
    else addLetter(key);
}

function addLetter(letter) {
    if (currentTile >= COLS) return;
    const tile = board.children[currentRow * COLS + currentTile];
    tile.textContent = letter;
    tile.classList.add("filled", "pop");
    setTimeout(() => tile.classList.remove("pop"), 120);
    currentTile++;
}

function removeLetter() {
    if (currentTile <= 0) return;
    currentTile--;
    const tile = board.children[currentRow * COLS + currentTile];
    tile.textContent = "";
    tile.classList.remove("filled");
}

function currentGuess() {
    let guess = "";
    for (let i = 0; i < COLS; i++) {
        guess += board.children[currentRow * COLS + i].textContent;
    }
    return guess.toLowerCase();
}

async function submitGuess() {
    if (currentTile !== COLS || gameOver || submitting || !answer) {
        if (currentTile !== COLS && !gameOver) showToast("Not enough letters");
        return;
    }

    const guess = currentGuess();
    if (state.guesses.includes(guess)) {
        showToast("You already guessed that");
        return;
    }

    if (!allowedWords.has(guess) && !answerWords.includes(guess)) {
        showToast("Not in word list");
        return;
    }

    submitting = true;
    const result = scoreGuess(guess, answer);

    state.guesses.push(guess);
    state.results.push(result);
    saveState();

    await revealRow(result);
    updateKeyboard(result, guess);

    if (guess === answer) {
        finishGame(true, state.guesses.length);
    } else if (currentRow === ROWS - 1) {
        finishGame(false, state.guesses.length);
    } else {
        currentRow++;
        currentTile = 0;
    }

    submitting = false;
}

function scoreGuess(guess, target) {
    const result = ["gray", "gray", "gray", "gray", "gray"];
    const remaining = target.split("");

    for (let i = 0; i < COLS; i++) {
        if (guess[i] === target[i]) {
            result[i] = "green";
            remaining[i] = null;
        }
    }

    for (let i = 0; i < COLS; i++) {
        if (result[i] === "green") continue;
        const index = remaining.indexOf(guess[i]);
        if (index !== -1) {
            result[i] = "yellow";
            remaining[index] = null;
        }
    }

    return result;
}

async function revealRow(result) {
    const start = currentRow * COLS;
    for (let i = 0; i < COLS; i++) {
        const tile = board.children[start + i];
        tile.classList.add("flip");
        await new Promise(resolve => setTimeout(resolve, 110));
        tile.classList.remove("filled");
        tile.classList.add(result[i]);
        await new Promise(resolve => setTimeout(resolve, 60));
    }
}

function updateKeyboard(result, guess) {
    const priority = { gray: 1, yellow: 2, green: 3 };
    for (let i = 0; i < guess.length; i++) {
        const letter = guess[i].toUpperCase();
        const next = result[i];
        if (!keyStates[letter] || priority[next] > priority[keyStates[letter]]) {
            keyStates[letter] = next;
            const key = keyboard.querySelector(`[data-key="${letter}"]`);
            if (key) {
                key.classList.remove("green", "yellow", "gray");
                key.classList.add(next);
            }
        }
    }
}

function restoreGame() {
    state.guesses.forEach((guess, row) => {
        for (let i = 0; i < COLS; i++) {
            const tile = board.children[row * COLS + i];
            tile.textContent = guess[i].toUpperCase();
            tile.classList.add("filled", state.results[row][i]);
        }
        updateKeyboard(state.results[row], guess);
    });

    if (!state.results.length) return;

    const solved = state.results[state.results.length - 1].every(x => x === "green");
    if (solved || state.guesses.length >= ROWS) {
        gameOver = true;
        currentRow = Math.min(state.guesses.length - 1, ROWS - 1);
        currentTile = COLS;
        gameMessage.textContent = solved ? "Today's puzzle is complete." : `The word was ${answer.toUpperCase()}`;
    } else {
        currentRow = state.guesses.length;
        currentTile = 0;
    }
}

function finishGame(won, attempts) {
    gameOver = true;
    state.played++;

    if (won) {
        state.wins++;
        state.streak++;
        state.maxStreak = Math.max(state.maxStreak, state.streak);
        state.distribution[attempts - 1]++;
        gameMessage.textContent = `Solved in ${attempts}/6`;
        showToast("Great job!");
    } else {
        state.streak = 0;
        gameMessage.textContent = `The word was ${answer.toUpperCase()}`;
        showToast(answer.toUpperCase());
    }

    saveState();
    updateStatsModal();
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 1600);
}

function updateStatsModal() {
    document.getElementById("played").textContent = state.played;
    document.getElementById("winRate").textContent = state.played ? Math.round(state.wins / state.played * 100) : 0;
    document.getElementById("streak").textContent = state.streak;
    document.getElementById("maxStreak").textContent = state.maxStreak;

    const distribution = document.getElementById("distribution");
    distribution.innerHTML = "";
    const max = Math.max(1, ...state.distribution);
    state.distribution.forEach((count, i) => {
        const row = document.createElement("div");
        row.className = "dist-row";
        row.innerHTML = `<span>${i + 1}</span><div class="dist-bar" style="width:${Math.max(8, count / max * 100)}%">${count}</div>`;
        distribution.appendChild(row);
    });
}

function openModal(id) { document.getElementById(id).classList.remove("hidden"); }
function closeModal(id) { document.getElementById(id).classList.add("hidden"); }

document.getElementById("helpBtn").addEventListener("click", () => openModal("helpModal"));
document.getElementById("statsBtn").addEventListener("click", () => openModal("statsModal"));
document.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", () => closeModal(btn.dataset.close)));
document.querySelectorAll(".modal").forEach(modal => modal.addEventListener("click", e => {
    if (e.target === modal) modal.classList.add("hidden");
}));

document.addEventListener("keydown", event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toUpperCase();
    if (event.key === "Backspace") {
        event.preventDefault();
        handleKey("⌫");
    } else if (event.key === "Enter") {
        event.preventDefault();
        handleKey("ENTER");
    } else if (/^[A-Z]$/.test(key)) {
        handleKey(key);
    }
});

init();
